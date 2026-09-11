/**
 * Form handling: progressive enhancement only.
 *
 * Every form on the site is a real <form method="POST" action="/api/lead"> that
 * works with this file deleted. All this does is intercept the submit, post the
 * same fields as JSON, and write the result into the inline status line instead
 * of navigating. If anything here throws, the form still submits normally.
 *
 * Turnstile: the widget script is loaded only when a form is first touched, so
 * it costs nothing on page load. If it has not produced a token by submit time
 * we send the request without one and let the Worker decide (see worker/index.ts
 * for how a token-less submission is treated).
 */

type LeadResponse = { ok: boolean; error?: string };

const TURNSTILE_SRC =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

declare global {
  interface Window {
    turnstile?: {
      render: (el: Element, opts: Record<string, unknown>) => string;
      getResponse: (id?: string) => string | undefined;
      reset: (id?: string) => void;
    };
  }
}

let turnstileLoading: Promise<void> | null = null;

function loadTurnstile(): Promise<void> {
  if (turnstileLoading) return turnstileLoading;
  turnstileLoading = new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = TURNSTILE_SRC;
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("turnstile failed"));
    document.head.appendChild(s);
  });
  return turnstileLoading;
}

export function initForms(siteKey: string): void {
  const forms = document.querySelectorAll<HTMLFormElement>("form[data-lead-form]");
  if (forms.length === 0) return;

  for (const form of forms) {
    const status = form.parentElement?.querySelector<HTMLElement>("[data-lead-status]") ?? null;
    const button = form.querySelector<HTMLButtonElement>("button[type=submit]");
    const holder = form.querySelector<HTMLElement>("[data-turnstile]");
    const strings = readStrings(form);
    let widgetId: string | undefined;
    // Bots fill instantly. A human takes seconds. The Worker sees this value.
    const mountedAt = Date.now();

    const warm = () => {
      if (!siteKey || !holder || widgetId !== undefined) return;
      loadTurnstile()
        .then(() => {
          widgetId = window.turnstile?.render(holder, {
            sitekey: siteKey,
            size: "flexible",
            appearance: "interaction-only",
          });
        })
        .catch(() => {
          /* no token; the Worker applies its no-token controls instead */
        });
    };
    form.addEventListener("focusin", warm, { once: true });
    form.addEventListener("pointerdown", warm, { once: true });

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      if (button?.getAttribute("aria-disabled") === "true") return;

      const data = new FormData(form);
      const email = String(data.get("email") ?? "").trim();

      if (!isEmailish(email)) {
        setStatus(status, strings.errorEmail, "error");
        form.querySelector<HTMLInputElement>("input[type=email]")?.focus();
        return;
      }

      const payload: Record<string, string> = {
        email,
        source: String(data.get("source") ?? "unknown"),
        company: String(data.get("company") ?? ""),
        elapsed: String(Date.now() - mountedAt),
      };
      for (const key of ["name", "message"] as const) {
        const v = data.get(key);
        if (typeof v === "string" && v.trim()) payload[key] = v.trim();
      }
      const token = window.turnstile?.getResponse(widgetId);
      if (token) payload.token = token;

      lock(button, true);
      setStatus(status, strings.sending, "pending");

      void fetch(form.action, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify(payload),
      })
        .then(async (res) => {
          const body = (await res.json().catch(() => ({}))) as LeadResponse;
          if (res.ok && body.ok) {
            setStatus(status, strings.success, "ok");
            form.reset();
            return;
          }
          if (res.status === 429) {
            setStatus(status, strings.errorRate, "error");
          } else if (body.error === "email") {
            setStatus(status, strings.errorEmail, "error");
          } else {
            setStatus(status, strings.errorGeneric, "error");
          }
          if (widgetId !== undefined) window.turnstile?.reset(widgetId);
        })
        .catch(() => {
          setStatus(status, strings.errorGeneric, "error");
        })
        .finally(() => lock(button, false));
    });
  }
}

/* --- helpers -------------------------------------------------------------- */

function readStrings(form: HTMLFormElement) {
  const d = form.dataset;
  return {
    sending: d.msgSending ?? "Sending…",
    success: d.msgSuccess ?? "Got it. Check your inbox.",
    errorGeneric: d.msgError ?? "That didn't send. Try emailing us instead.",
    errorEmail: d.msgErrorEmail ?? "That email address doesn't look right.",
    errorRate: d.msgErrorRate ?? "Too many tries. Give it a minute.",
  };
}

/** Deliberately loose. The server is the authority; this is just early feedback. */
function isEmailish(v: string): boolean {
  return /^[^\s@]+@[^\s@.]+\.[^\s@]{2,}$/.test(v) && v.length <= 254;
}

function setStatus(el: HTMLElement | null, text: string, state: string) {
  if (!el) return;
  el.textContent = text;
  el.dataset.state = state;
}

/** aria-disabled, not disabled: a disabled button drops out of the tab order. */
function lock(button: HTMLButtonElement | null, locked: boolean) {
  if (!button) return;
  button.setAttribute("aria-disabled", String(locked));
}
