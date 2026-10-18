// Generates the original 3D exercise demo library (tooling, not runtime).
//
//   node scripts/generate-exercise-models.mjs
//
// Builds ONE stylised mannequin (rigid ellipsoid/capsule parts on a joint
// hierarchy) plus simple props, then bakes one looping "demo" AnimationClip per
// exercise and writes public/models/exercises/<slug>.glb and manifest.json.
//
// Exercises are data: each entry below is a list of key poses (root position,
// torso angles, limb angles or IK targets) and a timeline. Poses are eased
// between keys, sampled at FPS, and limbs with IK targets are solved per frame
// so planted feet and hands stay put. Nothing here is exercise-specific code.
//
// Coordinates: metres, +Y up, the mannequin faces +Z, its left side is +X.
// Angle conventions (degrees): flex > 0 swings a limb forward/up, abd > 0 swings
// it out to the side, knee/elbow > 0 bends the joint, torso lean > 0 tips the
// upper body forward, root pitch > 0 tips the whole body forward (face down).

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { format, resolveConfig } from 'prettier';

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'models', 'exercises');
const FPS = 20;
const DEG = Math.PI / 180;

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
// Mannequin
// ---------------------------------------------------------------------------

const DIM = {
  spine: 0.09,
  chest: 0.2,
  neck: 0.2,
  shoulder: [0.19, 0.16, 0],
  upperArm: 0.29,
  forearm: 0.27,
  hip: [0.1, -0.06, 0],
  thigh: 0.43,
  shin: 0.42,
  ankleY: 0.066, // ankle height when the foot is flat on the floor
};
const STAND_Y = DIM.ankleY + DIM.shin + DIM.thigh - DIM.hip[1] - 0.006;
const SHOULDER_ABOVE_HIPS = DIM.spine + DIM.chest + DIM.shoulder[1];

const mat = (name, color, roughness, metalness = 0) =>
  new THREE.MeshStandardMaterial({ name, color, roughness, metalness });
const MATERIALS = {
  body: mat('body', '#aab1bb', 0.55, 0.05),
  muscle: mat('muscle', '#c3c8cf', 0.5, 0.05),
  metal: mat('metal', '#c9ced6', 0.3, 0.85),
  plate: mat('plate', '#2a2f37', 0.7),
  pad: mat('pad', '#1b1f25', 0.8),
  frame: mat('frame', '#4a5059', 0.45, 0.6),
};

function lean(geometry) {
  geometry.deleteAttribute('uv');
  return geometry;
}
const GEO = {
  sphere: lean(new THREE.SphereGeometry(1, 14, 10)),
  box: lean(new THREE.BoxGeometry(1, 1, 1)),
  cyl: lean(new THREE.CylinderGeometry(1, 1, 1, 14)),
  hex: lean(new THREE.CylinderGeometry(1, 1, 1, 6)),
  plate: lean(new THREE.CylinderGeometry(1, 1, 1, 20)),
  neck: lean(new THREE.CapsuleGeometry(0.045, 0.06, 3, 10)),
  upperArm: lean(new THREE.CapsuleGeometry(0.045, 0.22, 3, 10)),
  forearm: lean(new THREE.CapsuleGeometry(0.038, 0.2, 3, 10)),
  thigh: lean(new THREE.CapsuleGeometry(0.07, 0.3, 3, 12)),
  shin: lean(new THREE.CapsuleGeometry(0.05, 0.32, 3, 10)),
};

function joint(name, parent, position = [0, 0, 0]) {
  const node = new THREE.Object3D();
  node.name = name;
  node.position.set(...position);
  parent.add(node);
  return node;
}

function part(name, parent, geometry, material, position, scale = [1, 1, 1], rotation = [0, 0, 0]) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.position.set(...position);
  mesh.scale.set(...scale);
  mesh.rotation.set(...rotation.map((r) => r * DEG));
  parent.add(mesh);
  return mesh;
}

/** Which overlay meshes represent each muscle group (catalog muscle names). */
const MUSCLE_MESHES = {
  chest: ['chest_l', 'chest_r'],
  back: ['upper_back', 'lats_l', 'lats_r'],
  shoulders: ['delt_l', 'delt_r'],
  'rear delts': ['delt_l', 'delt_r'],
  biceps: ['biceps_l', 'biceps_r'],
  triceps: ['triceps_l', 'triceps_r'],
  forearms: ['forearm_l', 'forearm_r'],
  core: ['abs'],
  glutes: ['glute_l', 'glute_r'],
  quads: ['quads_l', 'quads_r'],
  hamstrings: ['hamstrings_l', 'hamstrings_r'],
  calves: ['calf_l', 'calf_r'],
};

