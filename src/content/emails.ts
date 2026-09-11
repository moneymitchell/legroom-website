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
    subject: "Your free breakdown",

    /**
     * Four short lines. What it is, the link on its own line, a way out that
     * is not the link, and a name.
     */
    body: ({ bookingUrl, siteUrl }: { bookingUrl: string; siteUrl: string }) =>
      [
        "Thanks for reaching out.",
        "",
        "The breakdown is 45 minutes on how work actually moves through your business. We size what it is costing you, then hand you the two things worth automating first, with the hours and dollars attached. No pitch, and you keep the one page either way.",
        "",
        "Pick a time here:",
        bookingUrl,
        "",
        `If you would rather not book yet, just reply to this email with your website (${siteUrl.replace(/^https?:\/\//, "")} is mine) and I will take a look before we talk.`,
        "",
        "JD",
      ].join("\n"),
  },

  /* --- to JD --------------------------------------------------------------- */
  alert: {
    /** The address is in the subject so it is readable on a lock screen. */
    subject: (email: string) => `New breakdown request: ${email}`,

    body: (lead: LeadFields) => {
      const lines = [
        `Email:      ${lead.email}`,
        lead.name ? `Name:       ${lead.name}` : null,
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
