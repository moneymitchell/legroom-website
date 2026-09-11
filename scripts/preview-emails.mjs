/**
 * Renders both transactional emails exactly as the Worker will send them.
 * Run after editing src/content/emails.ts to read the result before it reaches
 * a real inbox: `npm run emails`.
 */
// Node strips the types on import, so the preview reads the same file the
// Worker does. No copy, no drift.
const mod = await import("../src/content/emails.ts");

const { mail } = mod;
const BOOKING = process.env.CAL_LINK ?? "https://cal.com/jdworcester/discovery";

const lead = {
  email: "jane@rivera-plumbing.com",
  name: "Jane Rivera",
  message: "Quoting eats every Friday afternoon and we still miss callbacks.",
  source: "contact",
  userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_2 like Mac OS X) AppleWebKit/605.1.15",
  createdAt: new Date("2026-09-11T21:14:00Z").toISOString(),
};

const line = "=".repeat(72);
console.log(`\n${line}\n1. TO THE SUBMITTER\n${line}`);
console.log(`From:     JD Worcester <jd@legroomcompany.com>`);
console.log(`To:       ${lead.email}`);
console.log(`Reply-To: jd@legroomcompany.com`);
console.log(`Subject:  ${mail.submitter.subject}\n`);
console.log(mail.submitter.body({ bookingUrl: BOOKING }));

console.log(`\n${line}\n2. TO JD\n${line}`);
console.log(`From:     JD Worcester <jd@legroomcompany.com>`);
console.log(`To:       jd@legroomcompany.com`);
console.log(`Reply-To: ${lead.email}`);
console.log(`Subject:  ${mail.alert.subject(lead.email)}\n`);
console.log(mail.alert.body(lead));
console.log();
