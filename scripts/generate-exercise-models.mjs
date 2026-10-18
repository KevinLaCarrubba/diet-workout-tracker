// Generates the original 3D exercise demo library (tooling, not runtime).
//
//   node scripts/generate-exercise-models.mjs
//
// Builds ONE stylised mannequin (rigid ellipsoid/capsule parts on a joint
// hierarchy) plus simple props, then bakes one looping "demo" AnimationClip per
// exercise and writes public/models/exercises/<slug>.glb and manifest.json.
//
// Exercises are data (scripts/exercise-models/library-*.mjs): each entry is a
// set of key poses (root position, torso angles, limb angles or IK targets), a
// timeline and a list of props. Poses are eased between keys, sampled at FPS,
// and limbs with IK targets are solved per frame so planted feet and hands stay
// put. Props are data too: boxes, cable columns, attachments, and "links"
// (cables and levers) re-stretched every frame between two endpoints.
//
// Coordinates: metres, +Y up, the mannequin faces +Z, its left side is +X.
// Angle conventions (degrees): flex > 0 swings a limb forward/up, abd > 0 swings
// it out to the side, knee/elbow > 0 bends the joint, torso > 0 tips the upper
// body forward, twist > 0 turns it to its left, root pitch > 0 tips the whole
// body forward (face down).
//
// Pose fields:
//   root: [x,y,z] hips position; rootPitch / rootYaw: whole-body orientation
//   torso / twist / sideBend: split across spine and chest; neck: head pitch
//   armL/armR/legL/legR:
//     { flex, abd, elbow|knee, world? }  forward kinematics (world: angles relative to vertical)
//     { ik, frame?, pole }               two-bone IK; ik is a point [x,y,z] or
//                                        { arc: { center, radius, angle, plane, sx?, offset? } }
//                                        (plane 'yz': 0° = down, 90° = forward;
//                                         'xz': 0° = forward, 90° = to +X; 'xy': 0° = down, 90° = to +X)
//     legs also take footPitch (foot orientation in world when planted)
// Prop fields: { type, id?, attach?, position?, rotation?, between?, offset?, from?, to?, ... }
//   between: [jointA, jointB] places the prop at their midpoint every frame
//   link props take endpoints: [x,y,z] | { node, offset? } | { prop, local? } |
//     { knot: { a, b, toward, length } } (rope centre between two hands)
// Timeline: keys [[at 0..1, poseName]]; first == last for a clean loop.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { format, resolveConfig } from 'prettier';
import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { DEG, MUSCLE_MESHES, PLATE_RADIUS, PROP_BUILDERS, buildMannequin } from './exercise-models/kit.mjs';
import { COACH_EXERCISES } from './exercise-models/library-coach.mjs';
import { CORE_EXERCISES } from './exercise-models/library-core.mjs';

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'models', 'exercises');
const FPS = 20;
const EXERCISES = [...CORE_EXERCISES, ...COACH_EXERCISES];

// GLTFExporter uses FileReader to assemble the binary; Node only ships Blob.
if (typeof globalThis.FileReader === 'undefined') {
  globalThis.FileReader = class FileReader {
    result = null;
    onloadend = null;
    readAsArrayBuffer(blob) {
      blob.arrayBuffer().then((buffer) => {
        this.result = buffer;
        this.onloadend?.();
      });
    }
    readAsDataURL(blob) {
      blob.arrayBuffer().then((buffer) => {
        this.result = `data:${blob.type || 'application/octet-stream'};base64,${Buffer.from(buffer).toString('base64')}`;
        this.onloadend?.();
      });
    }
  };
}

// ---------------------------------------------------------------------------
// Pose evaluation
// ---------------------------------------------------------------------------

const ease = (t) => t * t * (3 - 2 * t);
function lerpValue(a, b, t) {
  if (typeof a === 'number') return a + (b - a) * t;
  if (Array.isArray(a)) return a.map((v, i) => lerpValue(v, b[i], t));
  if (a && typeof a === 'object') {
    const out = {};
    for (const key of Object.keys(a)) out[key] = b && key in b ? lerpValue(a[key], b[key], t) : a[key];
    return out;
  }
  return a;
}

