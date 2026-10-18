// Coach-plan exercises (batch 2): Tuesday/Saturday legs, Friday shoulders,
// triceps and chest. Keyed by the coach's exact names; repeat names on other
// days (e.g. "Light Hip Thrusts") are aliases of the same movement, and
// matching shared-catalog names are aliases too.

import {
  DIM,
  SEAT_Y,
  STAND_Y,
  arms,
  cable,
  cableStation,
  calfAnkle,
  calfFoot,
  foot,
  legs,
  lever,
  mirrorLimb,
  seat,
  tempoTimeline,
} from './kit.mjs';
import {
  CHEST,
  CHEST_SUPPORTED_BODY,
  SHOULDERS,
  UNTIMED,
  chestPad,
  rope,
  seatedLegs,
} from './library-coach.mjs';
import { CORE_EXERCISES, lungePose } from './library-core.mjs';

const ankleY = DIM.ankleY;

/** Squat-style loop that starts standing: top -> bottom -> top. */
const squatKeys = (duration = 3.2) => ({
  duration,
  keys: [
    [0, 'top'],
    [0.08, 'top'],
    [0.5, 'bottom'],
    [0.58, 'bottom'],
    [1, 'top'],
  ],
});

/** Gentle breathing loop for static holds. */
const holdKeys = {
  duration: 4,
  keys: [
    [0, 'exhale'],
    [0.45, 'inhale'],
    [0.55, 'inhale'],
    [1, 'exhale'],
  ],
};

/** Backrest that rides on the (static) spine, with a strut to the floor. */
const backrest = (height = 0.62) => [
  {
    type: 'box',
    id: 'back',
    attach: 'spine',
    size: [0.36, height, 0.06],
    material: 'pad',
    position: [0, height / 2 - 0.04, -0.155],
  },
  lever('back_strut', { prop: 'back', local: [0, -height / 4, -0.03] }, [0, 0.02, -0.34], 0.04),
];

/** Fixed side handles beside a seat (hands rest on them). */
const sideHandles = (y = 0.55, z = 0.02, x = 0.3) =>
  [1, -1].flatMap((sx) => [
    { type: 'box', id: `grip${sx}`, size: [0.04, 0.04, 0.16], material: 'pad', position: [sx * x, y, z] },
    { type: 'box', id: `grip_post${sx}`, size: [0.04, y, 0.04], position: [sx * x, y / 2, z - 0.06] },
  ]);

/** Machine lever pair: posts from the floor to pivots, levers from pivots to the hands. */
const pivotLevers = (pivot, { handOffset = 0.07, post = true, handle = [0, 90, 0] } = {}) =>
  [1, -1].flatMap((sx) => {
    const side = sx > 0 ? 'l' : 'r';
    const p = [sx * pivot[0], pivot[1], pivot[2]];
    return [
      ...(post ? [lever(`post_${side}`, [p[0], 0, p[2]], p, 0.05)] : []),
      { type: 'box', id: `hub_${side}`, size: [0.07, 0.09, 0.09], position: p },
      lever(`lever_${side}`, p, { node: `wrist_${side}`, offset: [sx * handOffset, 0, 0] }, 0.035),
      { type: 'dHandle', id: `handle_${side}`, attach: `wrist_${side}`, rotation: handle, strap: false },
    ];
  });

const seatedArc = (center, radius, angle, pole, offset = [0, 0, 0]) =>
  arms({ ik: { arc: { center, radius, angle, plane: 'yz', offset } }, pole });

// ------------------------------------------------------------------ helpers for specific setups

/** Hip thrust: the upper back pivots on the bench edge `contact`; returns the root for a whole-body pitch. */
function hipThrustRoot(pitch, contact = [0, 0.45, -0.3]) {
  const p = (pitch * Math.PI) / 180;
  const up = [0, Math.cos(p), Math.sin(p)];
  const back = [0, Math.sin(p), -Math.cos(p)];
  return contact.map((c, i) => c - 0.44 * up[i] - 0.11 * back[i]);
}

/** Standing calf raise: straight legs, so the hips ride up with the ankles. */
function calfStandPose(pitch, ball) {
  const ankle = calfAnkle(ball, pitch);
  return {
    root: [0, ankle[1] + DIM.thigh + DIM.shin - DIM.hip[1] - 0.012, ankle[2] - 0.02],
    torso: 2,
    neck: 0,
    ...legs(calfFoot(ball, pitch)),
    ...arms({ ik: [0.24, 0.26, 0.1], frame: 'chest', pole: [1, -1, 0] }),
  };
}

// Hack squat sled travels along a 45° rail (up and back).
const RAIL = [0, Math.SQRT1_2, -Math.SQRT1_2];
const HACK_TOP = [0, 0.88, -0.28];
const HACK_BOTTOM = HACK_TOP.map((v, i) => v - 0.35 * RAIL[i]);
// Rail line sits 0.25 m behind the spine (see the carriage below).
const RAIL_OFFSET = [0, 0.064, -0.418];
const railPoint = (hips, t) => hips.map((v, i) => v + RAIL_OFFSET[i] + t * RAIL[i]);

const pendulumPivot = [0, 1.3, -1.15];

const goblet = CORE_EXERCISES.find((e) => e.slug === 'goblet-squat');

// ---------------------------------------------------------------------------

