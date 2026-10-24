/**
 * Mirrors the visual viewport into CSS variables on <html>. On iOS the
 * on-screen keyboard shrinks the visual viewport but not 100dvh, so
 * full-screen sheets size to --visual-viewport-height to stay above it.
 */
export function trackVisualViewport(win: Window = window): () => void {
  const vv = win.visualViewport;
  if (!vv) return () => {};
  const root = win.document.documentElement.style;
  const update = () => {
    root.setProperty('--visual-viewport-height', `${vv.height}px`);
    root.setProperty('--visual-viewport-top', `${vv.offsetTop}px`);
  };
  update();
  vv.addEventListener('resize', update);
  vv.addEventListener('scroll', update);
  return () => {
    vv.removeEventListener('resize', update);
    vv.removeEventListener('scroll', update);
  };
}
