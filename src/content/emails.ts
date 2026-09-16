/**
 * ============================================================================
 * The transactional emails, and the text.
 *
 * Kept out of the Worker so the wording can be edited without touching any
 * logic. Only the booking link, and the submitted fields, are templated.
 *
 * These are plain text. Not "HTML styled to look plain", actually plain: no
 * header image, no logo, no button, no two-column layout, no unsubscribe
 * footer. Someone just raised their hand and this is a reply from a person,
 * not a newsletter. Anything that looks designed makes it look automated.
 *
 * WRITING RULE: no em dashes. tests/copy.spec.ts enforces it here too. The
 * apostrophes in the submitter email are straight quotes on purpose: it is
 * plain text from a person, and a typographer's apostrophe in a plain text
 * email is one more thing that reads as generated.
 *
 * The Worker imports this file directly, so it must stay free of browser and
 * Node APIs. Run `npm run emails` after editing to read the result before it
 * reaches a real inbox.
 * ========================================================================= */

// The .ts extension is for Node: scripts/preview-emails.mjs imports this file
// with type stripping, which resolves nothing without it. tsc, Vite and
// wrangler are all fine with it.
import { site } from "./site.ts";

export type LeadFields = {
  firstName?: string | undefined;
  lastName?: string | undefined;
  website?: string | undefined;
  email: string;
  name?: string | undefined;
  message?: string | undefined;
  source: string;
  /** Stored in D1. Not rendered anywhere: it is noise in an inbox. */
  userAgent?: string | undefined;
  /** ISO 8601, UTC. Rendered into Pacific for the alert. */
  createdAt: string;
};

/**
 * "acme.com", not "https://acme.com/". The Worker stores a full URL because
 * everything downstream wants one; a person reading an email does not. The
 * scheme goes, and so does a trailing slash. A path the visitor typed stays.
 */
export function readable(url: string): string {
  return url.replace(/^https?:\/\//i, "").replace(/\/$/, "");
}

export const mail = {
  /** Falls back to the site's contact page if CAL_LINK is somehow unset. */
  fallbackBookingUrl: "https://legroomcompany.com/contact",

  /* --- to the person who just submitted ---------------------------------- */
  submitter: {
    /* The sender already carries the brand, so the subject does not need to
       repeat it. "15 minutes" is the thing they actually agreed to. Not
       "free": in a subject line it is a spam signal, and it undersells. */
    subject: "Your 15 minutes",

    /**
     * JD's brief, 2026-09-15: "As promised" tone, warm, spartan, human. No
     * "no pitch", because saying you are not selling is a thing only
     * salespeople say. Every line does one job.
     *
     * The hard wraps are deliberate. It is plain text, and a plain text email
     * that wraps at seventy characters reads as typed.
     */
    body: ({
      bookingUrl,
      firstName,
      website,
    }: {
      bookingUrl: string;
      firstName?: string | undefined;
      website?: string | undefined;
    }) =>
      [
        // Never "Hi ," and never a greeting addressed to nobody. No first
        // name means the inline capture, which only ever asked for an email.
        `Hi ${firstName || "there"},`,
        "",
        "Thanks for reaching out. As promised, here is the link:",
        "",
        bookingUrl,
        "",
        "Fifteen minutes on where your week actually goes. We find the most",
        "expensive thing your team still does by hand and put a number on it.",
        "You keep the number either way.",
        "",
        // Two different lines, because they are in two different places.
        // Someone who gave a website has already done the thing we would
        // otherwise ask for, so asking again reads as though nobody looked.
        website
          ? `I'll dive into ${readable(website)} before we talk.`
          : "Reply with your website and I'll look before we talk.",
        "Let me know if there's any pains you'd like to bring up beforehand.",
        "",
        "If I don't hear back I'll nudge you once next week.",
        "",
        // JD's sign-off, 2026-09-15, as written.
        "Kind Regards,",
        "JD Worcester",
        "The Legroom Company™",
      ].join("\n"),
  },

  /* --- to JD --------------------------------------------------------------- */
  alert: {
    /* The source is in the subject because it is the only thing that changes
       how you read the rest of it. "breakdown" is someone who dropped an email
       into the inline capture mid-page; "contact" is someone who went to the
       contact page and wrote something. Different intent, different reply. */
    subject: (lead: LeadFields) =>
      `New ${lead.source} lead: ${lead.firstName || lead.name || lead.email}`,

    /**
     * Read on a phone, in five seconds, to decide whether to reply now. So:
     * the fields JD acts on, in the order he acts on them, and nothing else.
     * The website is shown without its scheme because it is being read, not
     * clicked. The user agent is not here at all; it is in D1 if it is ever
     * needed.
     */
    body: (lead: LeadFields) => {
      const lines = [
        lead.name ? `Name:      ${lead.name}` : null,
        `Email:     ${lead.email}`,
        lead.website ? `Website:   ${readable(lead.website)}` : null,
        `Source:    ${lead.source}`,
      ].filter(Boolean) as string[];

      if (lead.message) {
        // Labelled with the question the form actually asked, read from the
        // same string the form renders, so the two cannot drift apart.
        lines.push("", `${site.contact.messageLabel}`, lead.message);
      }
      lines.push("", `Received ${pacific(lead.createdAt)}`);
      lines.push("", "Reply to this email to answer them directly.");
      return lines.join("\n");
    },
  },

  /* --- to JD's phone ------------------------------------------------------- */
  sms: {
    /**
     * Sent through a carrier email-to-SMS gateway, so it is an email that
     * arrives as a text and needs no SMS provider account.
     *
     * ONE LINE, and short. Gateways cut the message around 160 characters,
     * several of them prepend the subject and the sender address to the body,
     * and none of them render anything. So this carries only the facts worth
     * waking someone up for: who, from which form, and their site. The full
     * detail is in the email that went out alongside it.
     */
    subject: "Lead",
    body: (lead: LeadFields) =>
      `Legroom ${lead.source} lead: ${lead.email}${lead.name ? ` (${lead.name})` : ""}${lead.website ? ` ${readable(lead.website)}` : ""}`.slice(
        0,
        140,
      ),
  },
} as const;

/**
 * Renders an ISO timestamp in Pacific time. JD is in Washington, so a UTC
 * stamp in an alert is one more thing to convert at a glance.
 *
 * Intl is available in Workers, so this needs no dependency and no table of
 * daylight-saving dates.
 */
export function pacific(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const formatted = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(d);
  return formatted;
}