function poseAt(exercise, u) {
  const { keys, poses } = exercise;
  for (let i = 0; i < keys.length - 1; i += 1) {
    const [t0, p0] = keys[i];
    const [t1, p1] = keys[i + 1];
    if (u >= t0 && u <= t1) {
      const f = t1 === t0 ? 0 : ease((u - t0) / (t1 - t0));
      return lerpValue(poses[p0], poses[p1], f);
    }
  }
  return poses[keys[keys.length - 1][1]];
}

const v3 = (a) => new THREE.Vector3(...a);
const tmpQ = new THREE.Quaternion();

function worldQuat(node) {
  return node.getWorldQuaternion(new THREE.Quaternion());
}

/** Orientation whose local -Y points along `dir` and local +Z toward `front`. */
function basisQuat(dir, front) {
  const y = dir.clone().negate();
  const z = front.clone().sub(y.clone().multiplyScalar(front.dot(y)));
  if (z.lengthSq() < 1e-8) z.set(0, 0, 1);
  z.normalize();
  const x = new THREE.Vector3().crossVectors(y, z);
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
}

const warnings = new Set();
const reachMisses = new Map(); // label -> worst miss in metres

function solveTwoBone(upper, lower, end, targetWorld, poleLocal, frontSign, label) {
  const parentQ = worldQuat(upper.parent);
  const rootPos = upper.getWorldPosition(new THREE.Vector3());
  const a = lower.position.length();
  const b = end.position.length();
  const toTarget = targetWorld.clone().sub(rootPos);
  const rawD = toTarget.length();
  const D = THREE.MathUtils.clamp(rawD, Math.abs(a - b) + 1e-4, (a + b) * 0.9995);
  if (rawD - D > 0.01) reachMisses.set(label, Math.max(reachMisses.get(label) ?? 0, rawD - D));
  const d = toTarget.normalize();
  const pole = poleLocal.clone().normalize().applyQuaternion(parentQ);
  const pPerp = pole.sub(d.clone().multiplyScalar(pole.dot(d)));
  if (pPerp.lengthSq() < 1e-8) pPerp.set(0, 0, 1);
  pPerp.normalize();
  const cosA = THREE.MathUtils.clamp((a * a + D * D - b * b) / (2 * a * D), -1, 1);
  const sinA = Math.sqrt(1 - cosA * cosA);
  const mid = rootPos
    .clone()
    .addScaledVector(d, a * cosA)
    .addScaledVector(pPerp, a * sinA);
  const endPos = rootPos.clone().addScaledVector(d, D);
  const dir1 = mid.clone().sub(rootPos).normalize();
  const dir2 = endPos.sub(mid).normalize();
  const front = pPerp.clone().multiplyScalar(frontSign);
  const q1 = basisQuat(dir1, front);
  const q2 = basisQuat(dir2, front);
  upper.quaternion.copy(parentQ.clone().invert().multiply(q1));
  lower.quaternion.copy(q1.clone().invert().multiply(q2));
  end.quaternion.identity();
  upper.updateMatrixWorld(true);
}

function applyFk(upper, lower, spec, side, isArm) {
  const sx = side === 'l' ? 1 : -1;
  const euler = new THREE.Euler(-(spec.flex ?? 0) * DEG, 0, sx * (spec.abd ?? 0) * DEG, 'ZXY');
  const q = new THREE.Quaternion().setFromEuler(euler);
  if (spec.world) {
    upper.quaternion.copy(worldQuat(upper.parent).invert().multiply(q));
  } else {
    upper.quaternion.copy(q);
  }
  const bend = isArm ? -(spec.elbow ?? 0) : (spec.knee ?? 0);
  lower.quaternion.setFromEuler(new THREE.Euler(bend * DEG, 0, 0));
  upper.updateMatrixWorld(true);
}

