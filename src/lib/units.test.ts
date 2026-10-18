import { describe, expect, it } from 'vitest';
import {
  formatHeight,
  formatWeight,
  lengthFromDisplay,
  volumeFromDisplay,
  volumeToDisplay,
  weightFromDisplay,
  weightToDisplay,
} from './units';

describe('units', () => {
  it('stores weights canonically in kg and round-trips imperial entries', () => {
    const kg = weightFromDisplay(185, 'imperial');
    expect(kg).toBeCloseTo(83.915, 3);
    expect(weightToDisplay(kg, 'imperial')).toBe(185);
    expect(weightFromDisplay(84.2, 'metric')).toBe(84.2);
  });

  it('formats weight in the preferred unit', () => {
    expect(formatWeight(100, 'metric')).toBe('100 kg');
    expect(formatWeight(100, 'imperial')).toBe('220.5 lb');
  });

  it('converts water volumes using US fluid ounces', () => {
    expect(volumeFromDisplay(8, 'imperial')).toBe(237);
    expect(volumeToDisplay(2000, 'imperial')).toBe(68);
    expect(volumeToDisplay(500, 'metric')).toBe(500);
  });

  it('shows height as feet and inches in imperial', () => {
    expect(formatHeight(180, 'imperial')).toBe('5′ 11″');
    expect(formatHeight(180, 'metric')).toBe('180 cm');
    expect(lengthFromDisplay(32, 'imperial')).toBe(81.3);
  });
});
