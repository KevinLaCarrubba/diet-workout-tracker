import { SegmentedControl, Stack } from '@mantine/core';
import { Navigate, useNavigate, useParams } from 'react-router';
import { PageHeader } from '@/components/PageHeader';
import { ActivitySection } from './ActivitySection';
import { BodySection } from './BodySection';
import { OverviewSection } from './OverviewSection';
import { PhotosSection } from './PhotosSection';
import { WeightSection } from './WeightSection';

const SECTIONS = [
  { value: 'overview', label: 'Overview' },
  { value: 'weight', label: 'Weight' },
  { value: 'body', label: 'Body' },
  { value: 'photos', label: 'Photos' },
  { value: 'activity', label: 'Activity' },
] as const;
type Section = (typeof SECTIONS)[number]['value'];

const isSection = (s: string): s is Section => SECTIONS.some((x) => x.value === s);

export function ProgressPage() {
  const { section = 'overview' } = useParams();
  const navigate = useNavigate();
  if (!isSection(section)) return <Navigate to="/progress" replace />;

  return (
    <Stack maw={720}>
      <PageHeader title="Progress" />
      <SegmentedControl
        fullWidth
        value={section}
        onChange={(v) => navigate(v === 'overview' ? '/progress' : `/progress/${v}`, { replace: true })}
        data={[...SECTIONS]}
        aria-label="Progress section"
        styles={{
          label: {
            paddingInline: 2,
            minHeight: 40,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          },
        }}
      />
      {section === 'overview' && <OverviewSection />}
      {section === 'weight' && <WeightSection />}
      {section === 'body' && <BodySection />}
      {section === 'photos' && <PhotosSection />}
      {section === 'activity' && <ActivitySection />}
    </Stack>
  );
}
