import { useQuery } from '@tanstack/react-query';
import { loadExerciseManifest, resolveExerciseAsset } from './manifest';

/** Whether a 3D demo exists for this exercise name (reads only the small manifest). */
export function useHasDemo(exerciseName: string | null | undefined): boolean {
  const { data } = useQuery({
    queryKey: ['exercise-demo-manifest'],
    queryFn: () => loadExerciseManifest(),
    staleTime: Infinity,
    retry: false,
  });
  return !!exerciseName && !!resolveExerciseAsset(data, exerciseName);
}
