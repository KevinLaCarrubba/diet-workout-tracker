import { screen } from '@testing-library/react';
import { Route, Routes } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/render';
import { ProgressPage } from './ProgressPage';

vi.mock('./OverviewSection', () => ({ OverviewSection: () => <p>overview section</p> }));
vi.mock('./WeightSection', () => ({ WeightSection: () => <p>weight section</p> }));
vi.mock('./BodySection', () => ({ BodySection: () => <p>body section</p> }));
vi.mock('./PhotosSection', () => ({ PhotosSection: () => <p>photos section</p> }));
vi.mock('./ActivitySection', () => ({ ActivitySection: () => <p>activity section</p> }));

const renderAt = (route: string) =>
  renderWithProviders(
    <Routes>
      <Route path="/progress" element={<ProgressPage />} />
      <Route path="/progress/:section" element={<ProgressPage />} />
    </Routes>,
    { route },
  );

describe('ProgressPage', () => {
  it('defaults to the overview', () => {
    renderAt('/progress');
    expect(screen.getByText('overview section')).toBeInTheDocument();
  });

  it('opens the section from the URL', () => {
    renderAt('/progress/photos');
    expect(screen.getByText('photos section')).toBeInTheDocument();
  });

  it('redirects unknown sections to the overview', () => {
    renderAt('/progress/nope');
    expect(screen.getByText('overview section')).toBeInTheDocument();
  });
});
