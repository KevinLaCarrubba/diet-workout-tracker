import { create } from 'zustand';

/** Whether a workout is in progress; used to hold back service-worker reloads. */
export const useWorkoutActivity = create<{ active: boolean; setActive: (active: boolean) => void }>(
  (set) => ({
    active: false,
    setActive: (active) => set({ active }),
  }),
);
