/**
 * Cal.com embed, loaded lazily.
 *
 * The booking buttons are ordinary links to cal.com, so they work with this
 * script blocked, failed, or not yet loaded. On first pointer or keyboard
 * interaction with a booking CTA we fetch Cal's embed script and, once it is
 * ready, upgrade subsequent clicks to the inline modal.
 *
 * Nothing is requested at page load. The embed never touches the critical path.
 */

type CalFn = ((...args: unknown[]) => void) & { ns?: Record<string, unknown>; q?: unknown[] };
declare global {
  interface Window {
    Cal?: CalFn;
  }
}

const EMBED_SRC = "https://app.cal.com/embed/embed.js";

let loading: Promise<void> | null = null;

function loadEmbed(): Promise<void> {
  if (loading) return loading;
  loading = new Promise<void>((resolve, reject) => {
    // Cal's documented bootstrap stub: queues calls made before the script lands.
    const w = window as Window & { Cal?: CalFn };
    if (!w.Cal) {
      const stub = function (...args: unknown[]) {
        (stub.q ??= []).push(args);
      } as CalFn;
      stub.q = [];
      w.Cal = stub;
    }
    const s = document.createElement("script");
    s.src = EMBED_SRC;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("cal embed failed"));
    document.head.appendChild(s);
  });
  return loading;
}

/** Marks the booking links so the loader can find them in one pass. */
export function tagCalLinks(slug: string): void {
  if (!slug) return;
  for (const a of document.querySelectorAll<HTMLAnchorElement>('a[href^="https://cal.com/"]')) {
    a.dataset.calLink = slug;
  }
}

export function initCal(slug: string): void {
  if (!slug) return;
  const triggers = document.querySelectorAll<HTMLAnchorElement>("a[data-cal-link]");
  if (triggers.length === 0) return;

  let ready = false;

  const warm = () => {
    loadEmbed()
      .then(() => {
        window.Cal?.("init", { origin: "https://app.cal.com" });
        window.Cal?.("ui", { hideEventTypeDetails: false, layout: "month_view" });
        ready = true;
      })
      .catch(() => {
        // Leave the plain links alone. They still open cal.com.
        ready = false;
      });
  };

  for (const el of triggers) {
    el.addEventListener("pointerenter", warm, { once: true, passive: true });
    el.addEventListener("focus", warm, { once: true });
    el.addEventListener("click", (e) => {
      if (!ready || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
      e.preventDefault();
      window.Cal?.("modal", { calLink: slug });
    });
  }
}
