/**
 * ============================================================================
 * Cal.com embed, loaded lazily.
 *
 * The booking buttons are ordinary links to cal.com, so they work with this
 * script blocked, failed, or not yet loaded. On first hover or focus of a
 * booking CTA the embed script is fetched, and once it is ready subsequent
 * clicks open the inline modal instead of navigating.
 *
 * Nothing is requested at page load. The embed never touches the critical path.
 *
 * THE BOOTSTRAP STUB IS CAL'S, NOT OURS. Their embed script reads `Cal.ns`,
 * `Cal.loaded` and a per-namespace queue off the global it finds, and throws
 * "Cannot convert undefined or null to object" partway through init if any of
 * them is missing. A simpler stub looks like it works, because the plain href
 * still navigates, while the modal silently never opens. Keep the shape.
 * ========================================================================= */

const EMBED_SRC = "https://app.cal.com/embed/embed.js";

type CalApi = ((...args: unknown[]) => void) & {
  ns?: Record<string, unknown>;
  q?: unknown[];
  loaded?: boolean;
};

declare global {
  interface Window {
    Cal?: CalApi;
  }
}

let loading: Promise<void> | null = null;

/** Cal's documented loader, transcribed. */
function installStub(): void {
  const C = window as Window & { Cal?: CalApi };
  if (C.Cal) return;

  const d = document;
  const push = (api: CalApi, args: IArguments | unknown[]) => {
    (api.q ??= []).push(args);
  };

  const cal = function (this: unknown, ...args: unknown[]) {
    const self = C.Cal as CalApi;
    if (!self.loaded) {
      self.ns = {};
      self.q = self.q ?? [];
      const s = d.createElement("script");
      s.src = EMBED_SRC;
      s.async = true;
      d.head.appendChild(s);
      self.loaded = true;
    }
    // Cal("init", "<namespace>") creates a namespaced api with its own queue.
    if (args[0] === "init") {
      const namespace = typeof args[1] === "string" ? args[1] : "";
      const api = function (...inner: unknown[]) {
        push(api as CalApi, inner);
      } as CalApi;
      api.q = api.q ?? [];
      if (namespace) {
        (self.ns as Record<string, CalApi>)[namespace] = api;
        push(api, args);
      } else {
        push(self, args);
      }
      return;
    }
    push(self, args);
  } as CalApi;

  cal.ns = {};
  cal.q = [];
  cal.loaded = false;
  C.Cal = cal;
}

function loadEmbed(): Promise<void> {
  if (loading) return loading;
  loading = new Promise<void>((resolve, reject) => {
    installStub();
    // The stub appends the script itself on first call, so calling init both
    // triggers the fetch and queues the configuration.
    window.Cal?.("init", { origin: "https://cal.com" });

    const existing = document.querySelector<HTMLScriptElement>(`script[src="${EMBED_SRC}"]`);
    if (!existing) {
      reject(new Error("cal embed script was never appended"));
      return;
    }
    if (window.Cal?.loaded && !("q" in window.Cal)) {
      resolve();
      return;
    }
    existing.addEventListener("load", () => resolve(), { once: true });
    existing.addEventListener("error", () => reject(new Error("cal embed failed")), { once: true });
    // the script may already be cached and done
    window.setTimeout(() => resolve(), 4000);
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
