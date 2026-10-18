import { SegmentedControl, Stack } from '@mantine/core';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { PageHeader } from '@/components/PageHeader';
import { resolveSection, type MealSection } from './logic';
import { MealDayView } from './MealDayView';
import { WaterView } from './WaterView';
import { WeeklyPlan } from './WeeklyPlan';

const SUBTITLES: Record<MealSection, string> = {
  today: 'Your meal reminders for the day',
  plan: 'Meals that repeat each week',
  water: 'Daily water',
};

export function MealsPage() {
  const { section: param } = useParams();
  const [search] = useSearchParams();
  const navigate = useNavigate();
  const section = resolveSection(param, search.get('tab'));

  return (
    <Stack>
      <PageHeader title={section === 'water' ? 'Water' : 'Meals'} subtitle={SUBTITLES[section]} />
      <SegmentedControl
        fullWidth
        size="md"
        value={section}
        onChange={(v) => navigate(v === 'today' ? '/meals' : `/meals/${v}`)}
        data={[
          { value: 'today', label: 'Day' },
          { value: 'plan', label: 'Weekly plan' },
          { value: 'water', label: 'Water' },
        ]}
        aria-label="Meals section"
      />
      {section === 'today' && <MealDayView />}
      {section === 'plan' && <WeeklyPlan />}
      {section === 'water' && <WaterView />}
    </Stack>
  );
}