/** IK target in world space: a point, or a point on an arc (both optionally in a joint's frame). */
function ikTarget(spec, joints) {
  let point;
  if (Array.isArray(spec.ik)) {
    point = v3(spec.ik);
  } else {
    const { center, radius, angle, plane = 'yz', sx = 1, offset = [0, 0, 0] } = spec.ik.arc;
    const a = angle * DEG;
    const local = {
      yz: [0, -Math.cos(a), Math.sin(a)],
      xz: [sx * Math.sin(a), 0, Math.cos(a)],
      xy: [sx * Math.sin(a), -Math.cos(a), 0],
    }[plane];
    point = v3(center).addScaledVector(v3(local), radius).add(v3(offset));
  }
  return spec.frame ? joints[spec.frame].localToWorld(point) : point;
}

function applyPose(rig, props, pose, exercise) {
  const j = rig.joints;
  j.hips.position.set(...pose.root);
  j.hips.quaternion.setFromEuler(
    new THREE.Euler((pose.rootPitch ?? 0) * DEG, (pose.rootYaw ?? 0) * DEG, 0, 'YXZ'),
  );
  const torso = pose.torso ?? 0;
  const twist = pose.twist ?? 0;
  const bend = pose.sideBend ?? 0;
  j.spine.quaternion.setFromEuler(
    new THREE.Euler(torso * 0.55 * DEG, twist * 0.5 * DEG, bend * 0.5 * DEG, 'YXZ'),
  );
  j.chest.quaternion.setFromEuler(
    new THREE.Euler(torso * 0.45 * DEG, twist * 0.5 * DEG, bend * 0.5 * DEG, 'YXZ'),
  );
  j.neck.quaternion.setFromEuler(new THREE.Euler((pose.neck ?? 0) * DEG, -twist * 0.4 * DEG, 0, 'YXZ'));
  rig.root.updateMatrixWorld(true);

  for (const side of ['l', 'r']) {
    const legSpec = pose[`leg${side.toUpperCase()}`];
    const hip = j[`hip_${side}`];
    const knee = j[`knee_${side}`];
    const ankle = j[`ankle_${side}`];
    if (legSpec?.ik) {
      solveTwoBone(
        hip,
        knee,
        ankle,
        ikTarget(legSpec, j),
        v3(legSpec.pole ?? [0, 0, 1]),
        1,
        `${exercise.slug} leg_${side}`,
      );
      const footQ = new THREE.Quaternion().setFromEuler(
        new THREE.Euler((legSpec.footPitch ?? 0) * DEG, (legSpec.footYaw ?? 0) * DEG, 0, 'YXZ'),
      );
      ankle.quaternion.copy(worldQuat(knee).invert().multiply(footQ));
    } else if (legSpec) {
      applyFk(hip, knee, legSpec, side, false);
      ankle.quaternion.setFromEuler(new THREE.Euler((legSpec.ankle ?? 0) * DEG, 0, 0));
    }
  }
  rig.root.updateMatrixWorld(true);

  for (const side of ['l', 'r']) {
    const armSpec = pose[`arm${side.toUpperCase()}`];
    const shoulder = j[`shoulder_${side}`];
    const elbow = j[`elbow_${side}`];
    const wrist = j[`wrist_${side}`];
    if (armSpec?.ik) {
      solveTwoBone(
        shoulder,
        elbow,
        wrist,
        ikTarget(armSpec, j),
        v3(armSpec.pole ?? [0, -1, -1]),
        -1,
        `${exercise.slug} arm_${side}`,
      );
    } else if (armSpec) {
      applyFk(shoulder, elbow, armSpec, side, true);
    }
  }
  rig.root.updateMatrixWorld(true);

  for (const { spec, node } of props) {
    if (!spec.between) continue;
    const a = j[spec.between[0]].getWorldPosition(new THREE.Vector3());
    const b = j[spec.between[1]].getWorldPosition(new THREE.Vector3());
    node.position.copy(a.add(b).multiplyScalar(0.5)).add(v3(spec.offset ?? [0, 0, 0]));
    node.quaternion.identity();
    if (spec.type === 'barbell' && node.position.y < PLATE_RADIUS - 0.005) {
      warnings.add(
        `${exercise.slug}: plates sink ${(PLATE_RADIUS - node.position.y).toFixed(3)} m into the floor`,
      );
    }
  }
  rig.root.parent.updateMatrixWorld(true);

  const byId = new Map(props.map((p) => [p.id, p.node]));
  const resolve = (endpoint) => {
    if (Array.isArray(endpoint)) return v3(endpoint);
    if (endpoint.node) {
      return j[endpoint.node].getWorldPosition(new THREE.Vector3()).add(v3(endpoint.offset ?? [0, 0, 0]));
    }
    if (endpoint.prop) return byId.get(endpoint.prop).localToWorld(v3(endpoint.local ?? [0, 0, 0]));
    if (endpoint.knot) {
      // Rope centre: as far toward `toward` as a rope of `length` per side allows.
      const { a, b, toward, length } = endpoint.knot;
      const pa = resolve(a);
      const pb = resolve(b);
      const mid = pa.clone().add(pb).multiplyScalar(0.5);
      const half = pa.distanceTo(pb) / 2;
      const across = pb.clone().sub(pa).normalize();
      const dir = resolve(toward).sub(mid);
      dir.sub(across.multiplyScalar(dir.dot(across))).normalize();
      return mid.addScaledVector(dir, Math.sqrt(Math.max(0, length * length - half * half)));
    }
    throw new Error(`Unknown endpoint ${JSON.stringify(endpoint)}`);
  };
  for (const { spec, node } of props) {
    if (spec.type !== 'link') continue;
    const from = resolve(spec.from);
    const to = resolve(spec.to);
    const dir = to.clone().sub(from);
    const length = Math.max(dir.length(), 1e-4);
    node.position.copy(from.add(to).multiplyScalar(0.5));
    node.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    node.scale.set(1, length, 1);
    if (spec.length && Math.abs(length - spec.length) > 0.03) {
      warnings.add(`${exercise.slug}: ${spec.id} length ${length.toFixed(2)} m, expected ${spec.length} m`);
    }
  }
}

