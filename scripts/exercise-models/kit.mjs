// Building blocks for the exercise demo generator: the mannequin rig, props,
// and small helpers the exercise tables use to describe poses as data.
//
// Coordinates: metres, +Y up, the mannequin faces +Z, its left side is +X.

import * as THREE from 'three';

export const DEG = Math.PI / 180;

// ---------------------------------------------------------------------------
// Mannequin
// ---------------------------------------------------------------------------

export const DIM = {
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
export const SEAT_Y = 0.56; // hips height when sitting on a 0.45 m seat
export const STAND_Y = DIM.ankleY + DIM.shin + DIM.thigh - DIM.hip[1] - 0.006;
export const SHOULDER_ABOVE_HIPS = DIM.spine + DIM.chest + DIM.shoulder[1];

export const mat = (name, color, roughness, metalness = 0) =>
  new THREE.MeshStandardMaterial({ name, color, roughness, metalness });
export const MATERIALS = {
  body: mat('body', '#aab1bb', 0.55, 0.05),
  muscle: mat('muscle', '#c3c8cf', 0.5, 0.05),
  metal: mat('metal', '#c9ced6', 0.3, 0.85),
  plate: mat('plate', '#2a2f37', 0.7),
  pad: mat('pad', '#1b1f25', 0.8),
  frame: mat('frame', '#4a5059', 0.45, 0.6),
  cable: mat('cable', '#8f96a0', 0.4, 0.6),
  rope: mat('rope', '#3a4048', 0.9),
};

export function lean(geometry) {
  geometry.deleteAttribute('uv');
  return geometry;
}
export const GEO = {
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

export function joint(name, parent, position = [0, 0, 0]) {
  const node = new THREE.Object3D();
  node.name = name;
  node.position.set(...position);
  parent.add(node);
  return node;
}

export function part(name, parent, geometry, material, position, scale = [1, 1, 1], rotation = [0, 0, 0]) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.position.set(...position);
  mesh.scale.set(...scale);
  mesh.rotation.set(...rotation.map((r) => r * DEG));
  parent.add(mesh);
  return mesh;
}

/** Which overlay meshes represent each muscle group (catalog muscle names). */
export const MUSCLE_MESHES = {
  chest: ['chest_l', 'chest_r'],
  back: ['upper_back', 'lats_l', 'lats_r'],
  lats: ['lats_l', 'lats_r'],
  'upper back': ['upper_back'],
  traps: ['upper_back'],
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

export function buildMannequin() {
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

export function barbell(name, spec = {}) {
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
    // Smith machine: carriages that ride the rails.
    if (spec.smith) {
      part(`${name}_carriage${sx}`, g, GEO.box, MATERIALS.frame, [sx * spec.smith, 0, 0], [0.07, 0.14, 0.08]);
    }
  }
  return g;
}

/** Dumbbell with its handle along local X. */
export function dumbbell(name) {
  const g = new THREE.Group();
  g.name = name;
  const { metal, plate } = MATERIALS;
  part(`${name}_handle`, g, GEO.cyl, metal, [0, 0, 0], [0.016, 0.2, 0.016], [0, 0, 90]);
  for (const sx of [1, -1]) {
    part(`${name}_head${sx}`, g, GEO.hex, plate, [sx * 0.105, 0, 0], [0.055, 0.07, 0.055], [0, 0, 90]);
  }
  return g;
}

export function bench(name) {
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

export function pullUpBar(name) {
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

export const PLATE_RADIUS = 0.225;
export const PROP_BUILDERS = {
  barbell,
  dumbbell,
  bench,
  pullUpBar,
  box,
  cyl,
  pulley,
  cableColumn,
  cableBar,
  neutralBar,
  vHandle,
  dHandle,
  vikingHandle,
  link,
};

// ---------------------------------------------------------------------------
// Pose helpers (used by the exercise table)
// ---------------------------------------------------------------------------

export const mirrorX = (v) => (Array.isArray(v) ? [-v[0], v[1], v[2]] : v);
export function mirrorLimb(spec) {
  if (!spec) return spec;
  const out = { ...spec };
  if (Array.isArray(spec.ik)) out.ik = mirrorX(spec.ik);
  else if (spec.ik?.arc) {
    const arc = spec.ik.arc;
    out.ik = {
      arc: {
        ...arc,
        center: mirrorX(arc.center),
        offset: mirrorX(arc.offset ?? [0, 0, 0]),
        sx: -(arc.sx ?? 1),
      },
    };
  }
  if (spec.pole) out.pole = mirrorX(spec.pole);
  return out;
}
/** Same spec for both arms; IK targets and poles are mirrored across X. */
export const arms = (left) => ({ armL: left, armR: mirrorLimb(left) });
export const legs = (left) => ({ legL: left, legR: mirrorLimb(left) });

/** Planted foot (IK). Knees track forward unless a pole is given. */
export const foot = (x, z, extra = {}) => ({
  ik: [x, DIM.ankleY, z],
  pole: [0.15, 0, 1],
  footPitch: 0,
  ...extra,
});

// ---------------------------------------------------------------------------
// Generic props: composed in the exercise tables, so machines are data too.
// ---------------------------------------------------------------------------

/** Box with its own size; `material` names an entry in MATERIALS. */
export function box(name, spec) {
  const g = new THREE.Group();
  g.name = name;
  part(`${name}_mesh`, g, GEO.box, MATERIALS[spec.material ?? 'frame'], spec.offset ?? [0, 0, 0], spec.size);
  return g;
}

/** Cylinder along `axis` (x | y | z). */
export function cyl(name, spec) {
  const g = new THREE.Group();
  g.name = name;
  const rotation = { x: [0, 0, 90], y: [0, 0, 0], z: [90, 0, 0] }[spec.axis ?? 'y'];
  const r = spec.radius;
  part(
    `${name}_mesh`,
    g,
    GEO.cyl,
    MATERIALS[spec.material ?? 'pad'],
    [0, 0, 0],
    [r, spec.length, r],
    rotation,
  );
  return g;
}

/** Pulley wheel in a bracket; its origin is where the cable leaves it. */
export function pulley(name) {
  const g = new THREE.Group();
  g.name = name;
  part(`${name}_wheel`, g, GEO.plate, MATERIALS.metal, [0, 0, 0], [0.045, 0.025, 0.045], [0, 0, 90]);
  part(`${name}_bracket`, g, GEO.box, MATERIALS.frame, [0, 0, 0], [0.05, 0.11, 0.06]);
  return g;
}

/** Upright cable column with a weight stack; origin on the floor. */
export function cableColumn(name, spec = {}) {
  const g = new THREE.Group();
  g.name = name;
  const h = spec.height ?? 2.25;
  part(`${name}_post`, g, GEO.box, MATERIALS.frame, [0, h / 2, 0], [0.09, h, 0.09]);
  part(`${name}_stack`, g, GEO.box, MATERIALS.plate, [0, 0.42, 0], [0.16, 0.6, 0.12]);
  part(`${name}_base`, g, GEO.box, MATERIALS.frame, [0, 0.015, 0], [0.4, 0.03, 0.4]);
  return g;
}

/** Straight cable bar along X (also used as a machine handle bar). */
export function cableBar(name, spec = {}) {
  const g = new THREE.Group();
  g.name = name;
  part(`${name}_bar`, g, GEO.cyl, MATERIALS.metal, [0, 0, 0], [0.013, spec.length ?? 0.8, 0.013], [0, 0, 90]);
  return g;
}

/** Wide bar with two parallel (neutral) handles at ±spread. */
export function neutralBar(name, spec = {}) {
  const g = new THREE.Group();
  g.name = name;
  const w = spec.spread ?? 0.25;
  part(`${name}_bar`, g, GEO.cyl, MATERIALS.metal, [0, 0.06, 0], [0.013, 2 * w + 0.12, 0.013], [0, 0, 90]);
  for (const sx of [1, -1]) {
    part(`${name}_grip${sx}`, g, GEO.cyl, MATERIALS.pad, [sx * w, 0, 0], [0.018, 0.13, 0.018], [90, 0, 0]);
    part(`${name}_post${sx}`, g, GEO.box, MATERIALS.metal, [sx * w, 0.03, 0], [0.015, 0.06, 0.015]);
  }
  return g;
}

/** Close-grip V handle: two neutral grips, cable clips on at local (0, 0, 0.13). */
export function vHandle(name) {
  const g = new THREE.Group();
  g.name = name;
  for (const sx of [1, -1]) {
    part(`${name}_grip${sx}`, g, GEO.cyl, MATERIALS.pad, [sx * 0.05, 0, 0], [0.017, 0.12, 0.017], [90, 0, 0]);
  }
  part(`${name}_plate`, g, GEO.box, MATERIALS.metal, [0, 0, 0.08], [0.1, 0.012, 0.11]);
  return g;
}

/** Single D-handle held in one hand (attach to a wrist). */
export function dHandle(name, spec = {}) {
  const g = new THREE.Group();
  g.name = name;
  part(`${name}_grip`, g, GEO.cyl, MATERIALS.pad, [0, -0.03, 0], [0.017, 0.12, 0.017], [0, 0, 90]);
  if (spec.strap !== false) {
    part(`${name}_strap`, g, GEO.box, MATERIALS.metal, [0, -0.03, 0], [0.14, 0.012, 0.012]);
  }
  return g;
}

/** Viking-press head: a cross bar with neutral handles; the lever meets it at the origin. */
export function vikingHandle(name, spec = {}) {
  const g = new THREE.Group();
  g.name = name;
  const w = spec.spread ?? 0.22;
  part(`${name}_cross`, g, GEO.cyl, MATERIALS.metal, [0, 0, 0.06], [0.02, 2 * w, 0.02], [0, 0, 90]);
  for (const sx of [1, -1]) {
    part(`${name}_grip${sx}`, g, GEO.cyl, MATERIALS.pad, [sx * w, 0, 0.02], [0.02, 0.12, 0.02], [90, 0, 0]);
  }
  part(`${name}_plate`, g, GEO.plate, MATERIALS.plate, [0, 0, 0.18], [0.17, 0.04, 0.17], [90, 0, 0]);
  return g;
}

/**
 * A rod between two points that are re-evaluated every frame: cables, ropes and
 * machine levers. Unit cylinder (or box) along Y, stretched to the distance.
 */
export function link(name, spec) {
  const g = new THREE.Group();
  g.name = name;
  const geometry = spec.shape === 'box' ? GEO.box : GEO.cyl;
  const w = spec.radius ?? 0.006;
  part(`${name}_mesh`, g, geometry, MATERIALS[spec.material ?? 'cable'], [0, 0, 0], [w, 1, spec.depth ?? w]);
  return g;
}

// ---------------------------------------------------------------------------
// Prop-spec helpers (return arrays of prop specs for the exercise tables)
// ---------------------------------------------------------------------------

/**
 * A cable column at (x, z) whose pulley sits at `pulleyY`, nudged toward the
 * lifter (the origin). Returns the specs and the pulley point for cables.
 */
export function cableStation(id, { x = 0, z, pulleyY }) {
  const len = Math.hypot(x, z) || 1;
  const pulleyPoint = [x - (x / len) * 0.08, pulleyY, z - (z / len) * 0.08];
  const yaw = (Math.atan2(x, z) * 180) / Math.PI;
  return {
    pulley: pulleyPoint,
    props: [
      { type: 'cableColumn', id: `${id}_column`, position: [x, 0, z], rotation: [0, yaw, 0] },
      { type: 'pulley', id: `${id}_pulley`, position: pulleyPoint, rotation: [0, yaw, 0] },
    ],
  };
}

/** A cable from a fixed point (usually a pulley) to a moving endpoint. */
export const cable = (id, from, to) => ({ type: 'link', id, from, to, radius: 0.006, material: 'cable' });

/** A machine lever: a thick bar from a pivot to a moving endpoint. */
export const lever = (id, from, to, width = 0.035) => ({
  type: 'link',
  id,
  from,
  to,
  shape: 'box',
  radius: width,
  depth: width,
  material: 'frame',
});

/** Seat pad on a post: top surface at `top`, centred at z. */
export function seat(id, { top = 0.45, z = -0.02, depth = 0.38, width = 0.36, x = 0 } = {}) {
  return [
    {
      type: 'box',
      id: `${id}_pad`,
      size: [width, 0.07, depth],
      material: 'pad',
      position: [x, top - 0.035, z],
    },
    { type: 'box', id: `${id}_post`, size: [0.07, top - 0.07, 0.07], position: [x, (top - 0.07) / 2, z] },
    { type: 'box', id: `${id}_base`, size: [0.45, 0.03, 0.5], position: [x, 0.015, z] },
  ];
}

/**
 * Turns a coach tempo "ecc-pause-con-pause" into a timeline. The clip starts in
 * the stretched pose: concentric -> hold contracted -> eccentric -> hold
 * stretched. Very short holds are padded so both end positions read.
 */
export function tempoTimeline(tempo, stretched = 'stretched', contracted = 'contracted', minHold = 0.25) {
  const [ecc, pauseStretched, con, pauseContracted] = tempo.split('-').map(Number);
  const segments = [
    [con, contracted],
    [Math.max(pauseContracted, minHold), contracted],
    [ecc, stretched],
    [Math.max(pauseStretched, minHold), stretched],
  ];
  const duration = segments.reduce((sum, [t]) => sum + t, 0);
  const keys = [[0, stretched]];
  let t = 0;
  for (const [length, pose] of segments) {
    t += length;
    keys.push([Math.min(1, t / duration), pose]);
  }
  return { duration, keys };
}

/** Two tempo cycles back to back (alternating left/right). */
export function alternatingTimeline(tempo, rest, leftWork, rightWork, minHold = 0.25) {
  const one = tempoTimeline(tempo, rest, leftWork, minHold);
  const two = tempoTimeline(tempo, rest, rightWork, minHold);
  const duration = one.duration + two.duration;
  const scale = (keys, offset, len) => keys.map(([t, p]) => [(offset + t * len) / duration, p]);
  return {
    duration,
    keys: [...scale(one.keys, 0, one.duration), ...scale(two.keys, one.duration, two.duration).slice(1)],
  };
}
