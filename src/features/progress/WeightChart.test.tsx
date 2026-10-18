import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '@/test/render';
import { WeightChart } from './WeightChart';

describe('WeightChart', () => {
  it('shows an empty state when the range has no weigh-ins', () => {
    renderWithProviders(<WeightChart trend={[]} today="2026-10-18" days={30} units="imperial" goalKg={80} />);
    expect(screen.getByText('No weigh-ins in this range yet.')).toBeInTheDocument();
  });

  it('labels both series and the goal', () => {
    renderWithProviders(
      <WeightChart
        trend={[
          { date: '2026-10-10', weightKg: 90, avg7d: 90, entries7d: 1 },
          { date: '2026-10-17', weightKg: 89, avg7d: 89, entries7d: 1 },
        ]}
        today="2026-10-18"
        days={30}
        units="metric"
        goalKg={80}
      />,
    );
    expect(screen.getByText('Daily weigh-in')).toBeInTheDocument();
    expect(screen.getByText('7-day average')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /latest 7-day average 89 kg/ })).toBeInTheDocument();
  });
});