// ---------------------------------------------------------------------------
// Baking + export
// ---------------------------------------------------------------------------

function buildScene(exercise) {
  const scene = new THREE.Group();
  scene.name = exercise.slug;
  const rig = buildMannequin();
  scene.add(rig.root);
  const props = [];
  exercise.props.forEach((spec, index) => {
    const id = spec.id ?? `${spec.type}_${index}`;
    const node = PROP_BUILDERS[spec.type](id, spec);
    if (spec.attach) {
      rig.joints[spec.attach].add(node);
    } else {
      scene.add(node);
    }
    if (spec.position) node.position.set(...spec.position);
    if (spec.rotation) node.rotation.set(...spec.rotation.map((r) => r * DEG));
    props.push({ id, spec, node });
  });
  return { scene, rig, props };
}

function bake(exercise) {
  const { scene, rig, props } = buildScene(exercise);
  const frames = Math.round(exercise.duration * FPS);
  const animated = [
    ...Object.values(rig.joints),
    ...props.filter((p) => p.spec.between || p.spec.type === 'link').map((p) => p.node),
  ];
  const samples = new Map(animated.map((node) => [node, { pos: [], quat: [], scale: [] }]));
  const times = [];
  for (let i = 0; i <= frames; i += 1) {
    const u = i / frames;
    applyPose(rig, props, poseAt(exercise, u), exercise);
    times.push((u * exercise.duration).toFixed(4) * 1);
    for (const node of animated) {
      const s = samples.get(node);
      s.pos.push(...node.position.toArray());
      s.scale.push(...node.scale.toArray());
      const q = node.quaternion;
      // Keep quaternions in one hemisphere so interpolation never flips.
      const prev = s.quat.slice(-4);
      if (prev.length === 4 && prev[0] * q.x + prev[1] * q.y + prev[2] * q.z + prev[3] * q.w < 0) {
        tmpQ.set(-q.x, -q.y, -q.z, -q.w);
        s.quat.push(...tmpQ.toArray());
      } else {
        s.quat.push(...q.toArray());
      }
    }
  }
  const constant = (values, stride) => values.every((v, i) => Math.abs(v - values[i % stride]) < 1e-5);
  const tracks = [];
  for (const [node, s] of samples) {
    if (!constant(s.pos, 3))
      tracks.push(new THREE.VectorKeyframeTrack(`${node.name}.position`, times, s.pos));
    if (!constant(s.quat, 4))
      tracks.push(new THREE.QuaternionKeyframeTrack(`${node.name}.quaternion`, times, s.quat));
    if (!constant(s.scale, 3))
      tracks.push(new THREE.VectorKeyframeTrack(`${node.name}.scale`, times, s.scale));
  }
  // Leave the static scene in the first frame's pose.
  applyPose(rig, props, poseAt(exercise, 0), exercise);
  const clip = new THREE.AnimationClip('demo', exercise.duration, tracks);
  return { scene, clip };
}

