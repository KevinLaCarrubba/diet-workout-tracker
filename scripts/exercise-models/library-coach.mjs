// Coach-plan exercises (batch 1): keyed by the coach's exact exercise names.
// Where the coach gave a tempo (eccentric-pause-concentric-pause, seconds) the
// clip follows it via tempoTimeline(); the manifest records it as `tempo`.
// Machines are composed from generic props (boxes, cable stations, levers).

import {
  DIM,
  SEAT_Y,
  STAND_Y,
  alternatingTimeline,
  arms,
  cable,
  cableStation,
  foot,
  legs,
  lever,
  mirrorLimb,
  seat,
  tempoTimeline,
} from './kit.mjs';

const BACK = '2-1-2-0';
const SHOULDERS = '1-2-1-0';
const CHEST = '2-3-1-0';
const UNTIMED = '1.6-0.3-1.2-0.3'; // smooth default for exercises without a coach tempo

/** Feet planted under a seat, knees bent ~90°. */
const seatedLegs = (x = 0.16, z = 0.42) => legs(foot(x, z, { pole: [0.2, 0.4, 1] }));

/** Holds still props in place; the same values are reused by several exercises. */
const thighPad = (id, z = 0.3) => [
  {
    type: 'cyl',
    id: `${id}_roll`,
    axis: 'x',
    radius: 0.045,
    length: 0.5,
    material: 'pad',
    position: [0, 0.665, z],
  },
  { type: 'box', id: `${id}_arm`, size: [0.05, 0.05, 0.24], position: [0, 0.665, z + 0.12] },
  { type: 'box', id: `${id}_post`, size: [0.05, 0.665, 0.05], position: [0, 0.3325, z + 0.23] },
];

// Body reclined on a 30° incline bench (hips pitched back 60°), feet on the floor.
const INCLINE_BODY = {
  root: [0, 0.58, 0.05],
  rootPitch: -60,
  torso: 0,
  neck: 10,
  ...legs({ ik: [0.22, DIM.ankleY, 0.62], pole: [0.2, 0, 1], footPitch: 0 }),
};
const inclineBench = () => [
  // Back pad rides on the spine so it sits flush with the (static) torso.
  {
    type: 'box',
    id: 'bench_back',
    attach: 'spine',
    size: [0.32, 0.8, 0.06],
    material: 'pad',
    position: [0, 0.28, -0.155],
  },
  { type: 'box', id: 'bench_seat', size: [0.32, 0.07, 0.36], material: 'pad', position: [0, 0.415, 0.17] },
  { type: 'box', id: 'bench_post', size: [0.06, 0.38, 0.06], position: [0, 0.19, 0.17] },
  { type: 'box', id: 'bench_rail', size: [0.06, 0.04, 0.85], position: [0, 0.02, -0.22] },
  { type: 'box', id: 'bench_foot', size: [0.4, 0.03, 0.06], position: [0, 0.015, -0.62] },
  lever('bench_strut', [0, 0.03, -0.55], { prop: 'bench_back', local: [0, -0.1, -0.03] }, 0.03),
];

// Prone on an incline bench (chest supported), hips pitched forward 45°.
const CHEST_SUPPORTED_BODY = {
  root: [0, 0.78, 0],
  rootPitch: 45,
  torso: 0,
  neck: -22,
  ...legs({ ik: [0.16, DIM.ankleY, -0.28], pole: [0.2, 0, 1], footPitch: 0 }),
};
const chestPad = () => [
  {
    type: 'box',
    id: 'pad',
    attach: 'chest',
    size: [0.28, 0.42, 0.06],
    material: 'pad',
    position: [0, -0.14, 0.17],
  },
  lever('pad_strut', { prop: 'pad', local: [0, -0.12, 0.03] }, [0, 0.02, 0.4], 0.035),
  { type: 'box', id: 'pad_base', size: [0.45, 0.03, 0.5], position: [0, 0.015, 0.4] },
];

const latStation = (() => {
  const pulley = [0, 2.2, 0.12];
  return {
    pulley,
    props: [
      { type: 'cableColumn', id: 'column', position: [0, 0, 0.85] },
      { type: 'box', id: 'beam', size: [0.08, 0.08, 0.8], position: [0, 2.29, 0.47] },
      { type: 'pulley', id: 'pulley', position: pulley },
    ],
  };
})();

// ---------------------------------------------------------------------------

const pushdownStation = cableStation('st', { z: 0.85, pulleyY: 2.05 });
const rowStation = cableStation('st', { z: 1.05, pulleyY: 0.55 });
const highElbowStation = cableStation('st', { z: 1.15, pulleyY: 0.35 });
const curlStation = cableStation('st', { x: 0.26, z: -0.8, pulleyY: 0.3 });
const faceStation = cableStation('st', { z: 1.05, pulleyY: 1.65 });
const flyLeft = cableStation('left', { x: 1.0, z: 0.25, pulleyY: 0.45 });
const flyRight = cableStation('right', { x: -1.0, z: 0.25, pulleyY: 0.45 });
const sideStation = cableStation('st', { x: 0.5, z: 0.12, pulleyY: 0.22 });
const frontStation = cableStation('st', { z: -0.62, pulleyY: 0.15 });
const crossLeft = cableStation('left', { x: 0.95, z: -0.05, pulleyY: 1.95 });
const crossRight = cableStation('right', { x: -0.95, z: -0.05, pulleyY: 1.95 });
const lowStation = cableStation('st', { z: 1.15, pulleyY: 0.25 });
const highStation = cableStation('st', { z: 1.0, pulleyY: 1.95 });

