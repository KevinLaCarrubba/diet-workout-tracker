import { describe, expect, it } from 'vitest';
import { trackVisualViewport } from './visualViewport';

function fakeWindow() {
  const viewport = Object.assign(new EventTarget(), { height: 800, offsetTop: 0 });
  const win = { visualViewport: viewport, document } as unknown as Window;
  return { win, viewport };
}

const cssVar = (name: string) => document.documentElement.style.getPropertyValue(name);

describe('trackVisualViewport', () => {
  it('follows the visible height (keyboard open and closed) until stopped', () => {
    const { win, viewport } = fakeWindow();
    const stop = trackVisualViewport(win);
    expect(cssVar('--visual-viewport-height')).toBe('800px');

    viewport.height = 450;
    viewport.offsetTop = 20;
    viewport.dispatchEvent(new Event('resize'));
    expect(cssVar('--visual-viewport-height')).toBe('450px');
    expect(cssVar('--visual-viewport-top')).toBe('20px');

    stop();
    viewport.height = 800;
    viewport.dispatchEvent(new Event('resize'));
    expect(cssVar('--visual-viewport-height')).toBe('450px');
  });

  it('does nothing without visualViewport support', () => {
    const win = { visualViewport: null, document } as unknown as Window;
    expect(() => trackVisualViewport(win)()).not.toThrow();
  });
});