async function exportGlb(scene, clip) {
  const exporter = new GLTFExporter();
  const result = await exporter.parseAsync(scene, { binary: true, animations: [clip], onlyVisible: true });
  return Buffer.from(result);
}

function round(value) {
  return Math.round(value * 1000) / 1000;
}

async function main() {
  const only = process.argv.slice(2);
  mkdirSync(OUT_DIR, { recursive: true });
  const manifest = {};
  let total = 0;
  for (const exercise of EXERCISES) {
    const file = `${exercise.slug}.glb`;
    const [primaryMuscles, secondaryMuscles] = exercise.muscles;
    const meshesByMuscle = {};
    for (const muscle of [...primaryMuscles, ...secondaryMuscles]) {
      if (!MUSCLE_MESHES[muscle]) throw new Error(`${exercise.name}: no meshes for muscle "${muscle}"`);
      meshesByMuscle[muscle] = MUSCLE_MESHES[muscle];
    }
    manifest[exercise.name] = {
      file,
      primaryMuscles,
      secondaryMuscles,
      meshesByMuscle,
      durationSeconds: round(exercise.duration),
      ...(exercise.tempo ? { tempo: exercise.tempo } : {}),
      camera: {
        target: exercise.camera.target.map(round),
        distance: exercise.camera.distance,
        view: exercise.camera.view,
      },
      ...(exercise.aliases?.length ? { aliases: exercise.aliases } : {}),
    };
    // `node generate-exercise-models.mjs <slug>...` rebakes only those (the manifest is always complete).
    if (only.length > 0 && !only.includes(exercise.slug)) continue;
    const { scene, clip } = bake(exercise);
    const glb = await exportGlb(scene, clip);
    total += glb.length;
    writeFileSync(join(OUT_DIR, file), glb);
    console.log(
      `${file.padEnd(58)} ${(glb.length / 1024).toFixed(1).padStart(6)} KB  ${clip.tracks.length} tracks`,
    );
  }
  const manifestPath = join(OUT_DIR, 'manifest.json');
  const prettierOptions = { ...(await resolveConfig(manifestPath)), filepath: manifestPath };
  writeFileSync(manifestPath, await format(JSON.stringify(manifest), prettierOptions));
  console.log(
    `manifest.json: ${Object.keys(manifest).length} exercises; baked ${(total / 1024).toFixed(0)} KB`,
  );
  for (const [label, miss] of reachMisses)
    console.warn(`warning: ${label}: target out of reach by ${miss.toFixed(3)} m`);
  for (const warning of warnings) console.warn(`warning: ${warning}`);
}

await main();
