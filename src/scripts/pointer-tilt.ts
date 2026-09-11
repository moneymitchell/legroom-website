/**
 * ============================================================================
 * Pointer-tracked side depth on the arcade buttons.
 *
 * Each button tracks the cursor's horizontal position across itself and lerps
 * it at 0.18 per frame into a `--tx` custom property: -1 at the left edge,
 * +1 at the right. The hard shadow's x offset follows, so the block face sits
 * on the side away from the cursor and the button reads as a solid object seen
 * from an angle. The shadow geometry itself is in tokens.css.
 *
 * DO NOT SIMPLIFY THE LERP. Setting --tx straight from the pointer makes the
 * shadow snap, and the easing is the whole effect.
 *
 * Fine pointers only. A touch device has no cursor to track, so the query gates
 * the entire module and nothing runs. --tx defaults to 0 in CSS, so a device
 * that never runs this still gets the straight-on shadow.
 *
 * Ported from handoff/snippets/pointer-tilt.js.
 * ========================================================================= */

const FINE_POINTER = "(hover: hover) and (pointer: fine)";

/** Every control that carries the depth treatment. */
const SELECTOR = ".btn, .navbtn, .cap button, form button[type='submit']";

export function initPointerTilt(): () => void {
  if (!window.matchMedia?.(FINE_POINTER).matches) return () => {};

  const teardowns: Array<() => void> = [];

  for (const el of document.querySelectorAll<HTMLElement>(SELECTOR)) {
    let raf = 0;
    let target = 0;
    let cur = 0;

    const tick = () => {
      cur += (target - cur) * 0.18;
      if (Math.abs(target - cur) > 0.002) {
        el.style.setProperty("--tx", cur.toFixed(3));
        raf = requestAnimationFrame(tick);
      } else {
        // settle exactly on the target so the shadow does not sit a hair off
        cur = target;
        el.style.setProperty("--tx", target.toFixed(3));
        raf = 0;
      }
    };

    const run = () => {
      if (!raf) raf = requestAnimationFrame(tick);
    };

    const onMove = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      if (r.width === 0) return;
      target = Math.max(-1, Math.min(1, ((e.clientX - r.left) / r.width) * 2 - 1));
      run();
    };

    const onLeave = () => {
      target = 0;
      run();
    };

    el.addEventListener("pointermove", onMove, { passive: true });
    el.addEventListener("pointerleave", onLeave, { passive: true });
    // a button can lose the pointer without a leave event when it is pressed
    // and the page scrolls under it
    el.addEventListener("pointercancel", onLeave, { passive: true });

    teardowns.push(() => {
      if (raf) cancelAnimationFrame(raf);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerleave", onLeave);
      el.removeEventListener("pointercancel", onLeave);
      el.style.removeProperty("--tx");
    });
  }

  return () => {
    for (const t of teardowns) t();
  };
}
