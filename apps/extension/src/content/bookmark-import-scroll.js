// One animation for the entire import, independent of scan/save latency. The
// caller snapshots newly mounted previews before each move and applies bounded
// backpressure through canAdvance. Pausing never accumulates catch-up movement.
export function startImportScroll({ canAdvance, onError, view = window, doc = document }) {
  let frame, previousTime, lastJump = -Infinity, stopped = false;
  const stop = () => { stopped = true; view.cancelAnimationFrame(frame); };
  function tick(time) {
    if (stopped) return;
    const elapsed = previousTime === undefined ? 0 : Math.max(0, time - previousTime);
    previousTime = time;
    try {
      const reduced = view.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      if ((!reduced || time - lastJump >= 600) && canAdvance()) {
        const from = view.scrollY;
        const bottom = Math.max(0, doc.documentElement.scrollHeight - view.innerHeight);
        const step = reduced ? Math.round(view.innerHeight * 0.8) : Math.min(elapsed * 1.2, 32);
        if (step > 0 && from < bottom) {
          view.scrollTo({ top: Math.min(bottom, from + step), behavior: 'instant' });
          lastJump = time;
        }
      }
    } catch (error) {
      stop();
      onError(error);
      return;
    }
    frame = view.requestAnimationFrame(tick);
  }
  frame = view.requestAnimationFrame(tick);
  return stop;
}