const pushdownStation = cableStation('st', { z: 0.42, pulleyY: 2.0 });
const singlePushStation = cableStation('st', { x: -0.4, z: 0.45, pulleyY: 2.0 });
const overheadStation = cableStation('st', { z: -0.65, pulleyY: 1.75 });
const kickbackStation = cableStation('st', { x: 0.3, z: 0.85, pulleyY: 0.25 });

const seatedPressPivot = [0.33, 1.9, 0.32];
const inclinePressPivot = [0.34, 1.945, -0.4];
const pushdownMachinePivot = [0.34, 0.775, -0.42];
const pecDeckPivot = [0.19, 1.65, -0.02];

const splitSquat = (implement) => ({
  ...squatKeys(3.4),
  muscles: [['quads', 'glutes'], ['hamstrings']],
  props: [1, -1].map((sx) => ({
    type: implement,
    attach: sx > 0 ? 'wrist_l' : 'wrist_r',
    position: [0, implement === 'kettlebell' ? 0 : -0.02, 0],
    rotation: [0, 90, 0],
  })),
  camera: { target: [0, 0.8, 0], distance: 3.6, view: 'side' },
  poses: {
    top: lungePose({ root: [0, 0.86, 0], front: [0.12, 0.38], back: [0.12, -0.38], backPitch: 32 }),
    bottom: lungePose({ root: [0, 0.56, 0], front: [0.12, 0.38], back: [0.12, -0.38], backPitch: 38 }),
  },
});

const stepBody = (root, torso, left, right) => ({
  root,
  torso,
  neck: -4,
  legL: { ik: left, pole: [0.15, 0, 1], footPitch: 0 },
  legR: { ik: right, pole: [-0.15, 0, 1], footPitch: 0 },
  ...arms({ flex: 0, abd: 6, elbow: 4, world: true }),
});
const BOX_TOP = 0.45 + ankleY;

