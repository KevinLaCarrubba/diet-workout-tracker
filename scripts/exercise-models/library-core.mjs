// The original library: common catalog exercises (Phase 6, batch 0).
// Aliases map the coach plan's exact names onto these demos.

import { DEG, DIM, STAND_Y, arms, foot, legs, mirrorLimb } from './kit.mjs';

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

export const CORE_EXERCISES = [
  {
    name: 'Back Squat',
    slug: 'back-squat',
    muscles: [
      ['quads', 'glutes'],
      ['hamstrings', 'core'],
    ],
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
    muscles: [['quads', 'glutes'], ['core']],
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
    muscles: [['chest'], ['triceps', 'shoulders']],
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
    muscles: [['chest'], ['triceps', 'shoulders', 'core']],
    aliases: ['Push-ups'],
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
    muscles: [
      ['back', 'hamstrings', 'glutes'],
      ['forearms', 'core'],
    ],
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
    muscles: [['hamstrings', 'glutes'], ['back']],
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
    muscles: [['shoulders'], ['triceps', 'core']],
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
    muscles: [['back'], ['biceps', 'rear delts']],
    aliases: ['Bent Over Barbell Row'],
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
    muscles: [['back'], ['biceps']],
    aliases: ['Pull-ups'],
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
    muscles: [['quads', 'glutes'], ['hamstrings']],
    aliases: ['Heavy Lunges', 'Bodyweight Lunges'],
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
    muscles: [['shoulders'], []],
    aliases: ['Seated Dumbbell Lateral Raise'],
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
    muscles: [['biceps'], ['forearms']],
    aliases: ['Standing Alternating Dumbbell Curl'],
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
export function lungePose({ root, front, back, backPitch = 0 }, mirrored = false) {
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
