/**
 * Renders the two transactional emails and the text exactly as the Worker
 * will send them, once with every field filled and once with only the
 * required ones, so both branches of every template are read before they
 * reach a real inbox. Run after editing src/content/emails.ts: `npm run emails`.
 */
// Node strips the types on import, so the preview reads the same file the
// Worker does. No copy, no drift.
const { mail } = await import("../src/content/emails.ts");

const BOOKING = process.env.CAL_LINK ?? "https://cal.com/jdworcester/15min";

/** Shaped exactly as worker/index.ts builds `fields` before sending. */
const full = {
  email: "jane@rivera-plumbing.com",
  firstName: "Jane",
  lastName: "Rivera",
  name: "Jane Rivera",
  website: "https://rivera-plumbing.com",
  message: "Quoting eats every Friday afternoon and we still miss callbacks.",
  source: "contact",
  userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_2 like Mac OS X) AppleWebKit/605.1.15",
  createdAt: new Date("2026-09-11T21:14:00Z").toISOString(),
};

/** The inline capture on the homepage: an email and nothing else. */
const bare = {
  email: "sam@example.com",
  source: "breakdown",
  createdAt: full.createdAt,
};

const line = "=".repeat(72);

function render(label, lead) {
  console.log(`\n${line}\n${label}\n${line}`);

  console.log(`\n--- 1. TO THE SUBMITTER`);
  console.log(`From:     JD at Legroom <jd@legroomcompany.com>`);
  console.log(`To:       ${lead.email}`);
  console.log(`Reply-To: jd@legroomcompany.com`);
  console.log(`Subject:  ${mail.submitter.subject}\n`);
  console.log(
    mail.submitter.body({ bookingUrl: BOOKING, firstName: lead.firstName, website: lead.website }),
  );

  console.log(`\n--- 2. TO JD`);
  console.log(`From:     JD at Legroom <jd@legroomcompany.com>`);
  console.log(`To:       jd@legroomcompany.com`);
  console.log(`Reply-To: ${lead.email}`);
  console.log(`Subject:  ${mail.alert.subject(lead)}\n`);
  console.log(mail.alert.body(lead));

  console.log(`\n--- 3. TO JD'S PHONE`);
  console.log(`Subject:  ${mail.sms.subject}`);
  console.log(`Body:     ${mail.sms.body(lead)}`);
  console.log();
}

render("A. CONTACT FORM, EVERY FIELD FILLED", full);
render("B. INLINE CAPTURE, EMAIL ONLY", bare);