export const COACH_EXERCISES_2 = [
  // ---------------------------------------------------------- Tuesday / Saturday
  {
    name: 'Quad Extensions',
    slug: 'quad-extension',
    aliases: ['Leg Extension'],
    muscles: [['quads'], []],
    ...tempoTimeline(UNTIMED),
    props: [
      ...seat('seat', { top: 0.5, z: 0.0, depth: 0.5 }),
      ...backrest(),
      ...sideHandles(0.55, 0.0),
      // Shin roller rides on the left shin (both shins move together).
      {
        type: 'cyl',
        id: 'shinpad',
        attach: 'knee_l',
        axis: 'x',
        radius: 0.045,
        length: 0.42,
        material: 'pad',
        position: [-0.1, -0.34, 0.09],
      },
      lever(
        'lever',
        { node: 'knee_l', offset: [0.22, 0, 0] },
        { prop: 'shinpad', local: [0.32, 0, 0] },
        0.035,
      ),
    ],
    camera: { target: [0, 0.6, 0.15], distance: 3.2, view: 'side' },
    poses: {
      stretched: {
        root: [0, 0.62, -0.02],
        torso: -8,
        neck: 4,
        ...legs({ flex: 90, abd: 0, knee: 92 }),
        ...arms({ ik: [0.3, 0.57, 0.0], pole: [0.5, -1, -0.3] }),
      },
      contracted: {
        root: [0, 0.62, -0.02],
        torso: -8,
        neck: 4,
        ...legs({ flex: 90, abd: 0, knee: 8 }),
        ...arms({ ik: [0.3, 0.57, 0.0], pole: [0.5, -1, -0.3] }),
      },
    },
  },
  {
    name: 'Hamstring Curls',
    slug: 'hamstring-curl',
    // Shown as the lying (prone) leg curl, which is also the catalog's version.
    aliases: ['Lying Leg Curl'],
    muscles: [['hamstrings'], ['calves']],
    ...tempoTimeline(UNTIMED),
    props: [
      { type: 'box', id: 'bench', size: [0.34, 0.07, 1.2], material: 'pad', position: [0, 0.515, 0.17] },
      { type: 'box', id: 'bench_frame', size: [0.1, 0.48, 1.0], position: [0, 0.24, 0.17] },
      ...[1, -1].map((sx) => ({
        type: 'box',
        id: `grip${sx}`,
        size: [0.04, 0.14, 0.04],
        material: 'pad',
        position: [sx * 0.22, 0.47, 0.72],
      })),
      {
        type: 'cyl',
        id: 'anklepad',
        attach: 'knee_l',
        axis: 'x',
        radius: 0.045,
        length: 0.42,
        material: 'pad',
        position: [-0.1, -0.36, -0.09],
      },
      lever(
        'lever',
        { node: 'knee_l', offset: [0.22, 0, 0] },
        { prop: 'anklepad', local: [0.32, 0, 0] },
        0.035,
      ),
    ],
    camera: { target: [0, 0.6, 0], distance: 3.4, view: 'side' },
    poses: {
      stretched: {
        root: [0, 0.66, 0],
        rootPitch: 90,
        torso: 0,
        neck: -25,
        ...legs({ flex: 0, abd: 2, knee: 5 }),
        ...arms({ ik: [0.22, 0.52, 0.7], pole: [1, 0, -0.3] }),
      },
      contracted: {
        root: [0, 0.66, 0],
        rootPitch: 90,
        torso: 0,
        neck: -25,
        ...legs({ flex: 0, abd: 2, knee: 112 }),
        ...arms({ ik: [0.22, 0.52, 0.7], pole: [1, 0, -0.3] }),
      },
    },
  },
  {
    name: 'Pendulum Squat',
    slug: 'pendulum-squat',
    muscles: [['quads', 'glutes'], ['hamstrings']],
    ...squatKeys(3.4),
    props: [
      { type: 'box', id: 'platform', size: [0.7, 0.1, 0.5], material: 'plate', position: [0, 0.05, 0.15] },
      {
        type: 'box',
        id: 'back',
        attach: 'spine',
        size: [0.34, 0.6, 0.06],
        material: 'pad',
        position: [0, 0.22, -0.155],
      },
      ...[1, -1].map((sx) => ({
        type: 'box',
        id: `shoulder_pad${sx}`,
        attach: 'chest',
        size: [0.1, 0.05, 0.22],
        material: 'pad',
        position: [sx * 0.11, 0.29, 0],
      })),
      { ...lever('arm', { prop: 'back', local: [0, 0.2, -0.03] }, pendulumPivot, 0.06), length: undefined },
      lever('post', [0, 0, pendulumPivot[2]], pendulumPivot, 0.08),
      { type: 'box', id: 'hub', size: [0.3, 0.1, 0.1], position: pendulumPivot },
    ],
    camera: { target: [0, 0.95, -0.2], distance: 3.8, view: 'side' },
    poses: {
      top: {
        root: [0, 0.955, -0.02],
        torso: 8,
        neck: -4,
        ...legs(foot(0.17, 0.14, { pole: [0.35, 0, 1] })),
        ...arms({ ik: [0.24, 0.24, 0.12], frame: 'chest', pole: [1, -1, 0] }),
      },
      bottom: {
        root: [0, 0.62, -0.14],
        torso: 22,
        neck: -16,
        ...legs(foot(0.17, 0.14, { pole: [0.35, 0, 1] })),
        ...arms({ ik: [0.24, 0.24, 0.12], frame: 'chest', pole: [1, -1, 0] }),
      },
    },
  },
  {
    name: 'Hack Squat',
    slug: 'hack-squat',
    aliases: ['Hack Squat (Light Weight)'],
    // Coach cue: wide stance, toes out, push through the glutes.
    muscles: [
      ['quads', 'glutes'],
      ['hamstrings', 'adductors'],
    ],
    ...squatKeys(3.4),
    props: [
      { type: 'box', id: 'platform', size: [0.8, 0.12, 0.45], material: 'plate', position: [0, 0.06, 0.25] },
      {
        type: 'box',
        id: 'back',
        attach: 'spine',
        size: [0.36, 0.7, 0.06],
        material: 'pad',
        position: [0, 0.25, -0.155],
      },
      { type: 'box', id: 'carriage', attach: 'spine', size: [0.5, 0.14, 0.08], position: [0, 0.25, -0.22] },
      ...[1, -1].map((sx) => ({
        type: 'box',
        id: `shoulder_pad${sx}`,
        attach: 'chest',
        size: [0.1, 0.05, 0.22],
        material: 'pad',
        position: [sx * 0.11, 0.29, 0],
      })),
      ...[1, -1].flatMap((sx) => {
        const bottom = railPoint(HACK_BOTTOM, -0.3).map((v, i) => (i === 0 ? sx * 0.22 : v));
        const top = railPoint(HACK_TOP, 0.7).map((v, i) => (i === 0 ? sx * 0.22 : v));
        return [
          lever(`rail${sx}`, bottom, top, 0.04),
          lever(`rail_leg${sx}`, [sx * 0.22, 0, top[2]], top, 0.05),
          lever(`rail_foot${sx}`, [sx * 0.22, 0, bottom[2]], bottom, 0.05),
        ];
      }),
    ],
    camera: { target: [0, 0.75, -0.1], distance: 3.8, view: 'side' },
    poses: {
      top: {
        root: HACK_TOP,
        rootPitch: -45,
        torso: 0,
        neck: 15,
        ...legs({ ik: [0.24, 0.12 + ankleY, 0.2], pole: [0.6, 0, 1], footPitch: 0, footYaw: 25 }),
        ...arms({ ik: [0.26, 0.24, 0.1], frame: 'chest', pole: [1, -1, 0] }),
      },
      bottom: {
        root: HACK_BOTTOM,
        rootPitch: -45,
        torso: 0,
        neck: 15,
        ...legs({ ik: [0.24, 0.12 + ankleY, 0.2], pole: [0.6, 0, 1], footPitch: 0, footYaw: 25 }),
        ...arms({ ik: [0.26, 0.24, 0.1], frame: 'chest', pole: [1, -1, 0] }),
      },
    },
  },
  ...[
    ['Hips Adductors (Close Legs)', 'hip-adductor-machine', 'adductors', -1, [38, 4]],
    ['Hip Abductors (Open Legs)', 'hip-abductor-machine', 'abductors', 1, [4, 38]],
  ].map(([name, slug, muscle, padSide, [stretchedYaw, contractedYaw]]) => ({
    name,
    slug,
    muscles: muscle === 'abductors' ? [['abductors', 'glutes'], []] : [['adductors'], []],
    ...tempoTimeline(UNTIMED),
    props: [
      ...seat('seat', { top: 0.5, z: -0.075, depth: 0.35 }),
      ...backrest(),
      ...sideHandles(0.56, -0.08, 0.3),
      // Knee pads on the inside (adductors) or outside (abductors) of each thigh.
      ...[1, -1].flatMap((sx) => {
        const side = sx > 0 ? 'l' : 'r';
        return [
          {
            type: 'box',
            id: `pad_${side}`,
            attach: `hip_${side}`,
            size: [0.04, 0.16, 0.14],
            material: 'pad',
            position: [sx * padSide * 0.09, -0.36, 0],
          },
          lever(`arm_${side}`, [sx * 0.1, 0.2, 0], { prop: `pad_${side}`, local: [0, -0.06, 0] }, 0.03),
        ];
      }),
    ],
    camera: { target: [0, 0.7, 0.1], distance: 3.2, view: 'front' },
    poses: Object.fromEntries(
      [
        ['stretched', stretchedYaw],
        ['contracted', contractedYaw],
      ].map(([pose, yaw]) => [
        pose,
        {
          root: [0, 0.61, 0],
          torso: -10,
          neck: 6,
          ...legs({ flex: 90, abd: 0, yaw, knee: 90 }),
          ...arms({ ik: [0.3, 0.58, -0.08], pole: [0.5, -1, -0.3] }),
        },
      ]),
    ),
  })),
  {
    name: 'Heavy Hip Thrusts',
    slug: 'hip-thrust',
    aliases: ['Light Hip Thrusts', 'Hip Thrust'],
    muscles: [['glutes'], ['hamstrings']],
    ...tempoTimeline(UNTIMED),
    props: [
      { type: 'box', id: 'bench', size: [1.0, 0.42, 0.35], material: 'pad', position: [0, 0.21, -0.475] },
      { type: 'barbell', id: 'bar', attach: 'hips', position: [0, -0.02, 0.19] },
    ],
    camera: { target: [0, 0.45, 0.1], distance: 3.6, view: 'side' },
    poses: Object.fromEntries(
      [
        ['stretched', -50, 14],
        ['contracted', -90, 24],
      ].map(([pose, pitch, neck]) => [
        pose,
        {
          root: hipThrustRoot(pitch),
          rootPitch: pitch,
          torso: 0,
          neck,
          ...legs({ ik: [0.18, ankleY, 0.6], pole: [0.2, 0, 1], footPitch: 0 }),
          ...arms({ ik: [0.36, -0.02, 0.19], frame: 'hips', pole: [0.5, -1, 0] }),
        },
      ]),
    ),
  },
  {
    name: 'Wall Sits',
    slug: 'wall-sit',
    muscles: [['quads', 'glutes'], []],
    // A timed static hold: the clip just breathes.
    ...holdKeys,
    props: [{ type: 'box', id: 'wall', size: [1.4, 2.0, 0.1], material: 'frame', position: [0, 1.0, -0.26] }],
    camera: { target: [0, 0.7, 0.1], distance: 3.2, view: 'side' },
    poses: {
      exhale: {
        root: [0, 0.55, -0.1],
        torso: 0,
        neck: 0,
        ...legs(foot(0.16, 0.33, { pole: [0.2, 0, 1] })),
        ...arms({ ik: [0.17, 0.62, 0.25], pole: [0.6, -1, -0.4] }),
      },
      inhale: {
        root: [0, 0.556, -0.1],
        torso: -1,
        neck: -2,
        ...legs(foot(0.16, 0.33, { pole: [0.2, 0, 1] })),
        ...arms({ ik: [0.17, 0.62, 0.25], pole: [0.6, -1, -0.4] }),
      },
    },
  },
  { name: 'Dumbbell Split Squats', slug: 'dumbbell-split-squat', ...splitSquat('dumbbell') },
  { name: 'Kettlebell Split Squats', slug: 'kettlebell-split-squat', ...splitSquat('kettlebell') },
  {
    name: 'Seated Calf Raise',
    slug: 'seated-calf-raise',
    muscles: [['calves'], []],
    ...tempoTimeline(UNTIMED, 'down', 'up'),
    props: [
      ...seat('seat', { top: 0.6, z: -0.08 }),
      { type: 'box', id: 'step', size: [0.5, 0.155, 0.2], material: 'plate', position: [0, 0.0775, 0.6] },
      // Knee pad rides on the thighs and is held down by two pistons.
      {
        type: 'box',
        id: 'kneepad',
        attach: 'hip_l',
        size: [0.42, 0.06, 0.12],
        material: 'pad',
        position: [-0.1, -0.36, 0.1],
      },
      lever('piston_l', { prop: 'kneepad', local: [0.21, 0, 0] }, [0.31, 0.02, 0.3], 0.04),
      lever('piston_r', { prop: 'kneepad', local: [-0.21, 0, 0] }, [-0.31, 0.02, 0.3], 0.04),
    ],
    camera: { target: [0, 0.55, 0.2], distance: 3.0, view: 'side' },
    poses: Object.fromEntries(
      [
        ['down', -15],
        ['up', 25],
      ].map(([pose, pitch]) => [
        pose,
        {
          root: [0, 0.71, -0.05],
          torso: 6,
          neck: -4,
          ...legs(calfFoot([0.13, 0.165, 0.52], pitch, { pole: [0.15, 0.5, 1] })),
          ...arms({ ik: [0.24, 0.8, 0.32], pole: [0.5, -1, -0.2] }),
        },
      ]),
    ),
  },
  {
    name: 'Standing Calf Raise',
    slug: 'standing-calf-raise',
    muscles: [['calves'], []],
    ...tempoTimeline(UNTIMED, 'down', 'up'),
    props: [
      { type: 'box', id: 'step', size: [0.5, 0.165, 0.3], material: 'plate', position: [0, 0.0825, 0.23] },
      ...[1, -1].map((sx) => ({
        type: 'box',
        id: `shoulder_pad${sx}`,
        attach: 'chest',
        size: [0.1, 0.05, 0.22],
        material: 'pad',
        position: [sx * 0.11, 0.29, 0],
      })),
      { type: 'box', id: 'yoke', attach: 'chest', size: [0.62, 0.05, 0.06], position: [0, 0.31, -0.1] },
      lever('piston_l', [0.31, 0, -0.12], { prop: 'yoke', local: [0.31, 0, 0] }, 0.045),
      lever('piston_r', [-0.31, 0, -0.12], { prop: 'yoke', local: [-0.31, 0, 0] }, 0.045),
    ],
    camera: { target: [0, 1.0, 0], distance: 3.6, view: 'side' },
    poses: {
      down: calfStandPose(-12, [0.13, 0.175, 0.1]),
      up: calfStandPose(22, [0.13, 0.175, 0.1]),
    },
  },
  {
    name: 'Weighted Step-ups (on bench or box)',
    slug: 'weighted-step-up',
    muscles: [['quads', 'glutes'], ['hamstrings']],
    duration: 5,
    keys: [
      [0, 'floor'],
      [0.06, 'floor'],
      [0.2, 'placeL'],
      [0.34, 'driveR'],
      [0.44, 'up'],
      [0.52, 'up'],
      [0.62, 'liftR'],
      [0.74, 'downR'],
      [0.86, 'liftL'],
      [0.96, 'floor'],
      [1, 'floor'],
    ],
    props: [
      { type: 'box', id: 'box', size: [0.5, 0.45, 0.45], material: 'pad', position: [0, 0.225, 0.525] },
      { type: 'dumbbell', attach: 'wrist_l', position: [0, -0.02, 0], rotation: [0, 90, 0] },
      { type: 'dumbbell', attach: 'wrist_r', position: [0, -0.02, 0], rotation: [0, 90, 0] },
    ],
    camera: { target: [0, 1.0, 0.25], distance: 3.8, view: 'side' },
    poses: {
      floor: stepBody([0, STAND_Y - 0.01, 0], 2, [0.12, ankleY, 0], [-0.12, ankleY, 0]),
      placeL: stepBody([0, 0.93, 0.08], 16, [0.12, BOX_TOP, 0.45], [-0.12, ankleY, 0]),
      driveR: stepBody([0, 1.28, 0.36], 8, [0.12, BOX_TOP, 0.45], [-0.12, 0.62, 0.22]),
      up: stepBody([0, STAND_Y - 0.01 + 0.45, 0.45], 2, [0.12, BOX_TOP, 0.45], [-0.12, BOX_TOP, 0.45]),
      liftR: stepBody([0, 1.28, 0.38], 6, [0.12, BOX_TOP, 0.45], [-0.12, 0.6, 0.2]),
      downR: stepBody([0, 0.93, 0.1], 14, [0.12, BOX_TOP, 0.45], [-0.12, ankleY, 0]),
      liftL: stepBody([0, STAND_Y - 0.03, 0.03], 4, [0.12, 0.58, 0.15], [-0.12, ankleY, 0]),
    },
  },
  {
    name: 'Bodyweight Squats',
    slug: 'bodyweight-squat',
    muscles: [
      ['quads', 'glutes'],
      ['hamstrings', 'core'],
    ],
    ...squatKeys(3.0),
    props: [],
    camera: { target: [0, 0.85, 0], distance: 3.3, view: 'side' },
    poses: {
      top: {
        root: [0, STAND_Y - 0.004, 0],
        torso: 4,
        neck: 0,
        ...legs(foot(0.17, 0.03, { pole: [0.4, 0, 1], footYaw: 12 })),
        ...arms({ flex: 15, abd: 6, elbow: 10, world: true }),
      },
      bottom: {
        root: [0, 0.53, -0.12],
        torso: 30,
        neck: -22,
        ...legs(foot(0.17, 0.03, { pole: [0.4, 0, 1], footYaw: 12 })),
        ...arms({ flex: 85, abd: 6, elbow: 5, world: true }),
      },
    },
  },
  {
    ...goblet,
    name: 'Kettlebell Squats',
    slug: 'kettlebell-squat',
    aliases: undefined,
    props: [{ type: 'kettlebell', attach: 'chest', position: [0, 0.1, 0.19] }],
  },

  // ------------------------------------------------------------------ Friday
  {
    name: 'Incline Y-Raise',
    slug: 'incline-y-raise',
    muscles: [['shoulders', 'upper back'], ['rear delts']],
    tempo: SHOULDERS,
    ...tempoTimeline(SHOULDERS),
    props: [
      ...chestPad(),
      { type: 'dumbbell', attach: 'wrist_l', position: [0, -0.02, 0], rotation: [0, 90, 0] },
      { type: 'dumbbell', attach: 'wrist_r', position: [0, -0.02, 0], rotation: [0, 90, 0] },
    ],
    camera: { target: [0, 0.9, 0.25], distance: 3.6, view: 'front' },
    poses: {
      stretched: {
        ...CHEST_SUPPORTED_BODY,
        ...arms({
          ik: {
            arc: { center: [0.19, 0.16, 0], radius: 0.48, angle: 45, plane: 'yz', offset: [0.04, 0, 0] },
          },
          frame: 'chest',
          pole: [0.3, 0, -1],
        }),
      },
      contracted: {
        ...CHEST_SUPPORTED_BODY,
        ...arms({
          ik: {
            arc: { center: [0.19, 0.16, 0], radius: 0.48, angle: 168, plane: 'yz', offset: [0.2, 0, 0] },
          },
          frame: 'chest',
          pole: [1, 0, -0.2],
        }),
      },
    },
  },
  {
    name: 'Lying Dumbbell Rear Delt Flyes',
    slug: 'lying-dumbbell-rear-delt-fly',
    // Shown prone on an incline bench (chest supported).
    muscles: [['rear delts'], ['upper back', 'shoulders']],
    tempo: SHOULDERS,
    ...tempoTimeline(SHOULDERS),
    props: [
      ...chestPad(),
      { type: 'dumbbell', attach: 'wrist_l', position: [0, -0.02, 0], rotation: [0, 90, 0] },
      { type: 'dumbbell', attach: 'wrist_r', position: [0, -0.02, 0], rotation: [0, 90, 0] },
    ],
    camera: { target: [0, 0.85, 0.25], distance: 3.6, view: 'front' },
    poses: {
      stretched: {
        ...CHEST_SUPPORTED_BODY,
        ...arms({
          ik: {
            arc: { center: [0.19, 0.16, 0], radius: 0.38, angle: 3, plane: 'xz', offset: [0, -0.38, 0] },
          },
          frame: 'chest',
          pole: [0.2, 0, -1],
        }),
      },
      contracted: {
        ...CHEST_SUPPORTED_BODY,
        ...arms({
          ik: {
            arc: { center: [0.19, 0.16, 0], radius: 0.5, angle: 85, plane: 'xz', offset: [0, -0.06, 0] },
          },
          frame: 'chest',
          pole: [0.2, 0, -1],
        }),
      },
    },
  },
  {
    name: 'Hammer Dumbbell Front Raise',
    slug: 'hammer-dumbbell-front-raise',
    muscles: [['shoulders'], ['chest']],
    tempo: SHOULDERS,
    ...tempoTimeline(SHOULDERS),
    props: [
      { type: 'dumbbell', attach: 'wrist_l', position: [0, -0.02, 0], rotation: [0, 90, 0] },
      { type: 'dumbbell', attach: 'wrist_r', position: [0, -0.02, 0], rotation: [0, 90, 0] },
    ],
    camera: { target: [0, 1.1, 0.15], distance: 3.6, view: 'side' },
    poses: {
      stretched: {
        root: [0, STAND_Y - 0.01, 0],
        torso: 2,
        neck: 0,
        ...legs(foot(0.14, 0)),
        ...arms({ flex: 10, abd: 8, elbow: 8, world: true }),
      },
      contracted: {
        root: [0, STAND_Y - 0.01, 0],
        torso: 2,
        neck: 0,
        ...legs(foot(0.14, 0)),
        ...arms({ flex: 88, abd: 8, elbow: 8, world: true }),
      },
    },
  },
  {
    name: 'Cable Pushdown w/ Rope',
    slug: 'cable-rope-pushdown',
    aliases: ['Triceps Pushdown'],
    muscles: [['triceps'], []],
    ...tempoTimeline(UNTIMED),
    props: [...pushdownStation.props, ...rope(pushdownStation)],
    camera: { target: [0, 1.2, 0.2], distance: 3.6, view: 'side' },
    poses: {
      stretched: {
        root: [0, STAND_Y - 0.02, -0.04],
        torso: 10,
        neck: -4,
        ...legs(foot(0.15, 0)),
        ...arms({ flex: 8, abd: 6, elbow: 105, world: true }),
      },
      contracted: {
        root: [0, STAND_Y - 0.02, -0.04],
        torso: 10,
        neck: -4,
        ...legs(foot(0.15, 0)),
        ...arms({ flex: 4, abd: 10, elbow: 4, world: true }),
      },
    },
  },
  {
    name: 'Single Hand Cable Pushdown',
    slug: 'single-hand-cable-pushdown',
    // Coach cue: supinated grip, start at the opposite pec, push down and outward.
    muscles: [['triceps'], []],
    ...tempoTimeline(UNTIMED),
    props: [
      ...singlePushStation.props,
      { type: 'dHandle', id: 'handle', attach: 'wrist_r', strap: false },
      cable('cable', singlePushStation.pulley, { node: 'wrist_r' }),
    ],
    camera: { target: [0, 1.2, 0.1], distance: 3.6, view: 'front' },
    poses: {
      stretched: {
        root: [0, STAND_Y - 0.015, 0],
        torso: 6,
        neck: 0,
        ...legs(foot(0.14, 0)),
        armL: { flex: 0, abd: 10, elbow: 20, world: true },
        armR: { ik: [0.06, 1.32, 0.22], pole: [-0.6, -1, -0.2] },
      },
      contracted: {
        root: [0, STAND_Y - 0.015, 0],
        torso: 6,
        neck: 0,
        ...legs(foot(0.14, 0)),
        armL: { flex: 0, abd: 10, elbow: 20, world: true },
        armR: { ik: [-0.33, 0.92, 0.12], pole: [-0.6, -1, -0.2] },
      },
    },
  },
  {
    name: 'Overhead Cable Tricep Extension',
    slug: 'overhead-cable-tricep-extension',
    muscles: [['triceps'], []],
    ...tempoTimeline(UNTIMED),
    props: [...overheadStation.props, ...rope(overheadStation)],
    camera: { target: [0, 1.3, 0], distance: 3.8, view: 'side' },
    poses: {
      stretched: {
        root: [0, STAND_Y - 0.035, 0.03],
        torso: 20,
        neck: -10,
        legL: foot(0.13, 0.25),
        legR: mirrorLimb(foot(0.13, -0.2)),
        ...arms({ flex: 150, abd: 10, elbow: 120, world: true }),
      },
      contracted: {
        root: [0, STAND_Y - 0.035, 0.03],
        torso: 20,
        neck: -10,
        legL: foot(0.13, 0.25),
        legR: mirrorLimb(foot(0.13, -0.2)),
        ...arms({ flex: 155, abd: 10, elbow: 8, world: true }),
      },
    },
  },
  {
    name: 'Seated Triceps Pushdown Machine',
    slug: 'seated-triceps-pushdown-machine',
    muscles: [['triceps'], []],
    ...tempoTimeline(UNTIMED),
    props: [...seat('seat'), ...backrest(), ...pivotLevers(pushdownMachinePivot)],
    camera: { target: [0, 0.85, -0.1], distance: 3.4, view: 'side' },
    poses: {
      stretched: {
        root: [0, SEAT_Y, 0],
        torso: 0,
        neck: 0,
        ...seatedLegs(0.17),
        ...seatedArc([0.27, 0.775, -0.42], 0.535, 103.5, [0.2, -0.3, -1]),
      },
      contracted: {
        root: [0, SEAT_Y, 0],
        torso: 0,
        neck: 0,
        ...seatedLegs(0.17),
        ...seatedArc([0.27, 0.775, -0.42], 0.535, 61.5, [0.2, -0.3, -1]),
      },
    },
  },
  {
    name: 'Cable Tricep Kickback',
    slug: 'cable-tricep-kickback',
    muscles: [['triceps'], []],
    ...tempoTimeline(UNTIMED),
    props: [
      ...kickbackStation.props,
      { type: 'dHandle', id: 'handle', attach: 'wrist_l', strap: false },
      cable('cable', kickbackStation.pulley, { node: 'wrist_l' }),
    ],
    camera: { target: [0, 0.9, 0.1], distance: 3.6, view: 'side' },
    poses: {
      stretched: {
        root: [0, 0.88, -0.12],
        torso: 55,
        neck: -25,
        legL: foot(0.14, 0.12),
        legR: mirrorLimb(foot(0.14, -0.15)),
        armL: { flex: -65, abd: 6, elbow: 95, world: true },
        armR: { ik: [-0.15, 0.72, 0.2], pole: [-0.5, -1, 0] },
      },
      contracted: {
        root: [0, 0.88, -0.12],
        torso: 55,
        neck: -25,
        legL: foot(0.14, 0.12),
        legR: mirrorLimb(foot(0.14, -0.15)),
        armL: { flex: -67, abd: 6, elbow: 4, world: true },
        armR: { ik: [-0.15, 0.72, 0.2], pole: [-0.5, -1, 0] },
      },
    },
  },
  {
    name: 'Pec Deck Machine Chest Flyes',
    slug: 'pec-deck-fly',
    muscles: [['chest'], ['shoulders']],
    tempo: CHEST,
    ...tempoTimeline(CHEST),
    props: [
      ...seat('seat'),
      ...backrest(0.7),
      { type: 'box', id: 'tower', size: [0.08, 1.72, 0.08], position: [0, 0.86, -0.38] },
      { type: 'box', id: 'boom', size: [0.06, 0.06, 0.38], position: [0, 1.69, -0.19] },
      { type: 'box', id: 'crossbar', size: [0.5, 0.06, 0.06], position: [0, 1.69, -0.02] },
      ...[1, -1].flatMap((sx) => {
        const side = sx > 0 ? 'l' : 'r';
        const pivot = [sx * pecDeckPivot[0], pecDeckPivot[1], pecDeckPivot[2]];
        return [
          lever(`arm_${side}`, pivot, { node: `wrist_${side}` }, 0.035),
          { type: 'dHandle', id: `handle_${side}`, attach: `wrist_${side}`, strap: false },
        ];
      }),
    ],
    camera: { target: [0, 1.0, 0.1], distance: 3.6, view: 'front' },
    poses: {
      stretched: {
        root: [0, SEAT_Y, 0],
        torso: -4,
        neck: 0,
        ...seatedLegs(0.17),
        ...arms({
          ik: { arc: { center: [0.19, 1.0, -0.02], radius: 0.5, angle: 98, plane: 'xz' } },
          pole: [0.5, -1, -0.3],
        }),
      },
      contracted: {
        root: [0, SEAT_Y, 0],
        torso: -4,
        neck: 0,
        ...seatedLegs(0.17),
        ...arms({
          ik: { arc: { center: [0.19, 1.0, -0.02], radius: 0.5, angle: -18, plane: 'xz' } },
          pole: [0.5, -1, -0.3],
        }),
      },
    },
  },
  {
    name: 'Seated Machine Press',
    slug: 'seated-machine-chest-press',
    aliases: ['Machine Chest Press'],
    muscles: [['chest'], ['triceps', 'shoulders']],
    tempo: CHEST,
    ...tempoTimeline(CHEST),
    props: [
      ...seat('seat'),
      ...backrest(),
      ...pivotLevers(seatedPressPivot, { handle: [0, 0, 0] }),
      { type: 'box', id: 'top_beam', size: [0.72, 0.06, 0.06], position: [0, 1.9, 0.32] },
    ],
    camera: { target: [0, 1.05, 0.2], distance: 3.6, view: 'side' },
    poses: {
      stretched: {
        root: [0, SEAT_Y, 0],
        torso: -3,
        neck: 0,
        ...seatedLegs(0.17),
        ...seatedArc([0.26, 1.9, 0.32], 0.94, -12.3, [0.7, -1, -0.2]),
      },
      contracted: {
        root: [0, SEAT_Y, 0],
        torso: -3,
        neck: 0,
        ...seatedLegs(0.17),
        ...seatedArc([0.26, 1.9, 0.32], 0.94, 12.3, [0.7, -1, -0.2], [-0.06, 0, 0]),
      },
    },
  },
  {
    name: 'Incline Machine Press',
    slug: 'incline-machine-press',
    muscles: [['chest'], ['shoulders', 'triceps']],
    tempo: CHEST,
    ...tempoTimeline(CHEST),
    props: [...seat('seat'), ...backrest(0.7), ...pivotLevers(inclinePressPivot, { handle: [0, 0, 0] })],
    camera: { target: [0, 1.1, -0.1], distance: 3.6, view: 'side' },
    poses: {
      stretched: {
        root: [0, SEAT_Y, 0],
        torso: -25,
        neck: 10,
        ...seatedLegs(0.17),
        ...seatedArc([0.27, 1.945, -0.4], 1.016, 24.4, [0.7, -1, -0.3]),
      },
      contracted: {
        root: [0, SEAT_Y, 0],
        torso: -25,
        neck: 10,
        ...seatedLegs(0.17),
        ...seatedArc([0.27, 1.945, -0.4], 1.016, 42, [0.7, -1, -0.3], [-0.05, 0, 0]),
      },
    },
  },
  {
    name: 'Smith Machine Flat Bench',
    slug: 'smith-machine-flat-bench',
    muscles: [['chest'], ['triceps', 'shoulders']],
    tempo: CHEST,
    ...tempoTimeline(CHEST),
    props: [
      { type: 'bench', position: [0, 0, 0] },
      ...[1, -1].flatMap((sx) => [
        { type: 'box', id: `rail${sx}`, size: [0.05, 2.1, 0.05], position: [sx * 0.58, 1.05, -0.13] },
        { type: 'box', id: `rail_base${sx}`, size: [0.07, 0.03, 0.7], position: [sx * 0.58, 0.015, -0.13] },
      ]),
      { type: 'box', id: 'rail_top', size: [1.24, 0.06, 0.06], position: [0, 2.1, -0.13] },
      { type: 'barbell', id: 'bar', smith: 0.58, between: ['wrist_l', 'wrist_r'], offset: [0, 0.015, 0] },
    ],
    camera: { target: [0, 0.75, -0.1], distance: 3.6, view: 'side' },
    poses: Object.fromEntries(
      [
        ['stretched', 0.72],
        ['contracted', 1.05],
      ].map(([pose, y]) => [
        pose,
        {
          root: [0, 0.54, 0.24],
          rootPitch: -90,
          torso: 0,
          neck: 4,
          ...legs({ ik: [0.26, ankleY, 0.66], pole: [0.25, 0, 1], footPitch: 0 }),
          ...arms({ ik: [0.28, y, -0.13], pole: [0.8, -0.6, -0.4] }),
        },
      ]),
    ),
  },
  {
    name: 'Chest Dips',
    slug: 'chest-dip',
    aliases: ['Dip'],
    muscles: [['chest'], ['triceps', 'shoulders']],
    tempo: CHEST,
    ...tempoTimeline(CHEST),
    props: [
      ...[1, -1].flatMap((sx) => [
        {
          type: 'cyl',
          id: `bar${sx}`,
          axis: 'z',
          radius: 0.02,
          length: 0.62,
          material: 'metal',
          position: [sx * 0.27, 1.25, 0],
        },
        { type: 'box', id: `post_front${sx}`, size: [0.05, 1.25, 0.05], position: [sx * 0.27, 0.625, 0.3] },
        { type: 'box', id: `post_back${sx}`, size: [0.05, 1.25, 0.05], position: [sx * 0.27, 0.625, -0.3] },
      ]),
    ],
    camera: { target: [0, 1.25, 0], distance: 3.8, view: 'side' },
    poses: {
      stretched: {
        root: [0, 1.08, -0.04],
        torso: 32,
        neck: -12,
        ...legs({ flex: 15, abd: 0, knee: 75 }),
        ...arms({ ik: [0.27, 1.27, 0.02], pole: [0.3, -0.4, -1] }),
      },
      contracted: {
        root: [0, 1.37, -0.12],
        torso: 22,
        neck: -10,
        ...legs({ flex: 15, abd: 0, knee: 75 }),
        ...arms({ ik: [0.27, 1.27, 0.02], pole: [0.3, -0.4, -1] }),
      },
    },
  },
];
