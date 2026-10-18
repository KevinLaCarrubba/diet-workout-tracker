import { describe, expect, it } from 'vitest';
import { fitWithin } from './image';

describe('fitWithin', () => {
  it('caps the long edge at 1600px and keeps the aspect ratio', () => {
    expect(fitWithin(4032, 3024)).toEqual({ width: 1600, height: 1200 });
    expect(fitWithin(3024, 4032)).toEqual({ width: 1200, height: 1600 });
    expect(fitWithin(5000, 5000)).toEqual({ width: 1600, height: 1600 });
  });

  it('never upscales', () => {
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 });
    expect(fitWithin(1600, 900)).toEqual({ width: 1600, height: 900 });
  });

  it('rounds and keeps at least 1px', () => {
    expect(fitWithin(10000, 3, 1600)).toEqual({ width: 1600, height: 1 });
    expect(fitWithin(1601, 1001)).toEqual({ width: 1600, height: 1000 });
  });

  it('rejects empty images', () => {
    expect(() => fitWithin(0, 100)).toThrow();
  });
});