function buildMannequin() {
  const root = new THREE.Group();
  root.name = 'mannequin';
  const { body, muscle } = MATERIALS;
  const j = {};

  j.hips = joint('hips', root, [0, STAND_Y, 0]);
  part('pelvis', j.hips, GEO.sphere, body, [0, -0.01, 0], [0.15, 0.1, 0.1]);
  part('glute_l', j.hips, GEO.sphere, muscle, [0.075, -0.05, -0.06], [0.07, 0.08, 0.055]);
  part('glute_r', j.hips, GEO.sphere, muscle, [-0.075, -0.05, -0.06], [0.07, 0.08, 0.055]);

  j.spine = joint('spine', j.hips, [0, DIM.spine, 0]);
  part('abdomen', j.spine, GEO.sphere, body, [0, 0.08, 0], [0.13, 0.12, 0.09]);
  part('abs', j.spine, GEO.sphere, muscle, [0, 0.08, 0.06], [0.075, 0.1, 0.04]);

  j.chest = joint('chest', j.spine, [0, DIM.chest, 0]);
  part('torso', j.chest, GEO.sphere, body, [0, 0.08, 0], [0.17, 0.16, 0.105]);
  part('chest_l', j.chest, GEO.sphere, muscle, [0.075, 0.1, 0.07], [0.075, 0.06, 0.04]);
  part('chest_r', j.chest, GEO.sphere, muscle, [-0.075, 0.1, 0.07], [0.075, 0.06, 0.04]);
  part('upper_back', j.chest, GEO.sphere, muscle, [0, 0.12, -0.07], [0.12, 0.09, 0.04]);
  part('lats_l', j.chest, GEO.sphere, muscle, [0.1, 0, -0.05], [0.055, 0.11, 0.045]);
  part('lats_r', j.chest, GEO.sphere, muscle, [-0.1, 0, -0.05], [0.055, 0.11, 0.045]);

  j.neck = joint('neck', j.chest, [0, DIM.neck, 0]);
  part('neck_mesh', j.neck, GEO.neck, body, [0, 0.04, 0]);
  part('head', j.neck, GEO.sphere, body, [0, 0.15, 0.01], [0.09, 0.11, 0.1]);

  for (const [side, sx] of [
    ['l', 1],
    ['r', -1],
  ]) {
    const shoulder = joint(`shoulder_${side}`, j.chest, [sx * DIM.shoulder[0], DIM.shoulder[1], 0]);
    part(`delt_${side}`, shoulder, GEO.sphere, muscle, [0, -0.015, 0], [0.06, 0.065, 0.06]);
    part(`upper_arm_${side}`, shoulder, GEO.upperArm, body, [0, -0.145, 0]);
    part(`biceps_${side}`, shoulder, GEO.sphere, muscle, [0, -0.14, 0.025], [0.035, 0.08, 0.03]);
    part(`triceps_${side}`, shoulder, GEO.sphere, muscle, [0, -0.13, -0.025], [0.035, 0.09, 0.03]);
    const elbow = joint(`elbow_${side}`, shoulder, [0, -DIM.upperArm, 0]);
    part(`forearm_${side}`, elbow, GEO.forearm, muscle, [0, -0.135, 0]);
    const wrist = joint(`wrist_${side}`, elbow, [0, -DIM.forearm, 0]);
    part(`hand_${side}`, wrist, GEO.sphere, body, [0, -0.03, 0], [0.035, 0.05, 0.025]);

    const hip = joint(`hip_${side}`, j.hips, [sx * DIM.hip[0], DIM.hip[1], 0]);
    part(`thigh_${side}`, hip, GEO.thigh, body, [0, -0.215, 0]);
    part(`quads_${side}`, hip, GEO.sphere, muscle, [0, -0.2, 0.035], [0.055, 0.16, 0.045]);
    part(`hamstrings_${side}`, hip, GEO.sphere, muscle, [0, -0.21, -0.035], [0.05, 0.15, 0.045]);
    const knee = joint(`knee_${side}`, hip, [0, -DIM.thigh, 0]);
    part(`shin_${side}`, knee, GEO.shin, body, [0, -0.21, 0]);
    part(`calf_${side}`, knee, GEO.sphere, muscle, [0, -0.12, -0.03], [0.042, 0.1, 0.04]);
    const ankle = joint(`ankle_${side}`, knee, [0, -DIM.shin, 0]);
    part(`foot_${side}`, ankle, GEO.box, body, [0, -0.035, 0.055], [0.08, 0.06, 0.23]);

    Object.assign(j, {
      [`shoulder_${side}`]: shoulder,
      [`elbow_${side}`]: elbow,
      [`wrist_${side}`]: wrist,
      [`hip_${side}`]: hip,
      [`knee_${side}`]: knee,
      [`ankle_${side}`]: ankle,
    });
  }
  return { root, joints: j };
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

function barbell(name) {
  const g = new THREE.Group();
  g.name = name;
  const { metal, plate } = MATERIALS;
  // Bar along X, centred on the group origin.
  part(`${name}_shaft`, g, GEO.cyl, metal, [0, 0, 0], [0.014, 2.0, 0.014], [0, 0, 90]);
  for (const sx of [1, -1]) {
    part(`${name}_sleeve${sx}`, g, GEO.cyl, metal, [sx * 0.82, 0, 0], [0.026, 0.36, 0.026], [0, 0, 90]);
    part(`${name}_plate${sx}a`, g, GEO.plate, plate, [sx * 0.69, 0, 0], [0.225, 0.05, 0.225], [0, 0, 90]);
    part(`${name}_plate${sx}b`, g, GEO.plate, plate, [sx * 0.745, 0, 0], [0.17, 0.04, 0.17], [0, 0, 90]);
    part(`${name}_collar${sx}`, g, GEO.cyl, metal, [sx * 0.665, 0, 0], [0.035, 0.03, 0.035], [0, 0, 90]);
  }
  return g;
}

/** Dumbbell with its handle along local X. */
function dumbbell(name) {
  const g = new THREE.Group();
  g.name = name;
  const { metal, plate } = MATERIALS;
  part(`${name}_handle`, g, GEO.cyl, metal, [0, 0, 0], [0.016, 0.2, 0.016], [0, 0, 90]);
  for (const sx of [1, -1]) {
    part(`${name}_head${sx}`, g, GEO.hex, plate, [sx * 0.105, 0, 0], [0.055, 0.07, 0.055], [0, 0, 90]);
  }
  return g;
}

function bench(name) {
  const g = new THREE.Group();
  g.name = name;
  const { pad, frame } = MATERIALS;
  part(`${name}_pad`, g, GEO.box, pad, [0, 0.4, -0.12], [0.3, 0.06, 1.2]);
  part(`${name}_rail`, g, GEO.box, frame, [0, 0.345, -0.12], [0.08, 0.05, 1.1]);
  for (const z of [-0.62, 0.38]) {
    part(`${name}_leg${z}`, g, GEO.box, frame, [0, 0.17, z], [0.06, 0.34, 0.06]);
    part(`${name}_foot${z}`, g, GEO.box, frame, [0, 0.015, z], [0.42, 0.03, 0.06]);
  }
  return g;
}

function pullUpBar(name) {
  const g = new THREE.Group();
  g.name = name;
  const { metal, frame } = MATERIALS;
  part(`${name}_bar`, g, GEO.cyl, metal, [0, 2.25, 0], [0.016, 1.5, 0.016], [0, 0, 90]);
  // Posts stand behind the lifter so neither the front nor the side view is blocked.
  for (const sx of [1, -1]) {
    part(`${name}_arm${sx}`, g, GEO.box, frame, [sx * 0.72, 2.25, -0.25], [0.05, 0.05, 0.55]);
    part(`${name}_post${sx}`, g, GEO.box, frame, [sx * 0.72, 1.14, -0.5], [0.06, 2.28, 0.06]);
    part(`${name}_base${sx}`, g, GEO.box, frame, [sx * 0.72, 0.015, -0.5], [0.08, 0.03, 0.6]);
  }
  return g;
}

const PLATE_RADIUS = 0.225;
const PROP_BUILDERS = { barbell, dumbbell, bench, pullUpBar };

// ---------------------------------------------------------------------------
// Pose helpers (used by the exercise table)
// ---------------------------------------------------------------------------

const mirrorX = (v) => (Array.isArray(v) ? [-v[0], v[1], v[2]] : v);
function mirrorLimb(spec) {
  if (!spec) return spec;
  const out = { ...spec };
  if (spec.ik) out.ik = mirrorX(spec.ik);
  if (spec.pole) out.pole = mirrorX(spec.pole);
  return out;
}
/** Same spec for both arms; IK targets and poles are mirrored across X. */
const arms = (left) => ({ armL: left, armR: mirrorLimb(left) });
const legs = (left) => ({ legL: left, legR: mirrorLimb(left) });

/** Planted foot (IK). Knees track forward unless a pole is given. */
const foot = (x, z, extra = {}) => ({ ik: [x, DIM.ankleY, z], pole: [0.15, 0, 1], footPitch: 0, ...extra });

// ---------------------------------------------------------------------------
// Exercise table
// ---------------------------------------------------------------------------
// Pose fields:
//   root: [x,y,z] hips position; rootPitch: whole-body pitch
//   torso: forward lean split across spine/chest; neck: head pitch (relative)
//   armL/armR/legL/legR:
//     { flex, abd, elbow|knee, world? }   forward kinematics (world: flex relative to vertical)
//     { ik: [x,y,z], frame?, pole }       two-bone IK to a point (frame = 'chest' for torso-relative)
//     legs also take footPitch (foot orientation in world when planted)
//   bar: offset of a "between hands" barbell from the hand midpoint (optional)
// Timeline: keys [[at 0..1, poseName]], eased between keys; first == last for a clean loop.

const EXERCISES = [
  {
    name: 'Back Squat',
    slug: 'back-squat',
    duration: 3.4,
    props: [{ type: 'barbell', attach: 'chest', position: [0, 0.2, -0.085] }],
    camera: { target: [0, 0.9, 0], distance: 3.4, view: 'side' },
    poses: {
      top: {
        root: [0, STAND_Y - 0.004, 0],
        torso: 6,
        neck: -6,
        ...legs(foot(0.16, 0.02, { pole: [0.35, 0, 1] })),
        ...arms({ ik: [0.32, 0.21, -0.1], frame: 'chest', pole: [0.4, -1, -0.6] }),
      },
      bottom: {
        root: [0, 0.56, -0.16],
        torso: 38,
        neck: -28,
        ...legs(foot(0.16, 0.02, { pole: [0.35, 0, 1] })),
        ...arms({ ik: [0.32, 0.21, -0.1], frame: 'chest', pole: [0.4, -1, -0.6] }),
      },
    },
    keys: [
      [0, 'top'],
      [0.12, 'top'],
      [0.52, 'bottom'],
      [0.6, 'bottom'],
      [1, 'top'],
    ],
  },
  {
    name: 'Goblet Squat',
    slug: 'goblet-squat',
    duration: 3.2,
    props: [{ type: 'dumbbell', attach: 'chest', position: [0, 0.06, 0.2], rotation: [0, 0, 90] }],
    camera: { target: [0, 0.85, 0], distance: 3.3, view: 'side' },
    poses: {
      top: {
        root: [0, STAND_Y - 0.004, 0],
        torso: 2,
        neck: 0,
        ...legs(foot(0.17, 0.03, { pole: [0.4, 0, 1] })),
        ...arms({ ik: [0.06, 0.1, 0.18], frame: 'chest', pole: [0.5, -1, 0.2] }),
      },
      bottom: {
        root: [0, 0.52, -0.1],
        torso: 24,
        neck: -20,
        ...legs(foot(0.17, 0.03, { pole: [0.45, 0, 1] })),
        ...arms({ ik: [0.06, 0.1, 0.18], frame: 'chest', pole: [0.5, -1, 0.2] }),
      },
    },
    keys: [
      [0, 'top'],
      [0.12, 'top'],
      [0.52, 'bottom'],
      [0.6, 'bottom'],
      [1, 'top'],
    ],
  },
  {
    name: 'Barbell Bench Press',
    slug: 'barbell-bench-press',
    duration: 3,
    props: [
      { type: 'bench', position: [0, 0, 0] },
      { type: 'barbell', between: ['wrist_l', 'wrist_r'], offset: [0, 0.015, 0] },
    ],
    camera: { target: [0, 0.6, -0.1], distance: 3.2, view: 'side' },
    poses: {
      top: {
        root: [0, 0.54, 0.24],
        rootPitch: -90,
        torso: 0,
        neck: 4,
        ...legs({ ik: [0.26, DIM.ankleY, 0.66], pole: [0.25, 0, 1], footPitch: 0 }),
        ...arms({ ik: [0.28, 1.06, -0.2], pole: [0.8, -0.6, -0.4] }),
      },
      bottom: {
        root: [0, 0.54, 0.24],
        rootPitch: -90,
        torso: 0,
        neck: 4,
        ...legs({ ik: [0.26, DIM.ankleY, 0.66], pole: [0.25, 0, 1], footPitch: 0 }),
        ...arms({ ik: [0.28, 0.72, -0.1], pole: [0.8, -0.6, -0.4] }),
      },
    },
    keys: [
      [0, 'top'],
      [0.1, 'top'],
      [0.5, 'bottom'],
      [0.56, 'bottom'],
      [1, 'top'],
    ],
  },
  {
    name: 'Push-Up',
    slug: 'push-up',
    duration: 2.6,
    props: [],
    camera: { target: [0, 0.35, -0.15], distance: 3, view: 'side' },
    poses: {
      top: { ...plank(72), ...arms({ ik: [0.2, 0.035, 0.42], pole: [0.5, -1, -0.4] }) },
      bottom: { ...plank(86), ...arms({ ik: [0.2, 0.035, 0.42], pole: [0.5, -1, -0.4] }) },
    },
    keys: [
      [0, 'top'],
      [0.1, 'top'],
      [0.5, 'bottom'],
      [0.56, 'bottom'],
      [1, 'top'],
    ],
  },
  {
    name: 'Deadlift',
    slug: 'deadlift',
    duration: 3.6,
    props: [{ type: 'barbell', between: ['wrist_l', 'wrist_r'], offset: [0, 0.01, 0] }],
    camera: { target: [0, 0.75, 0], distance: 3.4, view: 'side' },
    poses: {
      floor: {
        root: [0, 0.6, -0.31],
        torso: 58,
        neck: -35,
        ...legs(foot(0.13, 0, { pole: [0.25, 0, 1] })),
        ...arms({ flex: 0, abd: 6, elbow: 0, world: true }),
      },
      knee: {
        root: [0, 0.8, -0.24],
        torso: 42,
        neck: -28,
        ...legs(foot(0.13, 0, { pole: [0.25, 0, 1] })),
        ...arms({ flex: 0, abd: 6, elbow: 0, world: true }),
      },
      lockout: {
        root: [0, STAND_Y - 0.004, 0],
        torso: -3,
        neck: 0,
        ...legs(foot(0.13, 0, { pole: [0.25, 0, 1] })),
        ...arms({ flex: -4, abd: 6, elbow: 0, world: true }),
      },
    },
    keys: [
      [0, 'floor'],
      [0.1, 'floor'],
      [0.28, 'knee'],
      [0.45, 'lockout'],
      [0.55, 'lockout'],
      [0.75, 'knee'],
      [0.92, 'floor'],
      [1, 'floor'],
    ],
  },
  {
    name: 'Romanian Deadlift',
    slug: 'romanian-deadlift',
    duration: 3.6,
    props: [{ type: 'barbell', between: ['wrist_l', 'wrist_r'], offset: [0, 0.01, 0] }],
    camera: { target: [0, 0.85, 0], distance: 3.4, view: 'side' },
    poses: {
      top: {
        root: [0, STAND_Y - 0.01, 0],
        torso: 0,
        neck: 0,
        ...legs(foot(0.12, 0, { pole: [0.2, 0, 1] })),
        ...arms({ flex: -2, abd: 5, elbow: 0, world: true }),
      },
      bottom: {
        root: [0, 0.9, -0.2],
        torso: 72,
        neck: -40,
        ...legs(foot(0.12, 0, { pole: [0.2, 0, 1] })),
        ...arms({ flex: 0, abd: 5, elbow: 0, world: true }),
      },
    },
    keys: [
      [0, 'top'],
      [0.1, 'top'],
      [0.5, 'bottom'],
      [0.58, 'bottom'],
      [1, 'top'],
    ],
  },
  {
    name: 'Overhead Press',
    slug: 'overhead-press',
    duration: 3,
    props: [{ type: 'barbell', between: ['wrist_l', 'wrist_r'], offset: [0, 0.015, 0] }],
    camera: { target: [0, 1.15, 0], distance: 3.6, view: 'front' },
    poses: {
      rack: {
        root: [0, STAND_Y - 0.004, 0],
        torso: -3,
        neck: -6,
        ...legs(foot(0.14, 0)),
        ...arms({ ik: [0.25, 1.47, 0.13], pole: [0.25, -1, 0.7] }),
      },
      overhead: {
        root: [0, STAND_Y - 0.004, 0],
        torso: 0,
        neck: 4,
        ...legs(foot(0.14, 0)),
        ...arms({ ik: [0.25, 1.95, 0.02], pole: [1, -0.4, 0.4] }),
      },
    },
    keys: [
      [0, 'rack'],
      [0.12, 'rack'],
      [0.45, 'overhead'],
      [0.58, 'overhead'],
      [1, 'rack'],
    ],
  },
  {
    name: 'Barbell Row',
    slug: 'barbell-row',
    duration: 2.6,
    props: [{ type: 'barbell', between: ['wrist_l', 'wrist_r'], offset: [0, 0.01, 0] }],
    camera: { target: [0, 0.8, 0], distance: 3.3, view: 'side' },
    poses: {
      hang: {
        root: [0, 0.88, -0.14],
        torso: 50,
        neck: -30,
        ...legs(foot(0.13, 0, { pole: [0.2, 0, 1] })),
        ...arms({ ik: [0.25, -0.17, 0.42], frame: 'chest', pole: [0.3, -0.6, -1] }),
      },
      pull: {
        root: [0, 0.88, -0.14],
        torso: 48,
        neck: -30,
        ...legs(foot(0.13, 0, { pole: [0.2, 0, 1] })),
        ...arms({ ik: [0.24, -0.1, 0.16], frame: 'chest', pole: [0.3, -0.6, -1] }),
      },
    },
    keys: [
      [0, 'hang'],
      [0.15, 'hang'],
      [0.45, 'pull'],
      [0.55, 'pull'],
      [1, 'hang'],
    ],
  },
  {
    name: 'Pull-Up',
    slug: 'pull-up',
    duration: 3.2,
    props: [{ type: 'pullUpBar', position: [0, 0, 0] }],
    camera: { target: [0, 1.5, 0], distance: 4.2, view: 'front' },
    poses: {
      hang: {
        root: [0, 1.255, -0.02],
        torso: -4,
        neck: 0,
        ...legs({ flex: 15, abd: 0, knee: 55 }),
        ...arms({ ik: [0.32, 2.25, 0], pole: [1, 0, 0.3] }),
      },
      top: {
        root: [0, 1.7, -0.07],
        torso: -10,
        neck: -10,
        ...legs({ flex: 20, abd: 0, knee: 60 }),
        ...arms({ ik: [0.32, 2.25, 0], pole: [1, -0.5, 0.4] }),
      },
    },
    keys: [
      [0, 'hang'],
      [0.12, 'hang'],
      [0.48, 'top'],
      [0.58, 'top'],
      [1, 'hang'],
    ],
  },
  {
    name: 'Walking Lunge',
    slug: 'walking-lunge',
    duration: 4.4,
    props: [
      { type: 'dumbbell', attach: 'wrist_l', position: [0, -0.02, 0], rotation: [0, 90, 0] },
      { type: 'dumbbell', attach: 'wrist_r', position: [0, -0.02, 0], rotation: [0, 90, 0] },
    ],
    camera: { target: [0, 0.85, 0], distance: 3.5, view: 'side' },
    poses: {
      stand: lungePose({ root: [0, STAND_Y - 0.004, 0], front: [0.11, 0], back: [0.11, 0] }),
      stepL: lungePose({ root: [0, 0.9, 0.06], front: [0.12, 0.2, 0.16], back: [0.11, -0.02] }),
      lungeL: lungePose({ root: [0, 0.56, 0.0], front: [0.12, 0.42], back: [0.12, -0.42], backPitch: 38 }),
      stepR: lungePose({ root: [0, 0.9, 0.06], front: [0.12, 0.2, 0.16], back: [0.11, -0.02] }, true),
      lungeR: lungePose(
        { root: [0, 0.56, 0.0], front: [0.12, 0.42], back: [0.12, -0.42], backPitch: 38 },
        true,
      ),
    },
    keys: [
      [0, 'stand'],
      [0.05, 'stand'],
      [0.13, 'stepL'],
      [0.24, 'lungeL'],
      [0.29, 'lungeL'],
      [0.38, 'stepL'],
      [0.47, 'stand'],
      [0.53, 'stand'],
      [0.61, 'stepR'],
      [0.72, 'lungeR'],
      [0.77, 'lungeR'],
      [0.86, 'stepR'],
      [0.95, 'stand'],
      [1, 'stand'],
    ],
  },
  {
    name: 'Lateral Raise',
    slug: 'lateral-raise',
    duration: 2.8,
    props: [
      { type: 'dumbbell', attach: 'wrist_l', position: [0, -0.02, 0], rotation: [0, 90, 0] },
      { type: 'dumbbell', attach: 'wrist_r', position: [0, -0.02, 0], rotation: [0, 90, 0] },
    ],
    camera: { target: [0, 1.05, 0], distance: 3.6, view: 'front' },
    poses: {
      down: {
        root: [0, STAND_Y - 0.012, 0],
        torso: 6,
        neck: -4,
        ...legs(foot(0.13, 0)),
        ...arms({ flex: 8, abd: 10, elbow: 14, world: true }),
      },
      up: {
        root: [0, STAND_Y - 0.012, 0],
        torso: 6,
        neck: -4,
        ...legs(foot(0.13, 0)),
        ...arms({ flex: 14, abd: 84, elbow: 14, world: true }),
      },
    },
    keys: [
      [0, 'down'],
      [0.12, 'down'],
      [0.45, 'up'],
      [0.55, 'up'],
      [1, 'down'],
    ],
  },
  {
    name: 'Dumbbell Curl',
    slug: 'dumbbell-curl',
    duration: 2.6,
    props: [
      { type: 'dumbbell', attach: 'wrist_l', position: [0, -0.025, 0.005] },
      { type: 'dumbbell', attach: 'wrist_r', position: [0, -0.025, 0.005] },
    ],
    camera: { target: [0, 1.05, 0], distance: 3.4, view: 'side' },
    poses: {
      down: {
        root: [0, STAND_Y - 0.008, 0],
        torso: 0,
        neck: 0,
        ...legs(foot(0.13, 0)),
        ...arms({ flex: 0, abd: 8, elbow: 6, world: true }),
      },
      up: {
        root: [0, STAND_Y - 0.008, 0],
        torso: 0,
        neck: 0,
        ...legs(foot(0.13, 0)),
        ...arms({ flex: 10, abd: 8, elbow: 138, world: true }),
      },
    },
    keys: [
      [0, 'down'],
      [0.1, 'down'],
      [0.45, 'up'],
      [0.55, 'up'],
      [1, 'down'],
    ],
  },
];

/**
 * Rigid plank pivoting on the toes (push-up). `pitch` is the whole-body pitch
 * (90 = horizontal); hips are placed so the ankles stay on the pivot.
 */
function plank(pitch) {
  const pivot = [0, 0.17, -0.85];
  const toAnkle = -DIM.hip[1] + DIM.thigh + DIM.shin;
  const p = pitch * DEG;
  return {
    root: [0, pivot[1] + toAnkle * Math.cos(p), pivot[2] + toAnkle * Math.sin(p)],
    rootPitch: pitch,
    torso: 0,
    neck: -12,
    ...legs({ flex: 0, abd: 2, knee: 0 }),
  };
}

/** Lunge stance: `front`/`back` are [x, z] or [x, y, z] ankle targets. */
function lungePose({ root, front, back, backPitch = 0 }, mirrored = false) {
  const target = ([x, a, b]) => (b === undefined ? [x, DIM.ankleY, a] : [x, a, b]);
  const frontLeg = { ik: target(front), pole: [0.1, 0, 1], footPitch: 0 };
  const backLeg = {
    ik: target(back),
    pole: [0.1, 0, 1],
    footPitch: backPitch,
  };
  // Raise the back ankle so the toes stay on the floor as the heel lifts.
  backLeg.ik[1] += Math.max(0, 0.065 * Math.cos(backPitch * DEG) + 0.18 * Math.sin(backPitch * DEG) - 0.065);
  const pose = {
    root,
    torso: 3,
    neck: 0,
    ...arms({ flex: 0, abd: 6, elbow: 4, world: true }),
  };
  if (!mirrored) {
    pose.legL = frontLeg;
    pose.legR = mirrorLimb(backLeg);
  } else {
    pose.legL = backLeg;
    pose.legR = mirrorLimb(frontLeg);
  }
  return pose;
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

function solveTwoBone(upper, lower, end, targetWorld, poleLocal, frontSign, label) {
  const parentQ = worldQuat(upper.parent);
  const rootPos = upper.getWorldPosition(new THREE.Vector3());
  const a = lower.position.length();
  const b = end.position.length();
  const toTarget = targetWorld.clone().sub(rootPos);
  const rawD = toTarget.length();
  const D = THREE.MathUtils.clamp(rawD, Math.abs(a - b) + 1e-4, (a + b) * 0.9995);
  if (rawD - D > 0.01) warnings.add(`${label}: target out of reach by ${(rawD - D).toFixed(3)} m`);
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

function applyPose(rig, props, pose, exercise) {
  const j = rig.joints;
  j.hips.position.set(...pose.root);
  j.hips.quaternion.setFromEuler(new THREE.Euler((pose.rootPitch ?? 0) * DEG, 0, 0));
  const torso = pose.torso ?? 0;
  j.spine.quaternion.setFromEuler(new THREE.Euler(torso * 0.55 * DEG, 0, 0));
  j.chest.quaternion.setFromEuler(new THREE.Euler(torso * 0.45 * DEG, 0, 0));
  j.neck.quaternion.setFromEuler(new THREE.Euler((pose.neck ?? 0) * DEG, 0, 0));
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
        v3(legSpec.ik),
        v3(legSpec.pole ?? [0, 0, 1]),
        1,
        `${exercise.slug} leg_${side}`,
      );
      const footQ = new THREE.Quaternion().setFromEuler(
        new THREE.Euler((legSpec.footPitch ?? 0) * DEG, 0, 0),
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
      const target = armSpec.frame ? j[armSpec.frame].localToWorld(v3(armSpec.ik)) : v3(armSpec.ik);
      solveTwoBone(
        shoulder,
        elbow,
        wrist,
        target,
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
    const node = PROP_BUILDERS[spec.type](`${spec.type}_${index}`);
    if (spec.attach) {
      rig.joints[spec.attach].add(node);
    } else {
      scene.add(node);
    }
    if (spec.position) node.position.set(...spec.position);
    if (spec.rotation) node.rotation.set(...spec.rotation.map((r) => r * DEG));
    props.push({ spec, node });
  });
  return { scene, rig, props };
}

function bake(exercise) {
  const { scene, rig, props } = buildScene(exercise);
  const frames = Math.round(exercise.duration * FPS);
  const animated = [...Object.values(rig.joints), ...props.filter((p) => p.spec.between).map((p) => p.node)];
  const samples = new Map(animated.map((node) => [node, { pos: [], quat: [] }]));
  const times = [];
  for (let i = 0; i <= frames; i += 1) {
    const u = i / frames;
    applyPose(rig, props, poseAt(exercise, u), exercise);
    times.push((u * exercise.duration).toFixed(4) * 1);
    for (const node of animated) {
      const s = samples.get(node);
      s.pos.push(...node.position.toArray());
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

const CATALOG_MUSCLES = {
  'Back Squat': [
    ['quads', 'glutes'],
    ['hamstrings', 'core'],
  ],
  'Goblet Squat': [['quads', 'glutes'], ['core']],
  'Barbell Bench Press': [['chest'], ['triceps', 'shoulders']],
  'Push-Up': [['chest'], ['triceps', 'shoulders', 'core']],
  Deadlift: [
    ['back', 'hamstrings', 'glutes'],
    ['forearms', 'core'],
  ],
  'Romanian Deadlift': [['hamstrings', 'glutes'], ['back']],
  'Overhead Press': [['shoulders'], ['triceps', 'core']],
  'Barbell Row': [['back'], ['biceps', 'rear delts']],
  'Pull-Up': [['back'], ['biceps']],
  'Walking Lunge': [['quads', 'glutes'], ['hamstrings']],
  'Lateral Raise': [['shoulders'], []],
  'Dumbbell Curl': [['biceps'], ['forearms']],
};

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const manifest = {};
  for (const exercise of EXERCISES) {
    const { scene, clip } = bake(exercise);
    const glb = await exportGlb(scene, clip);
    const file = `${exercise.slug}.glb`;
    writeFileSync(join(OUT_DIR, file), glb);
    const [primaryMuscles, secondaryMuscles] = CATALOG_MUSCLES[exercise.name];
    const meshesByMuscle = {};
    for (const muscle of [...primaryMuscles, ...secondaryMuscles]) {
      if (MUSCLE_MESHES[muscle]) meshesByMuscle[muscle] = MUSCLE_MESHES[muscle];
    }
    manifest[exercise.name] = {
      file,
      primaryMuscles,
      secondaryMuscles,
      meshesByMuscle,
      durationSeconds: exercise.duration,
      camera: {
        target: exercise.camera.target.map(round),
        distance: exercise.camera.distance,
        view: exercise.camera.view,
      },
    };
    console.log(
      `${file.padEnd(28)} ${(glb.length / 1024).toFixed(1).padStart(6)} KB  ${clip.tracks.length} tracks`,
    );
  }
  const manifestPath = join(OUT_DIR, 'manifest.json');
  const prettierOptions = { ...(await resolveConfig(manifestPath)), filepath: manifestPath };
  writeFileSync(manifestPath, await format(JSON.stringify(manifest), prettierOptions));
  console.log(`manifest.json               ${Object.keys(manifest).length} exercises`);
  for (const warning of warnings) console.warn(`warning: ${warning}`);
}

await main();
