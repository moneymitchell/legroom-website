/**
 * dataLayer pushes.
 *
 * The site owns the events; Google Tag Manager owns what happens to them. There
 * is no GTM container in the page by default, so with nothing installed these
 * pushes land in an array nobody reads, cost nothing, and send no requests.
 *
 * Every event here is listed in LAUNCH.md section 8f with its payload, so the
 * triggers can be built without reading this file.
 *
 *   book_call_click        any "Book" CTA          { location }
 *   form_submit            the contact form        { source }
 *   email_capture          the inline capture      { source }
 *   scroll_depth           25/50/75/100, once each { percent }
 *   cal_booking_complete   Cal.com booking done    {}
 */

type Payload = Record<string, string | number>;

declare global {
  interface Window {
    dataLayer?: Payload[];
  }
}

export function push(event: string, params: Payload = {}): void {
  (window.dataLayer ??= []).push({ event, ...params });
}

/** CTA clicks. Reads the location off the data-cta attribute already in the markup. */
function trackCtas(): void {
  document.addEventListener(
    "click",
    (e) => {
      const el = (e.target as HTMLElement | null)?.closest<HTMLElement>("[data-cta]");
      if (!el) return;
      const location = el.dataset.cta ?? "unknown";
      // the secondary CTAs point at /contact, which is a page view, not a booking
      if (location.endsWith("secondary")) return;
      push("book_call_click", { location });
    },
    { passive: true, capture: true },
  );
}

/**
 * Form submissions. Fired on `submit`, which covers both paths: the enhanced
 * handler calls preventDefault but the event has already been seen here, and a
 * no-JavaScript page never runs this at all (nothing is lost, because there is
 * no dataLayer in that case either).
 */
function trackForms(): void {
  document.addEventListener(
    "submit",
    (e) => {
      const form = e.target as HTMLFormElement | null;
      if (!form?.matches("form[data-lead-form]")) return;
      const source = form.dataset.source ?? "unknown";
      push(source === "contact" ? "form_submit" : "email_capture", { source });
    },
    { capture: true },
  );
}

/** Scroll depth at four thresholds, once each. Passive, and rAF-throttled. */
function trackScrollDepth(): void {
  const marks = [25, 50, 75, 100];
  const fired = new Set<number>();
  let ticking = false;

  const check = () => {
    ticking = false;
    const doc = document.documentElement;
    const max = doc.scrollHeight - window.innerHeight;
    if (max <= 0) return;
    const pct = ((window.scrollY + 1) / max) * 100;
    for (const mark of marks) {
      if (pct >= mark && !fired.has(mark)) {
        fired.add(mark);
        push("scroll_depth", { percent: mark });
      }
    }
    if (fired.size === marks.length) window.removeEventListener("scroll", onScroll);
  };

  const onScroll = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(check);
  };

  window.addEventListener("scroll", onScroll, { passive: true });
  check();
}

/**
 * Cal.com reports a completed booking through its embed messaging. This only
 * fires when the modal was used; a booking made directly on cal.com is counted
 * by Cal's own analytics, not here.
 */
function trackCalBooking(): void {
  window.addEventListener("message", (e) => {
    if (typeof e.origin !== "string" || !/(^https:\/\/(app\.)?cal\.com)$/.test(e.origin)) return;
    const data = e.data as { type?: string; action?: string } | null;
    const kind = data?.type ?? data?.action;
    if (kind === "bookingSuccessful" || kind === "bookingSuccessfulV2") {
      push("cal_booking_complete");
    }
  });
}

export function initAnalytics(): void {
  trackCtas();
  trackForms();
  trackScrollDepth();
  trackCalBooking();
}
