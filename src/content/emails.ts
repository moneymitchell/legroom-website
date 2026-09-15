/**
 * ============================================================================
 * The two transactional emails.
 *
 * Kept out of the Worker so the wording can be edited without touching any
 * logic. Only the booking link, and the submitted fields, are templated.
 *
 * These are plain text. Not "HTML styled to look plain", actually plain: no
 * header image, no logo, no button, no two-column layout, no unsubscribe
 * footer. Someone just raised their hand and this is a reply from a person,
 * not a newsletter. Anything that looks designed makes it look automated.
 *
 * WRITING RULE: no em dashes. tests/copy.spec.ts enforces it here too.
 *
 * The Worker imports this file directly, so it must stay free of browser and
 * Node APIs.
 * ========================================================================= */

export type LeadFields = {
  firstName?: string | undefined;
  lastName?: string | undefined;
  website?: string | undefined;
  email: string;
  name?: string | undefined;
  message?: string | undefined;
  source: string;
  userAgent?: string | undefined;
  /** ISO 8601, UTC. Rendered into Pacific for the alert. */
  createdAt: string;
};

export const mail = {
  /** Falls back to the site's contact page if CAL_LINK is somehow unset. */
  fallbackBookingUrl: "https://legroomcompany.com/contact",

  /* --- to the person who just submitted ---------------------------------- */
  submitter: {
    /* The sender already carries the brand, so the subject does not need to
       repeat it and can be specific instead. "15 minutes" is the thing they
       actually agreed to and the thing that distinguishes this from every
       other reply-to-your-enquiry email in the inbox. */
    subject: "Your free breakdown, 15 minutes",

    /**
     * Four short lines. What it is, the link on its own line, a way out that
     * is not the link, and a name.
     */
    body: ({ bookingUrl, firstName, website }: {
      bookingUrl: string;
      firstName?: string | undefined;
      website?: string | undefined;
    }) =>
      [
        // The name is the cheapest warmth available and it is free, because
        // they just typed it. No name means the inline capture, which only
        // ever asked for an email, so it falls back rather than greeting
        // nobody.
        firstName ? `Thanks for reaching out, ${firstName}.` : "Thanks for reaching out.",
        "",
        "It’s 15 minutes on how work actually moves through your business. We find the most expensive thing your team is doing by hand and tell you what it’s costing you. No pitch, and you keep the number either way.",
        "",
        "Pick a time:",
        bookingUrl,
        "",
        // Two different next lines, because they are in two different places.
        // Someone who gave a website has already done the thing we would
        // otherwise ask for, so asking again reads as though nobody looked.
        website
          ? `I’ll have a look at ${website.replace(/^https?:\/\//, "")} before we talk, so we can skip the background and get to the part that costs you money.`
          : "Not ready to book? Reply to this email with your website and I’ll take a look before we talk.",
        "",
        // Says what happens if they do nothing. Sets the expectation, and
        // gives the follow-up a reason to exist that isn't a cold nudge.
        "If I don’t hear back I’ll follow up once next week, then leave you alone.",
        "",
        "JD",
      ].join("\n"),
  },

  /* --- to JD --------------------------------------------------------------- */
  alert: {
    /** The address is in the subject so it is readable on a lock screen. */
    /* The source is in the subject because it is the only thing that changes
       how you read the rest of it. "breakdown" is someone who dropped an email
       into the inline capture mid-page; "contact" is someone who went to the
       contact page and wrote something. Different intent, different reply. */
    subject: (lead: LeadFields) =>
      `New ${lead.source} lead: ${lead.firstName || lead.name || lead.email}`,

    body: (lead: LeadFields) => {
      const lines = [
        lead.name ? `Name:       ${lead.name}` : null,
        `Email:      ${lead.email}`,
        // Directly under the email, because it is the first thing you act on:
        // it is what the pre-call research starts from.
        lead.website ? `Website:    ${lead.website}` : null,
        `Source:     ${lead.source}`,
        `When:       ${pacific(lead.createdAt)}`,
        lead.userAgent ? `User agent: ${lead.userAgent}` : null,
      ].filter(Boolean) as string[];

      if (lead.message) {
        lines.push("", "Message:", lead.message);
      }
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
     * and none of them render anything. So this carries only the two facts
     * worth waking someone up for: who, and from which form. The full detail
     * is in the email that went out alongside it.
     */
    subject: "Lead",
    body: (lead: LeadFields) =>
      `Legroom ${lead.source} lead: ${lead.email}${lead.name ? ` (${lead.name})` : ""}${lead.website ? ` ${lead.website.replace(/^https?:\/\//, "")}` : ""}`.slice(
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