const highRowPivot = [-0.36, 1.65, -0.24];
const pressPivot = [0.36, 1.198, -0.81];
const vikingPivot = [0, 0.05, 2.4];
const pulloverPivot = [0.34, 1.01, 0];

const rope = (station) => {
  const knot = {
    knot: { a: { node: 'wrist_l' }, b: { node: 'wrist_r' }, toward: station.pulley, length: 0.32 },
  };
  return [
    cable('cable', station.pulley, knot),
    {
      type: 'link',
      id: 'rope_l',
      from: knot,
      to: { node: 'wrist_l' },
      radius: 0.014,
      material: 'rope',
      length: 0.32,
    },
    {
      type: 'link',
      id: 'rope_r',
      from: knot,
      to: { node: 'wrist_r' },
      radius: 0.014,
      material: 'rope',
      length: 0.32,
    },
  ];
};

export const COACH_EXERCISES = [
  // ------------------------------------------------------------------ Sunday
  {
    name: 'Cable Lat Pushdowns',
    slug: 'cable-lat-pushdown',
    muscles: [
      ['back', 'lats'],
      ['triceps', 'core'],
    ],
    tempo: BACK,
    ...tempoTimeline(BACK),
    props: [
      ...pushdownStation.props,
      { type: 'cableBar', id: 'bar', between: ['wrist_l', 'wrist_r'] },
      cable('cable', pushdownStation.pulley, { prop: 'bar' }),
    ],
    camera: { target: [0, 1.15, 0.25], distance: 3.8, view: 'side' },
    poses: {
      stretched: {
        root: [0, STAND_Y - 0.03, -0.05],
        torso: 22,
        neck: -14,
        ...legs(foot(0.15, 0, { pole: [0.2, 0, 1] })),
        ...arms({ flex: 105, abd: 6, elbow: 18, world: true }),
      },
      contracted: {
        root: [0, STAND_Y - 0.03, -0.05],
        torso: 22,
        neck: -14,
        ...legs(foot(0.15, 0, { pole: [0.2, 0, 1] })),
        ...arms({ flex: 10, abd: 6, elbow: 14, world: true }),
      },
    },
  },
  {
    name: 'Seated Neutral Grip Lat Pulldown',
    slug: 'seated-neutral-grip-lat-pulldown',
    muscles: [
      ['back', 'lats'],
      ['biceps', 'rear delts'],
    ],
    tempo: BACK,
    ...tempoTimeline(BACK),
    props: [
      ...seat('seat'),
      ...thighPad('thigh'),
      ...latStation.props,
      { type: 'neutralBar', id: 'bar', spread: 0.25, between: ['wrist_l', 'wrist_r'] },
      cable('cable', latStation.pulley, { prop: 'bar', local: [0, 0.06, 0] }),
    ],
    camera: { target: [0, 1.2, 0.2], distance: 3.8, view: 'side' },
    poses: {
      stretched: {
        root: [0, SEAT_Y, 0],
        torso: -6,
        neck: 0,
        ...seatedLegs(),
        ...arms({ ik: [0.25, 1.5, 0.12], pole: [0.5, -1, -0.2] }),
      },
      contracted: {
        root: [0, SEAT_Y, 0],
        torso: -14,
        neck: 4,
        ...seatedLegs(),
        ...arms({ ik: [0.25, 1.1, 0.12], pole: [0.5, -1, -0.4] }),
      },
    },
  },
  {
    name: 'Seated Close Grip Row',
    slug: 'seated-close-grip-row',
    muscles: [
      ['back', 'lats'],
      ['biceps', 'rear delts'],
    ],
    tempo: BACK,
    ...tempoTimeline(BACK),
    props: [
      { type: 'box', id: 'bench', size: [0.3, 0.07, 0.9], material: 'pad', position: [0, 0.385, -0.05] },
      { type: 'box', id: 'bench_frame', size: [0.08, 0.35, 0.9], position: [0, 0.175, -0.05] },
      {
        type: 'box',
        id: 'footplate',
        size: [0.5, 0.3, 0.04],
        material: 'plate',
        position: [0, 0.31, 0.72],
        rotation: [30, 0, 0],
      },
      { type: 'box', id: 'footplate_base', size: [0.5, 0.03, 0.5], position: [0, 0.015, 0.8] },
      ...rowStation.props,
      { type: 'vHandle', id: 'vh', between: ['wrist_l', 'wrist_r'] },
      cable('cable', rowStation.pulley, { prop: 'vh', local: [0, 0, 0.13] }),
    ],
    camera: { target: [0, 0.7, 0.3], distance: 3.6, view: 'side' },
    poses: {
      stretched: {
        root: [0, 0.53, -0.1],
        torso: 14,
        neck: -6,
        ...legs({ ik: [0.13, 0.3, 0.6], pole: [0.15, 1, 0.4], footPitch: -60 }),
        ...arms({ ik: [0.05, 0.84, 0.5], pole: [0.3, -1, -0.2] }),
      },
      contracted: {
        root: [0, 0.53, -0.1],
        torso: -4,
        neck: 0,
        ...legs({ ik: [0.13, 0.3, 0.6], pole: [0.15, 1, 0.4], footPitch: -60 }),
        ...arms({ ik: [0.05, 0.8, 0.16], pole: [0.3, -0.4, -1] }),
      },
    },
  },
  {
    name: 'Bent-over Cable High Elbow Row',
    slug: 'bent-over-cable-high-elbow-row',
    muscles: [['back', 'rear delts'], ['biceps']],
    tempo: BACK,
    ...tempoTimeline(BACK),
    props: [
      ...highElbowStation.props,
      { type: 'cableBar', id: 'bar', between: ['wrist_l', 'wrist_r'] },
      cable('cable', highElbowStation.pulley, { prop: 'bar' }),
    ],
    camera: { target: [0, 0.85, 0.3], distance: 3.8, view: 'side' },
    poses: {
      stretched: {
        root: [0, 0.86, -0.15],
        torso: 50,
        neck: -28,
        ...legs(foot(0.15, 0.05, { pole: [0.25, 0, 1] })),
        ...arms({ ik: [0.22, 0.24, 0.52], frame: 'chest', pole: [0.6, -0.4, -0.6] }),
      },
      contracted: {
        root: [0, 0.86, -0.15],
        torso: 50,
        neck: -28,
        ...legs(foot(0.15, 0.05, { pole: [0.25, 0, 1] })),
        ...arms({ ik: [0.27, 0.1, 0.2], frame: 'chest', pole: [1, 0.2, -0.6] }),
      },
    },
  },
  {
    name: 'Seated Machine High Row w/ Twist (Single Hand)',
    slug: 'seated-machine-high-row-twist',
    muscles: [
      ['back', 'lats'],
      ['biceps', 'rear delts', 'core'],
    ],
    tempo: BACK,
    ...tempoTimeline(BACK),
    props: [
      ...seat('seat'),
      ...thighPad('thigh'),
      lever('frame', [-0.36, 0, -0.45], highRowPivot, 0.05),
      { type: 'box', id: 'hub', size: [0.08, 0.1, 0.1], position: highRowPivot },
      lever('lever', highRowPivot, { node: 'wrist_r', offset: [-0.06, 0, 0] }, 0.035),
      { type: 'dHandle', id: 'handle', attach: 'wrist_r', strap: false },
    ],
    camera: { target: [0, 1.05, 0], distance: 3.6, view: 'front' },
    poses: {
      stretched: {
        root: [0, SEAT_Y, 0],
        torso: 4,
        twist: 12,
        neck: 0,
        ...seatedLegs(),
        armL: { ik: [0.2, 0.64, 0.3], pole: [0.8, -0.6, 0] },
        armR: {
          ik: { arc: { center: [-0.22, 1.65, -0.24], radius: 0.676, angle: 66, plane: 'yz' } },
          pole: [-0.7, -0.8, -0.2],
        },
      },
      contracted: {
        root: [0, SEAT_Y, 0],
        torso: -4,
        twist: -22,
        neck: 0,
        ...seatedLegs(),
        armL: { ik: [0.2, 0.64, 0.3], pole: [0.8, -0.6, 0] },
        armR: {
          ik: { arc: { center: [-0.22, 1.65, -0.24], radius: 0.676, angle: 10, plane: 'yz' } },
          pole: [-0.7, -0.8, -0.2],
        },
      },
    },
  },
  {
    name: 'Standing Single Arm Bicep Cable Curl',
    slug: 'standing-single-arm-cable-curl',
    muscles: [['biceps'], ['forearms']],
    ...tempoTimeline(UNTIMED),
    props: [
      ...curlStation.props,
      { type: 'dHandle', id: 'handle', attach: 'wrist_l', strap: false },
      cable('cable', curlStation.pulley, { node: 'wrist_l', offset: [0, -0.02, 0] }),
    ],
    camera: { target: [0, 1.0, -0.15], distance: 3.8, view: 'side' },
    poses: {
      stretched: {
        root: [0, STAND_Y - 0.035, 0.03],
        torso: 4,
        neck: -2,
        legL: foot(0.13, -0.2),
        legR: mirrorLimb(foot(0.13, 0.24)),
        armL: { flex: -14, abd: 6, elbow: 8, world: true },
        armR: { flex: 4, abd: 8, elbow: 12, world: true },
      },
      contracted: {
        root: [0, STAND_Y - 0.035, 0.03],
        torso: 4,
        neck: -2,
        legL: foot(0.13, -0.2),
        legR: mirrorLimb(foot(0.13, 0.24)),
        armL: { flex: 16, abd: 6, elbow: 132, world: true },
        armR: { flex: 4, abd: 8, elbow: 12, world: true },
      },
    },
  },
  {
    name: 'Standing Dumbbell Hammer Curls',
    slug: 'standing-dumbbell-hammer-curl',
    muscles: [['biceps', 'forearms'], []],
    ...alternatingTimeline(UNTIMED, 'rest', 'left', 'right'),
    props: [
      { type: 'dumbbell', attach: 'wrist_l', position: [0, -0.02, 0], rotation: [0, 90, 0] },
      { type: 'dumbbell', attach: 'wrist_r', position: [0, -0.02, 0], rotation: [0, 90, 0] },
    ],
    camera: { target: [0, 1.05, 0], distance: 3.4, view: 'front' },
    poses: {
      rest: {
        root: [0, STAND_Y - 0.008, 0],
        torso: 0,
        neck: 0,
        ...legs(foot(0.13, 0)),
        ...arms({ flex: 0, abd: 8, elbow: 6, world: true }),
      },
      left: {
        root: [0, STAND_Y - 0.008, 0],
        torso: 0,
        neck: 0,
        ...legs(foot(0.13, 0)),
        armL: { flex: 10, abd: 8, elbow: 135, world: true },
        armR: { flex: 0, abd: 8, elbow: 6, world: true },
      },
      right: {
        root: [0, STAND_Y - 0.008, 0],
        torso: 0,
        neck: 0,
        ...legs(foot(0.13, 0)),
        armL: { flex: 0, abd: 8, elbow: 6, world: true },
        armR: { flex: 10, abd: 8, elbow: 135, world: true },
      },
    },
  },
  {
    name: 'Seated Bicep Preacher Curl Machine',
    slug: 'seated-preacher-curl-machine',
    muscles: [['biceps'], ['forearms']],
    ...tempoTimeline(UNTIMED),
    props: [
      ...seat('seat', { top: 0.5, z: -0.08 }),
      // The arm pad rides on the (static) left upper arm so it sits flush under both arms.
      {
        type: 'box',
        id: 'pad',
        attach: 'shoulder_l',
        size: [0.56, 0.28, 0.05],
        material: 'pad',
        position: [-0.19, -0.17, -0.08],
      },
      lever('pad_strut', { prop: 'pad', local: [0, 0, -0.03] }, [0, 0.02, 0.34], 0.035),
      { type: 'box', id: 'pad_base', size: [0.45, 0.03, 0.4], position: [0, 0.015, 0.34] },
      lever(
        'lever_l',
        { node: 'elbow_l', offset: [0.13, 0, 0] },
        { node: 'wrist_l', offset: [0.13, 0, 0] },
        0.03,
      ),
      lever(
        'lever_r',
        { node: 'elbow_r', offset: [-0.13, 0, 0] },
        { node: 'wrist_r', offset: [-0.13, 0, 0] },
        0.03,
      ),
      { type: 'cableBar', id: 'bar', length: 0.62, between: ['wrist_l', 'wrist_r'] },
    ],
    camera: { target: [0, 0.85, 0.1], distance: 3.3, view: 'side' },
    poses: {
      stretched: {
        root: [0, 0.61, -0.05],
        torso: 14,
        neck: -8,
        ...legs(foot(0.17, 0.38, { pole: [0.2, 0.4, 1] })),
        ...arms({ flex: 52, abd: 0, elbow: 18, world: true }),
      },
      contracted: {
        root: [0, 0.61, -0.05],
        torso: 14,
        neck: -8,
        ...legs(foot(0.17, 0.38, { pole: [0.2, 0.4, 1] })),
        ...arms({ flex: 52, abd: 0, elbow: 125, world: true }),
      },
    },
  },

  // ------------------------------------------------------------------ Monday
  {
    name: 'Cable Rope Face Pulls',
    slug: 'cable-rope-face-pull',
    muscles: [['rear delts', 'upper back'], ['shoulders']],
    tempo: SHOULDERS,
    ...tempoTimeline(SHOULDERS),
    props: [...faceStation.props, ...rope(faceStation)],
    camera: { target: [0, 1.35, 0.35], distance: 3.6, view: 'side' },
    poses: {
      stretched: {
        root: [0, STAND_Y - 0.01, -0.02],
        torso: 2,
        neck: 0,
        ...legs(foot(0.15, 0)),
        ...arms({ ik: [0.06, 1.56, 0.5], pole: [1, -0.5, -0.2] }),
      },
      contracted: {
        root: [0, STAND_Y - 0.01, -0.02],
        torso: -4,
        neck: 0,
        ...legs(foot(0.15, 0)),
        ...arms({ ik: [0.24, 1.6, 0.06], pole: [1, 0.3, -0.4] }),
      },
    },
  },
  {
    name: 'Bent Over Cable Rear Delt Flyes',
    slug: 'bent-over-cable-rear-delt-fly',
    muscles: [['rear delts'], ['upper back', 'shoulders']],
    tempo: SHOULDERS,
    ...tempoTimeline(SHOULDERS),
    props: [
      ...flyLeft.props,
      ...flyRight.props,
      { type: 'dHandle', id: 'handle_l', attach: 'wrist_l', strap: false },
      { type: 'dHandle', id: 'handle_r', attach: 'wrist_r', strap: false },
      // Crossed: each hand holds the opposite column's cable.
      cable('cable_l', flyRight.pulley, { node: 'wrist_l' }),
      cable('cable_r', flyLeft.pulley, { node: 'wrist_r' }),
    ],
    camera: { target: [0, 0.8, 0.2], distance: 4.2, view: 'front' },
    poses: {
      stretched: {
        root: [0, 0.86, -0.18],
        torso: 70,
        neck: -38,
        ...legs(foot(0.15, 0, { pole: [0.25, 0, 1] })),
        ...arms({ flex: 0, abd: -16, elbow: 14, world: true }),
      },
      contracted: {
        root: [0, 0.86, -0.18],
        torso: 70,
        neck: -38,
        ...legs(foot(0.15, 0, { pole: [0.25, 0, 1] })),
        ...arms({ flex: 0, abd: 78, elbow: 14, world: true }),
      },
    },
  },
  {
    name: 'Cable Side Lateral Raise',
    slug: 'cable-side-lateral-raise',
    muscles: [['shoulders'], []],
    tempo: SHOULDERS,
    ...tempoTimeline(SHOULDERS),
    props: [
      ...sideStation.props,
      { type: 'dHandle', id: 'handle', attach: 'wrist_r', strap: false },
      cable('cable', sideStation.pulley, { node: 'wrist_r' }),
    ],
    camera: { target: [0.1, 1.1, 0], distance: 3.8, view: 'front' },
    poses: {
      stretched: {
        root: [0, STAND_Y - 0.01, 0],
        torso: 4,
        sideBend: 4,
        neck: 0,
        ...legs(foot(0.13, 0)),
        armL: { ik: [0.42, 1.0, 0.1], pole: [0.3, -1, -0.4] },
        armR: { flex: 18, abd: -18, elbow: 12, world: true },
      },
      contracted: {
        root: [0, STAND_Y - 0.01, 0],
        torso: 4,
        sideBend: 4,
        neck: 0,
        ...legs(foot(0.13, 0)),
        armL: { ik: [0.42, 1.0, 0.1], pole: [0.3, -1, -0.4] },
        armR: { flex: 18, abd: 80, elbow: 12, world: true },
      },
    },
  },
  {
    name: 'Cable Front Raise',
    slug: 'cable-front-raise',
    muscles: [['shoulders'], ['chest']],
    tempo: SHOULDERS,
    ...tempoTimeline(SHOULDERS),
    props: [
      ...frontStation.props,
      { type: 'cableBar', id: 'bar', length: 0.6, between: ['wrist_l', 'wrist_r'] },
      cable('cable', frontStation.pulley, { prop: 'bar' }),
    ],
    camera: { target: [0, 1.0, 0], distance: 3.8, view: 'side' },
    poses: {
      stretched: {
        root: [0, STAND_Y - 0.01, 0],
        torso: 2,
        neck: 0,
        ...legs(foot(0.19, 0, { pole: [0.3, 0, 1] })),
        ...arms({ flex: 12, abd: 8, elbow: 8, world: true }),
      },
      contracted: {
        root: [0, STAND_Y - 0.01, 0],
        torso: 2,
        neck: 0,
        ...legs(foot(0.19, 0, { pole: [0.3, 0, 1] })),
        ...arms({ flex: 92, abd: 8, elbow: 8, world: true }),
      },
    },
  },
  {
    name: 'Seated Machine Overhead Press',
    slug: 'seated-machine-overhead-press',
    muscles: [['shoulders'], ['triceps']],
    tempo: SHOULDERS,
    ...tempoTimeline(SHOULDERS),
    props: [
      ...seat('seat'),
      {
        type: 'box',
        id: 'back',
        attach: 'spine',
        size: [0.36, 0.62, 0.06],
        material: 'pad',
        position: [0, 0.27, -0.15],
      },
      lever('back_strut', { prop: 'back', local: [0, -0.2, -0.03] }, [0, 0.02, -0.3], 0.04),
      ...[1, -1].flatMap((sx) => {
        const pivot = [sx * pressPivot[0], pressPivot[1], pressPivot[2]];
        const side = sx > 0 ? 'l' : 'r';
        return [
          lever(`post_${side}`, [pivot[0], 0, pivot[2]], pivot, 0.05),
          lever(`lever_${side}`, pivot, { node: `wrist_${side}`, offset: [sx * 0.07, 0, 0] }, 0.035),
          {
            type: 'dHandle',
            id: `handle_${side}`,
            attach: `wrist_${side}`,
            rotation: [0, 90, 0],
            strap: false,
          },
        ];
      }),
    ],
    camera: { target: [0, 1.05, -0.2], distance: 3.6, view: 'side' },
    poses: {
      stretched: {
        root: [0, SEAT_Y, 0],
        torso: -5,
        neck: 0,
        ...seatedLegs(0.17),
        ...arms({
          ik: { arc: { center: [0.27, 1.198, -0.81], radius: 0.875, angle: 83.6, plane: 'yz' } },
          pole: [0.5, -1, 0.4],
        }),
      },
      contracted: {
        root: [0, SEAT_Y, 0],
        torso: -5,
        neck: 0,
        ...seatedLegs(0.17),
        ...arms({
          ik: { arc: { center: [0.27, 1.198, -0.81], radius: 0.875, angle: 112.3, plane: 'yz' } },
          pole: [0.8, -0.6, 0.2],
        }),
      },
    },
  },
  {
    name: 'Standing Viking Press',
    slug: 'standing-viking-press',
    muscles: [['shoulders'], ['triceps', 'core']],
    tempo: SHOULDERS,
    ...tempoTimeline(SHOULDERS),
    props: [
      { type: 'box', id: 'anchor', size: [0.2, 0.08, 0.2], position: vikingPivot },
      { type: 'vikingHandle', id: 'vk', between: ['wrist_l', 'wrist_r'] },
      { ...lever('lever', vikingPivot, { prop: 'vk', local: [0, 0, 0.06] }, 0.025), material: 'metal' },
    ],
    camera: { target: [0, 1.1, 0.6], distance: 4.4, view: 'side' },
    poses: {
      stretched: {
        root: [0, STAND_Y - 0.012, -0.05],
        torso: 10,
        neck: -4,
        ...legs(foot(0.16, 0)),
        ...arms({
          ik: { arc: { center: [0.22, 0.05, 2.4], radius: 2.625, angle: -122.2, plane: 'yz' } },
          pole: [0.3, -1, 0.5],
        }),
      },
      contracted: {
        root: [0, STAND_Y - 0.012, -0.05],
        torso: 14,
        neck: 0,
        ...legs(foot(0.16, 0)),
        ...arms({
          ik: { arc: { center: [0.22, 0.05, 2.4], radius: 2.625, angle: -131, plane: 'yz' } },
          pole: [0.8, -0.5, 0.2],
        }),
      },
    },
  },
  {
    name: 'Incline Dumbbell Chest Flyes',
    slug: 'incline-dumbbell-chest-fly',
    muscles: [['chest'], ['shoulders']],
    tempo: CHEST,
    ...tempoTimeline(CHEST),
    props: [
      ...inclineBench(),
      { type: 'dumbbell', attach: 'wrist_l', position: [0, -0.02, 0], rotation: [0, 90, 0] },
      { type: 'dumbbell', attach: 'wrist_r', position: [0, -0.02, 0], rotation: [0, 90, 0] },
    ],
    camera: { target: [0, 0.85, -0.1], distance: 3.6, view: 'front' },
    poses: {
      stretched: {
        ...INCLINE_BODY,
        ...arms({
          ik: { arc: { center: [0.19, 0.16, 0], radius: 0.53, angle: 92, plane: 'xz' } },
          frame: 'chest',
          pole: [1, -0.3, -0.6],
        }),
      },
      contracted: {
        ...INCLINE_BODY,
        ...arms({
          ik: { arc: { center: [0.19, 0.16, 0], radius: 0.53, angle: -16, plane: 'xz' } },
          frame: 'chest',
          pole: [1, -0.3, -0.6],
        }),
      },
    },
  },
  {
    name: 'Cable Crossovers',
    slug: 'cable-crossover',
    muscles: [['chest'], ['shoulders']],
    tempo: CHEST,
    ...tempoTimeline(CHEST),
    props: [
      ...crossLeft.props,
      ...crossRight.props,
      { type: 'dHandle', id: 'handle_l', attach: 'wrist_l', strap: false },
      { type: 'dHandle', id: 'handle_r', attach: 'wrist_r', strap: false },
      cable('cable_l', crossLeft.pulley, { node: 'wrist_l' }),
      cable('cable_r', crossRight.pulley, { node: 'wrist_r' }),
    ],
    camera: { target: [0, 1.25, 0], distance: 4.2, view: 'front' },
    poses: {
      stretched: {
        root: [0, STAND_Y - 0.03, 0],
        torso: 18,
        neck: -6,
        legL: foot(0.14, 0.18),
        legR: mirrorLimb(foot(0.14, -0.2)),
        ...arms({
          ik: {
            arc: { center: [0.19, 1.378, 0.139], radius: 0.45, angle: 88, plane: 'xz', offset: [0, 0.06, 0] },
          },
          pole: [1, -0.2, -0.3],
        }),
      },
      contracted: {
        root: [0, STAND_Y - 0.03, 0],
        torso: 18,
        neck: -6,
        legL: foot(0.14, 0.18),
        legR: mirrorLimb(foot(0.14, -0.2)),
        ...arms({
          ik: {
            arc: {
              center: [0.19, 1.378, 0.139],
              radius: 0.45,
              angle: -22,
              plane: 'xz',
              offset: [0, -0.26, 0],
            },
          },
          pole: [1, -0.2, -0.3],
        }),
      },
    },
  },
  {
    name: 'Incline Bench Press',
    slug: 'incline-bench-press',
    muscles: [['chest'], ['shoulders', 'triceps']],
    tempo: CHEST,
    ...tempoTimeline(CHEST),
    props: [
      ...inclineBench(),
      ...[1, -1].flatMap((sx) => [
        { type: 'box', id: `upright${sx}`, size: [0.05, 1.42, 0.05], position: [sx * 0.55, 0.71, -0.72] },
        { type: 'box', id: `hook${sx}`, size: [0.05, 0.05, 0.12], position: [sx * 0.55, 1.36, -0.66] },
      ]),
      { type: 'barbell', id: 'bar', between: ['wrist_l', 'wrist_r'], offset: [0, 0.015, 0] },
    ],
    camera: { target: [0, 0.9, -0.2], distance: 3.6, view: 'side' },
    poses: {
      stretched: { ...INCLINE_BODY, ...arms({ ik: [0.28, 0.93, -0.24], pole: [1, -0.5, -0.6] }) },
      contracted: { ...INCLINE_BODY, ...arms({ ik: [0.28, 1.32, -0.34], pole: [1, -0.5, -0.6] }) },
    },
  },
  {
    name: 'Smith Machine Incline Bench',
    slug: 'smith-machine-incline-bench',
    muscles: [['chest'], ['shoulders', 'triceps']],
    tempo: CHEST,
    ...tempoTimeline(CHEST),
    props: [
      ...inclineBench(),
      ...[1, -1].flatMap((sx) => [
        { type: 'box', id: `rail${sx}`, size: [0.05, 2.1, 0.05], position: [sx * 0.58, 1.05, -0.25] },
        { type: 'box', id: `rail_base${sx}`, size: [0.07, 0.03, 0.7], position: [sx * 0.58, 0.015, -0.25] },
      ]),
      { type: 'box', id: 'rail_top', size: [1.24, 0.06, 0.06], position: [0, 2.1, -0.25] },
      { type: 'barbell', id: 'bar', smith: 0.58, between: ['wrist_l', 'wrist_r'], offset: [0, 0.015, 0] },
    ],
    camera: { target: [0, 1.0, -0.2], distance: 3.8, view: 'side' },
    poses: {
      stretched: { ...INCLINE_BODY, ...arms({ ik: [0.28, 0.93, -0.25], pole: [1, -0.5, -0.6] }) },
      contracted: { ...INCLINE_BODY, ...arms({ ik: [0.28, 1.3, -0.25], pole: [1, -0.5, -0.6] }) },
    },
  },

  // --------------------------------------------------------------- Wednesday
  {
    name: 'Machine Seated Pullover',
    slug: 'machine-seated-pullover',
    muscles: [
      ['back', 'lats'],
      ['chest', 'triceps'],
    ],
    tempo: BACK,
    ...tempoTimeline(BACK),
    props: [
      ...seat('seat'),
      {
        type: 'box',
        id: 'back',
        attach: 'spine',
        size: [0.34, 0.7, 0.06],
        material: 'pad',
        position: [0, 0.32, -0.15],
      },
      lever('back_strut', { prop: 'back', local: [0, -0.25, -0.03] }, [0, 0.02, -0.32], 0.04),
      ...[1, -1].flatMap((sx) => {
        const side = sx > 0 ? 'l' : 'r';
        const pivot = [sx * pulloverPivot[0], pulloverPivot[1], pulloverPivot[2]];
        return [
          lever(`post_${side}`, [pivot[0], 0, -0.12], [pivot[0], pivot[1], -0.12], 0.05),
          { type: 'box', id: `hub_${side}`, size: [0.06, 0.1, 0.16], position: [pivot[0], pivot[1], -0.06] },
          lever(`lever_${side}`, pivot, { node: `elbow_${side}`, offset: [sx * 0.12, 0, 0] }, 0.035),
          {
            type: 'box',
            id: `elbow_pad_${side}`,
            attach: `shoulder_${side}`,
            size: [0.09, 0.12, 0.05],
            material: 'pad',
            position: [0, -0.25, -0.07],
          },
        ];
      }),
      { type: 'cableBar', id: 'bar', length: 0.62, between: ['wrist_l', 'wrist_r'] },
    ],
    camera: { target: [0, 1.0, -0.1], distance: 3.6, view: 'side' },
    poses: {
      stretched: {
        root: [0, SEAT_Y, 0],
        torso: 0,
        neck: 0,
        ...seatedLegs(0.17),
        ...arms({ flex: 160, abd: 12, elbow: 95, world: true }),
      },
      contracted: {
        root: [0, SEAT_Y, 0],
        torso: 0,
        neck: 0,
        ...seatedLegs(0.17),
        ...arms({ flex: 18, abd: 12, elbow: 95, world: true }),
      },
    },
  },
  {
    name: 'Incline Bench Chest Supported Cable Rows',
    slug: 'chest-supported-cable-row',
    muscles: [
      ['back', 'lats'],
      ['biceps', 'rear delts'],
    ],
    tempo: BACK,
    ...tempoTimeline(BACK),
    props: [
      ...chestPad(),
      ...lowStation.props,
      { type: 'cableBar', id: 'bar', length: 0.7, between: ['wrist_l', 'wrist_r'] },
      cable('cable', lowStation.pulley, { prop: 'bar' }),
    ],
    camera: { target: [0, 0.8, 0.35], distance: 3.6, view: 'side' },
    poses: {
      stretched: {
        ...CHEST_SUPPORTED_BODY,
        ...arms({ ik: [0.2, 0.15, 0.53], frame: 'chest', pole: [0.3, -0.2, -1] }),
      },
      contracted: {
        ...CHEST_SUPPORTED_BODY,
        ...arms({ ik: [0.22, -0.06, 0.3], frame: 'chest', pole: [0.3, -0.2, -1] }),
      },
    },
  },
  {
    name: 'Cable Seated High Row',
    slug: 'cable-seated-high-row',
    muscles: [['back', 'rear delts'], ['biceps']],
    tempo: BACK,
    ...tempoTimeline(BACK),
    props: [
      ...seat('seat'),
      ...highStation.props,
      { type: 'cableBar', id: 'bar', between: ['wrist_l', 'wrist_r'] },
      cable('cable', highStation.pulley, { prop: 'bar' }),
    ],
    camera: { target: [0, 1.1, 0.3], distance: 3.8, view: 'side' },
    poses: {
      stretched: {
        root: [0, SEAT_Y, 0],
        torso: 6,
        neck: -4,
        ...seatedLegs(0.17),
        ...arms({ ik: [0.24, 1.3, 0.42], pole: [1, -0.5, -0.2] }),
      },
      contracted: {
        root: [0, SEAT_Y, 0],
        torso: -6,
        neck: 0,
        ...seatedLegs(0.17),
        ...arms({ ik: [0.27, 0.97, 0.17], pole: [1, -0.3, -0.7] }),
      },
    },
  },
  {
    name: 'Single Arm Alternating Dumbbell Row (Bench Supported)',
    slug: 'bench-supported-alternating-dumbbell-row',
    muscles: [
      ['back', 'lats'],
      ['biceps', 'rear delts'],
    ],
    tempo: BACK,
    ...alternatingTimeline(BACK, 'rest', 'left', 'right'),
    props: [
      ...chestPad(),
      { type: 'dumbbell', attach: 'wrist_l', position: [0, -0.02, 0], rotation: [0, 90, 0] },
      { type: 'dumbbell', attach: 'wrist_r', position: [0, -0.02, 0], rotation: [0, 90, 0] },
    ],
    camera: { target: [0, 0.75, 0.25], distance: 3.6, view: 'side' },
    poses: {
      rest: {
        ...CHEST_SUPPORTED_BODY,
        ...arms({ ik: [0.24, -0.215, 0.375], frame: 'chest', pole: [0.3, 0, -1] }),
      },
      left: {
        ...CHEST_SUPPORTED_BODY,
        armL: { ik: [0.24, -0.1, 0.06], frame: 'chest', pole: [0.2, 0.2, -1] },
        armR: mirrorLimb({ ik: [0.24, -0.215, 0.375], frame: 'chest', pole: [0.3, 0, -1] }),
      },
      right: {
        ...CHEST_SUPPORTED_BODY,
        armL: { ik: [0.24, -0.215, 0.375], frame: 'chest', pole: [0.3, 0, -1] },
        armR: mirrorLimb({ ik: [0.24, -0.1, 0.06], frame: 'chest', pole: [0.2, 0.2, -1] }),
      },
    },
  },
  {
    name: 'Dead Weight Hangs',
    slug: 'dead-weight-hang',
    muscles: [['forearms', 'back'], ['shoulders']],
    // A static hold: the clip just breathes; the coach's tempo does not apply.
    duration: 4,
    keys: [
      [0, 'exhale'],
      [0.45, 'inhale'],
      [0.55, 'inhale'],
      [1, 'exhale'],
    ],
    props: [{ type: 'pullUpBar', position: [0, 0, 0] }],
    camera: { target: [0, 1.5, 0], distance: 4.4, view: 'front' },
    poses: {
      exhale: {
        root: [0, 1.255, -0.02],
        torso: -4,
        neck: 0,
        ...legs({ flex: 8, abd: 0, knee: 12 }),
        ...arms({ ik: [0.32, 2.25, 0], pole: [1, 0, 0.3] }),
      },
      inhale: {
        root: [0, 1.263, -0.02],
        torso: -6,
        neck: -3,
        ...legs({ flex: 8, abd: 0, knee: 12 }),
        ...arms({ ik: [0.32, 2.25, 0], pole: [1, 0, 0.3] }),
      },
    },
  },
];
