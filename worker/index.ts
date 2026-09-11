/**
 * ============================================================================
 * The form handler.
 *
 * One Worker sitting in front of the static assets. Everything that is not
 * POST /api/lead falls straight through to the asset server, so the site is
 * still a static site and a broken integration cannot take the page down.
 *
 * POST /api/lead:
 *   1. rate limit by IP
 *   2. parse JSON or urlencoded (the no-JS form posts urlencoded)
 *   3. reject the honeypot and impossibly fast submissions
 *   4. verify the Turnstile token server-side, failing closed
 *   5. write the lead to D1
 *   6. Resend sends the submitter their booking link, then sends JD the alert
 *   7. reply with JSON, or a 303 to /thanks for the no-JS path
 *
 * The lead is written to D1 BEFORE either email is attempted. A Resend failure
 * is therefore a warning, not a lost lead, and never a 500.
 *
 * Nothing here logs a full submission. Addresses are recorded in D1 because
 * that is the point; they are not written to the log stream.
 * ========================================================================= */

import { mail, type LeadFields } from "../src/content/emails";

export interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  LEAD_RATE: KVNamespace;
  /** Wrangler secret. */
  TURNSTILE_SECRET_KEY?: string;
  /** Wrangler secret. */
  RESEND_API_KEY?: string;
  /** Plain vars, set in wrangler.jsonc. */
  NOTIFY_TO?: string;
  MAIL_FROM?: string;
  CAL_LINK?: string;
  SITE_URL?: string;
}

type LeadInput = {
  email: string;
  name?: string;
  message?: string;
  source?: string;
  company?: string;
  elapsed?: string;
  token?: string;
};

const RATE_LIMIT_WITH_TOKEN = 5; // per window, when Turnstile vouched for them
const RATE_LIMIT_NO_TOKEN = 2; // per window, when it could not
const RATE_WINDOW_SECONDS = 3600;
const MIN_FILL_MS = 1200; // faster than this is not a human typing

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/lead") {
      if (request.method !== "POST") {
        return json({ ok: false, error: "method" }, 405, { allow: "POST" });
      }
      return handleLead(request, env, ctx);
    }

    // everything else is the static site
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;

async function handleLead(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const wantsJson = (request.headers.get("accept") ?? "").includes("application/json");
  const ip = request.headers.get("cf-connecting-ip") ?? "0.0.0.0";

  let input: LeadInput;
  try {
    input = await readInput(request);
  } catch {
    return reply(wantsJson, { ok: false, error: "parse" }, 400, env);
  }

  // 1. honeypot. A real person never sees this field, let alone fills it.
  if (input.company && input.company.trim() !== "") {
    // Answer as though it worked. A bot that knows it failed just tries again.
    return reply(wantsJson, { ok: true }, 200, env);
  }

  // 2. fill time. Only enforced when the client reported one.
  const elapsed = Number(input.elapsed ?? NaN);
  if (Number.isFinite(elapsed) && elapsed < MIN_FILL_MS) {
    return reply(wantsJson, { ok: true }, 200, env);
  }

  // 3. email
  const email = normaliseEmail(input.email ?? "");
  if (!email) {
    return reply(wantsJson, { ok: false, error: "email" }, 400, env);
  }

  // 4. Turnstile. Fail closed: a token that does not verify, or a verify call
  //    that errors, is a rejection. A token-less submission is the no-JS path
  //    and is allowed through on a tighter rate limit plus the checks above.
  const hasToken = typeof input.token === "string" && input.token.length > 0;
  if (hasToken) {
    const ok = await verifyTurnstile(input.token!, ip, env);
    if (!ok) return reply(wantsJson, { ok: false, error: "challenge" }, 403, env);
  }

  // 5. rate limit
  const limit = hasToken ? RATE_LIMIT_WITH_TOKEN : RATE_LIMIT_NO_TOKEN;
  const allowed = await underRateLimit(env, ip, limit);
  if (!allowed) {
    return reply(wantsJson, { ok: false, error: "rate" }, 429, env, {
      "retry-after": String(RATE_WINDOW_SECONDS),
    });
  }

  // 6. persist first, so a mail failure can never lose the lead
  const row = {
    id: crypto.randomUUID(),
    email,
    name: clamp(input.name, 120),
    message: clamp(input.message, 4000),
    source: clamp(input.source, 40) ?? "unknown",
    user_agent: clamp(request.headers.get("user-agent") ?? undefined, 400),
    created_at: new Date().toISOString(),
  };

  try {
    await env.DB.prepare(
      `INSERT INTO leads (id, email, name, message, source, user_agent, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`,
    )
      .bind(
        row.id,
        row.email,
        row.name ?? null,
        row.message ?? null,
        row.source,
        row.user_agent ?? null,
        row.created_at,
      )
      .run();
  } catch (err) {
    console.error("d1 insert failed", err instanceof Error ? err.message : "unknown");
    return reply(wantsJson, { ok: false, error: "store" }, 500, env);
  }

  // 7. Mail, after the response is committed, and instantly rather than on a
  //    delay. A delay would cost the moment of highest intent and buy nothing;
  //    what makes the reply feel personal is the writing, not the timing.
  //    Resend's free tier is 3,000 a month but only 100 a day, and the daily
  //    cap is the one that bites.
  ctx.waitUntil(
    sendMail(
      {
        email: row.email,
        name: row.name,
        message: row.message,
        source: row.source,
        userAgent: row.user_agent,
        createdAt: row.created_at,
      },
      env,
    ),
  );

  return reply(wantsJson, { ok: true }, 200, env);
}

