import { createBrowserRouter } from 'react-router';
import { AppLayout } from '@/components/AppLayout';
import { NotFoundPage } from '@/components/NotFoundPage';
import { RouteError } from '@/components/RouteError';
import { ConfirmPage } from '@/features/auth/ConfirmPage';
import { ForgotPasswordPage } from '@/features/auth/ForgotPasswordPage';
import { RedirectIfSignedIn, RequireAuth, RequireOnboarded } from '@/features/auth/guards';
import { SetPasswordPage } from '@/features/auth/SetPasswordPage';
import { SignInPage } from '@/features/auth/SignInPage';
import { HomePage } from '@/features/home/HomePage';
import { OnboardingPage } from '@/features/profile/OnboardingPage';
import { SettingsPage } from '@/features/settings/SettingsPage';

const lazyPage = <K extends string>(load: () => Promise<Record<K, React.ComponentType>>, name: K) => ({
  lazy: async () => ({ Component: (await load())[name] }),
});

export const router = createBrowserRouter([
  {
    errorElement: <RouteError />,
    children: [
      {
        element: <RedirectIfSignedIn />,
        children: [
          { path: '/sign-in', element: <SignInPage /> },
          { path: '/forgot-password', element: <ForgotPasswordPage /> },
        ],
      },
      { path: '/auth/confirm', element: <ConfirmPage /> },
      {
        element: <RequireAuth />,
        children: [
          { path: '/set-password', element: <SetPasswordPage /> },
          { path: '/onboarding', element: <OnboardingPage /> },
          {
            element: <RequireOnboarded />,
            children: [
              // Active workout: full-screen, no bottom navigation.
              {
                path: '/workouts/session/:sessionId',
                ...lazyPage(
                  () => import('@/features/workouts/session/ActiveWorkoutPage'),
                  'ActiveWorkoutPage',
                ),
              },
              {
                path: '/workouts/session/:sessionId/summary',
                ...lazyPage(
                  () => import('@/features/workouts/session/WorkoutSummaryPage'),
                  'WorkoutSummaryPage',
                ),
              },
              {
                element: <AppLayout />,
                children: [
                  { index: true, element: <HomePage /> },
                  { path: 'settings', element: <SettingsPage /> },
                  {
                    path: 'settings/members',
                    ...lazyPage(() => import('@/features/admin/MembersPage'), 'MembersPage'),
                  },
                  {
                    path: 'workouts',
                    ...lazyPage(() => import('@/features/workouts/WorkoutsPage'), 'WorkoutsPage'),
                  },
                  {
                    path: 'workouts/exercises',
                    ...lazyPage(() => import('@/features/workouts/exercises/ExercisesPage'), 'ExercisesPage'),
                  },
                  {
                    path: 'workouts/exercises/:exerciseId',
                    ...lazyPage(
                      () => import('@/features/workouts/exercises/ExerciseDetailPage'),
                      'ExerciseDetailPage',
                    ),
                  },
                  {
                    path: 'workouts/templates',
                    ...lazyPage(() => import('@/features/workouts/templates/TemplatesPage'), 'TemplatesPage'),
                  },
                  {
                    path: 'workouts/templates/:templateId',
                    ...lazyPage(
                      () => import('@/features/workouts/templates/TemplateEditorPage'),
                      'TemplateEditorPage',
                    ),
                  },
                  {
                    path: 'workouts/schedule',
                    ...lazyPage(() => import('@/features/workouts/schedule/SchedulePage'), 'SchedulePage'),
                  },
                  {
                    path: 'workouts/history',
                    ...lazyPage(() => import('@/features/workouts/history/HistoryPage'), 'HistoryPage'),
                  },
                  {
                    path: 'workouts/history/:sessionId',
                    ...lazyPage(
                      () => import('@/features/workouts/history/SessionDetailPage'),
                      'SessionDetailPage',
                    ),
                  },
                  {
                    path: 'workouts/records',
                    ...lazyPage(() => import('@/features/workouts/records/RecordsPage'), 'RecordsPage'),
                  },
                  {
                    path: 'workouts/cardio',
                    ...lazyPage(() => import('@/features/workouts/cardio/CardioPage'), 'CardioPage'),
                  },
                  { path: 'meals', ...lazyPage(() => import('@/features/meals/MealsPage'), 'MealsPage') },
                  {
                    path: 'meals/:section',
                    ...lazyPage(() => import('@/features/meals/MealsPage'), 'MealsPage'),
                  },
                  {
                    path: 'progress',
                    ...lazyPage(() => import('@/features/progress/ProgressPage'), 'ProgressPage'),
                  },
                  {
                    path: 'progress/:section',
                    ...lazyPage(() => import('@/features/progress/ProgressPage'), 'ProgressPage'),
                  },
                  { path: '*', element: <NotFoundPage /> },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
]);