/* --- input ---------------------------------------------------------------- */

async function readInput(request: Request): Promise<LeadInput> {
  const type = request.headers.get("content-type") ?? "";
  if (type.includes("application/json")) {
    return (await request.json()) as LeadInput;
  }
  const form = await request.formData();
  const get = (k: string) => {
    const v = form.get(k);
    return typeof v === "string" ? v : undefined;
  };
  return {
    email: get("email") ?? "",
    name: get("name"),
    message: get("message"),
    source: get("source"),
    company: get("company"),
    elapsed: get("elapsed"),
    token: get("cf-turnstile-response"),
  };
}

/**
 * Normalise and validate. Lowercased, trimmed, length-capped. Deliberately not
 * a full RFC 5322 parser: that rejects valid addresses and accepts nonsense.
 */
function normaliseEmail(raw: string): string | null {
  const v = raw.trim().toLowerCase();
  if (v.length < 6 || v.length > 254) return null;
  if (!/^[^\s@]+@[^\s@.]+\.[^\s@]{2,}$/.test(v)) return null;
  if (v.includes("..")) return null;
  return v;
}

function clamp(v: string | undefined, max: number): string | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t ? t.slice(0, max) : undefined;
}

/* --- Turnstile ------------------------------------------------------------ */

async function verifyTurnstile(token: string, ip: string, env: Env): Promise<boolean> {
  // No secret configured means we cannot verify, and we do not pretend to.
  if (!env.TURNSTILE_SECRET_KEY) {
    console.warn("turnstile token received but TURNSTILE_SECRET_KEY is unset");
    return false;
  }
  try {
    const body = new FormData();
    body.append("secret", env.TURNSTILE_SECRET_KEY);
    body.append("response", token);
    body.append("remoteip", ip);
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body,
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { success?: boolean };
    return data.success === true;
  } catch {
    // fail closed
    return false;
  }
}

/* --- rate limit ----------------------------------------------------------- */

async function underRateLimit(env: Env, ip: string, limit: number): Promise<boolean> {
  if (!env.LEAD_RATE) return true;
  const key = `rl:${await sha256(ip)}`;
  try {
    const current = Number((await env.LEAD_RATE.get(key)) ?? "0");
    if (current >= limit) return false;
    await env.LEAD_RATE.put(key, String(current + 1), {
      expirationTtl: RATE_WINDOW_SECONDS,
    });
    return true;
  } catch {
    // A KV outage should not stop a real lead getting through.
    return true;
  }
}

/** The IP is hashed so the rate-limit store never holds a raw address. */
async function sha256(v: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(v));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/* --- mail -----------------------------------------------------------------
   Order matters: the submitter is answered first, then JD is told. If the
   daily cap is hit mid-pair, the person who raised their hand is the one who
   got the email.

   Both bodies live in src/content/emails.ts so the wording can be edited
   without touching any logic here. Only the booking link and the submitted
   fields are templated.

   Nothing in here can fail the request. The row is already in D1 before this
   runs, and it runs inside waitUntil, so a delivery failure is a logged
   warning and the browser still sees success. A lead that reached the
   database is not a failed submission.
   ------------------------------------------------------------------------ */

async function sendMail(lead: LeadFields, env: Env): Promise<void> {
  if (!env.RESEND_API_KEY || !env.MAIL_FROM || !env.NOTIFY_TO) {
    console.warn("resend not configured; lead stored, no mail sent");
    return;
  }

  const bookingUrl = env.CAL_LINK || mail.fallbackBookingUrl;
  const replyTo = env.NOTIFY_TO;

  // 1. the person who just submitted
  const toSubmitter = {
    from: env.MAIL_FROM,
    to: [lead.email],
    reply_to: replyTo,
    subject: mail.submitter.subject,
    text: mail.submitter.body({ bookingUrl }),
  };

  // 2. JD. Reply-To is the submitter, so hitting reply answers them.
  const toJd = {
    from: env.MAIL_FROM,
    to: [env.NOTIFY_TO],
    reply_to: lead.email,
    subject: mail.alert.subject(lead.email),
    text: mail.alert.body(lead),
  };

  for (const payload of [toSubmitter, toJd]) {
    await send(payload, env);
  }
}

async function send(payload: Record<string, unknown>, env: Env): Promise<void> {
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${env.RESEND_API_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      // 429 here is the 100/day free-tier cap. The lead is already in D1.
      console.warn(`resend ${res.status} for "${String(payload.subject)}"`);
    }
  } catch (err) {
    console.warn("resend threw", err instanceof Error ? err.message : "unknown");
  }
}

/* --- responses ------------------------------------------------------------ */

function json(body: unknown, status: number, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...headers },
  });
}

/**
 * JSON for the enhanced path, a 303 for the no-JS path. A 303 is correct here:
 * it turns the POST into a GET so a refresh cannot resubmit.
 */
function reply(
  wantsJson: boolean,
  body: { ok: boolean; error?: string },
  status: number,
  env: Env,
  headers: Record<string, string> = {},
): Response {
  if (wantsJson) return json(body, status, headers);

  const base = env.SITE_URL ?? "https://legroomcompany.com";
  const to = body.ok ? "/thanks" : `/contact?error=${encodeURIComponent(body.error ?? "unknown")}`;
  return new Response(null, {
    status: 303,
    headers: { location: new URL(to, base).toString(), ...headers },
  });
}
