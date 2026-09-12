/**
 * ============================================================================
 * EVERY user-facing string on legroomcompany.com lives here.
 *
 * No component contains hardcoded copy. To change a word, change it here and
 * nowhere else. Strings are transcribed verbatim from the approved design in
 * handoff/reference/*.html, HTML entities resolved to real characters.
 *
 * WRITING RULE, permanent: no em dashes. Anywhere. Use a comma, a period or a
 * colon. tests/copy.spec.ts fails the build if one appears in any user-facing
 * string, so this cannot drift back in. En dashes are allowed in numeric
 * ranges only ("2-4 weeks"), which is what the design uses.
 *
 * Anything wrapped in [square brackets] is a PLACEHOLDER waiting on JD.
 * See PLACEHOLDERS at the bottom.
 * ============================================================================
 */

/* --- types ---------------------------------------------------------------- */

export type NavLink = { readonly label: string; readonly href: string };

export type Step = { readonly n: string; readonly title: string; readonly body: string };

export type ReceiptRow = { readonly label: string; readonly value: string };

export type SellingPoint = { readonly title: string; readonly body: string };

export type ClientResult = {
  readonly slug: string;
  /** File stem in /public/logos. Expects `logo-<stem>.svg` and `logo-<stem>-ghost.svg`. */
  readonly logo: string;
  readonly logoAlt: string;
  /** The reference sized some logos by height and some by width. */
  readonly logoStyle: string;
  /**
   * Ghost width, per logo. The four source files differ in aspect ratio by
   * about 5x, so one shared value makes GradMasters unreadable and EL1 tiny.
   * Re-measured for R2, which narrowed all four. Do not collapse them.
   */
  readonly ghostWidth: string;
  readonly result: string;
  readonly qualifier: string;
  readonly company: string;
  readonly vertical: string;
};

export type PromiseCard = {
  readonly figure: string;
  readonly label: string;
  readonly body: string;
  /** Only the first card carries the marker underline. One mark per section. */
  readonly underlined?: boolean;
};

export type QARow = { readonly key: string; readonly value: string };

/** A stat row on a founder card. `href` turns the value into a link. */
export type StatRow = { readonly label: string; readonly value: string; readonly href?: string };

export type Social = { readonly label: string; readonly href: string };

export type Founder = {
  readonly index: string;
  readonly photo: string;
  readonly photoAlt: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly role: string;
  readonly school: string;
  readonly socials: readonly Social[];
  readonly pills: readonly string[];
  readonly stats: readonly StatRow[];
  readonly bio: string;
  readonly quote: string;
};

/* --- the site ------------------------------------------------------------- */

export const site = {
  /* --- identity + SEO ---------------------------------------------------- */
  meta: {
    name: "Legroom",
    legalName: "The Legroom Company LLC",
    url: "https://legroomcompany.com",
    title: "Legroom, we give owners their legroom back",
    description:
      "We find the work eating your team’s week and build the automated workflows that free you up to do what matters. Free 15-minute call, no pitch.",
    ogImage: "/og-image.jpg",
    ogImageAlt: "Legroom. We give owners their legroom back.",
    locale: "en_US",
    region: "Washington",
    email: "jd@legroomcompany.com",
    foundingYear: "2019",
  },

  /* --- nav ---------------------------------------------------------------- */
  nav: {
    logoAlt: "Legroom",
    links: [
      { label: "The Breakdown", href: "#breakdown" },
      { label: "How it works", href: "#how-it-works" },
      { label: "Who we are", href: "#who-we-are" },
    ] as readonly NavLink[],
    cta: "Book a call",
    menuOpen: "Open menu",
    menuClose: "Close menu",
  },

  /* --- 1. hero ------------------------------------------------------------ */
  hero: {
    chip: "2 spots open · September",
    /* Three parts so the sharpie wraps exactly one word. Never two. */
    headlineBefore: "We give owners",
    headlineLead: "their",
    headlineHighlight: "LEGROOM",
    headlineAfter: "back.",
    sub: "We find the work eating your team’s week and build the automated workflows that free you up to do what matters.",
    ctaPrimary: "Book a free breakdown",
    ctaSecondary: "Send us a note",
    trust: "Operating since 2019",
    /* Phones only. The credibility band is a long scroll away there. */
    mobileFacts: [
      { bold: "OPERATING SINCE 2019", rest: "" },
      { bold: "10× ROAS", rest: " · EL1" },
      { bold: "+200%", rest: " · Savoir" },
      { bold: "$30K saved", rest: " · GradMasters" },
    ],
    /* The measured-drawing panel. Coordinates are geometry and live in
       Hero.astro; only the words are here. */
    figure: {
      dimA: "A · every hour, mapped",
      note1: "1 · Where the\nweek goes",
      note2: "2 · What we\nautomate first",
      dimB: "B · owner time",
      measure: "C · legroom, what you get back",
      figCaption: "Fig. 1 · the seat, measured",
      slotNote: "Illustration slot · 500 × 470",
      slotNoteMobile: "Illustration slot · 350 × 280",
    },
  },

  /* --- 2. the breakdown --------------------------------------------------- */
  breakdown: {
    eyebrow: "The free breakdown · 15 minutes · no pitch",
    headlineLines: ["We sit down,", "we do the math,", "you keep the "],
    headlineHighlight: "one page",
    headlineTail: ".",
    lead: "Fifteen minutes on how work actually moves through your business. We find the most expensive thing your team is doing by hand, size it out loud, and tell you what we would automate first.",
    steps: [
      {
        n: "01",
        title: "We sit down with you",
        body: "One short call. How a job gets from first call to paid, where it jams, and who it lands on.",
      },
      {
        n: "02",
        title: "We do the math out loud",
        body: "Your volume, your close rate, industry benchmarks. Sources shown, assumptions labeled, nothing hidden.",
      },
      {
        n: "03",
        title: "You keep the one page",
        body: "The two automations worth building first, ranked, with the numbers behind them. Yours either way.",
      },
    ] as readonly Step[],
    capture: {
      placeholder: "you@yourcompany.com",
      inputLabel: "Your email",
      submit: "Get my free breakdown",
      chip: "2 spots open",
      note: "One email back from a real person. No sequence, no spam.",
      /* Inline states for the progressive-enhancement handler. */
      sending: "Sending…",
      success: "Got it. Check your inbox, the booking link is in there.",
      errorGeneric: "That did not send. Email jd@legroomcompany.com and we will pick it up.",
      errorEmail: "That email address does not look right.",
      errorRate: "Too many tries. Give it a minute, then send again.",
    },
    receipt: {
      eyebrow: "Legroom breakdown",
      company: "Sample Co.",
      rows: [
        { label: "Monthly visitors", value: "4,200" },
        { label: "Leads not answered in 5 min", value: "~68%" },
        { label: "Hours on manual intake / wk", value: "11.5" },
        { label: "Build #1, instant lead reply", value: "2 wks" },
      ] as readonly ReceiptRow[],
      totalLabel: "Recovered / year",
      totalValue: "$61,400",
      footnote:
        "Every figure tagged: observed, benchmark, or modeled. Nothing printed we cannot source.",
      caption: "The one page. Your numbers, ready to act on.",
    },
    get: {
      eyebrow: "What you’ll get",
      items: [
        "The two automations worth building first, ranked",
        "What the manual version costs you today, in hours and dollars",
        "A build plan and a flat price, with no obligation to use it",
      ],
      note: "Yours to keep whether we work together or not.",
    },
  },

  /* --- 3. credibility ----------------------------------------------------- */
  credibility: {
    eyebrow: "Proof, not promises",
    headlineBefore: "Been doing",
    headlineLead: "this since ",
    headlineUnderline: "2019",
    headlineTail: ".",
    body: "Not a new agency riding a trend. Seven years of growth work, early on AI since the first models that could actually ship it.",
    /* R2: the three chips became three real selling points, bottom aligned
       with the client table. */
    selling: [
      {
        title: "We build it, not just connect it",
        body: "When the system needs a real dashboard, portal or API, we build that too.",
      },
      {
        title: "Founder led. No juniors.",
        body: "You get the two of us on the work, start to finish.",
      },
      {
        title: "Flat price, quoted up front",
        body: "No hourly, no scope creep, no invoice you did not see coming.",
      },
    ] as readonly SellingPoint[],
    workEyebrow: "Selected work",
    work: [
      {
        slug: "el1",
        logo: "el1",
        logoAlt: "EL1",
        logoStyle: "height:42px",
        ghostWidth: "140%",
        result: "10× ROAS",
        qualifier: "in under three months",
        company: "EL1",
        vertical: "Youth sports",
      },
      {
        slug: "savoir",
        logo: "savoir",
        logoAlt: "Salon Savoir",
        logoStyle: "width:128px",
        ghostWidth: "172%",
        result: "+200%",
        qualifier: "monthly revenue",
        company: "Salon Savoir",
        vertical: "Beauty salon",
      },
      {
        slug: "gradmasters",
        logo: "gradmasters",
        logoAlt: "GradMasters",
        logoStyle: "height:40px",
        ghostWidth: "126%",
        result: "$30K",
        qualifier: "saved in dev costs",
        company: "GradMasters",
        vertical: "Education tech",
      },
      {
        slug: "formidable",
        logo: "formidable",
        logoAlt: "Formidable",
        logoStyle: "height:42px",
        ghostWidth: "134%",
        result: "2.5×",
        qualifier: "subscribers in under three months",
        company: "Formidable",
        vertical: "Newsletter SaaS",
      },
    ] as readonly ClientResult[],
  },

  /* --- 4. the promise ----------------------------------------------------- */
  promise: {
    eyebrow: "The promise",
    headlineLines: ["You get the week back.", "We show you the receipt."],
    lead: "Every build ships with a before and after. Hours in, hours out, dollars attached. If the number is not real, we do not print it.",
    cards: [
      {
        figure: "15+ HOURS",
        label: "A week, back",
        body: "Per person, on the first process we automate. That is four to six thousand a month in payroll spent doing work a system should be doing.",
        underlined: true,
      },
      {
        figure: "+35%",
        label: "Revenue, in 60 days",
        body: "What we target once the first system is live and leads stop leaking. Your breakdown sizes it against your real volume before anyone builds anything.",
      },
      {
        figure: "30 DAYS",
        label: "To a number you can check",
        body: "First system live and measured inside a month. You see the before and after in your own numbers, not ours.",
      },
    ] as readonly PromiseCard[],
    footnoteBefore:
      "These are ranges from work we have done, not guarantees. Your breakdown replaces every one of them with ",
    footnoteUnderline: "your numbers",
    footnoteAfter: ", pulled from your site, your volume, your market.",
  },

  /* --- 5. wordmark break -------------------------------------------------- */
  wordmark: {
    lockupAlt: "Legroom",
  },

  /* --- the sticky rail ----------------------------------------------------
     Moved out of the wordmark section and onto a bar pinned to the bottom of
     the viewport. Four stops, read in order, with a yellow train running the
     line and lighting each one as it arrives. The order is the argument: try
     it, measure it, bank the saving, put it back to work. */
  rail: {
    label: "How the work pays for itself",
    stops: ["Try Legroom", "Measure the results", "Less time more money", "Reinvest and grow"],
  },

  /* --- 6. CTA + founders -------------------------------------------------- */
  cta: {
    eyebrow: "Last thing",
    /* R3: the section was built on "two spots", which is a tag line, not an
       argument. The real close is the size of the ask and an honest answer at
       the end of it. */
    headlineLines: ["Fifteen minutes.", "Then you decide."],
    lead: "Most businesses your size are paying people to do work a system should be doing. We find the most expensive one and put a number on it. If there is real money on the table, you will see it on the call. If there is not, we say so, and you are out fifteen minutes.",
    qa: [
      {
        key: "Cost",
        value: "The breakdown is free. Builds are quoted flat, before any work starts.",
      },
      { key: "Time", value: "15 minutes on a call. First build usually live in 2–4 weeks." },
      {
        key: "After",
        value: "Monthly partnership or one time project. Results well worth the investment.",
      },
      {
        key: "Fit",
        value: "We take work we can measure. If that is not what you need, we will tell you on the call.",
      },
    ] as readonly QARow[],
    ctaPrimary: "Book a free breakdown",
    ctaSecondary: "Send us a note",
    chip: "2 spots open · September",
  },

  founders: {
    cardEyebrow: "Who you will sit down with",
    cardOrg: "The Legroom Company",
    deckLabel: "Founder cards",
    deckHint: "Use the arrow keys or the dots to move between founders.",
    dotLabel: (n: number, name: string) => `Show card ${n}: ${name}`,
    list: [
      {
        index: "01 / 02",
        photo: "/photos/jd-photo.jpg",
        photoAlt: "JD Worcester, founder of Legroom",
        firstName: "JD",
        lastName: "Worcester",
        role: "Founder, Creative, Growth Hacker",
        school: "Santa Clara · BS Management",
        socials: [
          { label: "LinkedIn", href: "https://www.linkedin.com/in/jdworcester/" },
          { label: "jdworcester.com", href: "https://jdworcester.com/" },
        ],
        pills: ["Golf", "Baking pizza", "Lifting", "Watch collecting"],
        stats: [
          { label: "In the game since", value: "2000" },
          // href "#" is a placeholder: JD to supply the Dotted URL.
          { label: "Currently building", value: "Dotted", href: "#" },
          { label: "Superpowers", value: "Design & Growth" },
        ],
        bio: "Former college athlete, early OpenAI beta tester. Spends his time finding the tool everyone else will be using in a year. Found the cheat codes so you don’t have to.",
        quote: "Every owner I talk to is doing four jobs. I want to hand three of them back.",
      },
      {
        index: "02 / 02",
        photo: "/photos/sean-photo.jpg",
        photoAlt: "Sean Ajulu-Okeke, partner on delivery at Legroom",
        firstName: "Sean",
        lastName: "Ajulu-Okeke",
        role: "Founder, Builder, Innovator",
        /* The degree wording is FROM SEAN'S BIO BELOW, not read off his
           LinkedIn: LinkedIn answers automated requests with HTTP 999, so it
           could not be verified. School confirmed by JD, 2026-09-12. If the
           exact award is "MS Cybersecurity" or a dual degree, correct it here
           and in the bio together. */
        school: "San Jose State · MS Software Engineering",
        socials: [{ label: "LinkedIn", href: "https://www.linkedin.com/in/chibuikem/" }],
        pills: ["Running", "Plants", "Lifting", "Traveling"],
        stats: [
          { label: "In the game since", value: "1994" },
          {
            label: "Currently building",
            value: "Sendmeflowers.io",
            href: "https://sendmeflowers.io",
          },
          { label: "Superpowers", value: "Full stack & security" },
        ],
        bio: "Has lived on almost every continent and now builds from San Francisco. The rare engineer who is as careful as he is quick. When Sean ships something, it works, and it keeps working.",
        quote: "There’s always more money on the table, we just help you find it.",
      },
    ] as readonly Founder[],
  },

  /* --- footer -------------------------------------------------------------- */
  footer: {
    logoAlt: "Legroom",
    email: "jd@legroomcompany.com",
    links: [{ label: "LinkedIn", href: "https://www.linkedin.com/in/jdworcester/" }] as readonly NavLink[],
    copyright: "© 2026 The Legroom Company LLC",
  },

  /* --- contact page / no-JS fallback --------------------------------------- */
  contact: {
    eyebrow: "Send us a note",
    headline: "Tell us what is eating the week.",
    lead: "One email back from a real person. If a breakdown makes sense we will send a booking link with it.",
    nameLabel: "Your name",
    namePlaceholder: "Jane Rivera",
    emailLabel: "Your email",
    emailPlaceholder: "you@yourcompany.com",
    messageLabel: "What’s going on",
    messagePlaceholder: "The part of the week that keeps disappearing.",
    submit: "Send it",
    back: "Back to the top",
  },

  thanks: {
    eyebrow: "Got it",
    headline: "That’s in.",
    lead: "One of us reads every note. You will hear back from a real person, usually same day.",
    bookLine: "Want to skip the back and forth? Grab the 15 minutes now.",
    cta: "Book a free breakdown",
    back: "Back to the site",
  },
} as const;

/**
 * Still waiting on JD.
 *
 *  1. The "Dotted" link on JD’s card is href="#".
 *  2. Sean’s LinkedIn and personal site both point at JD’s URLs in the
 *     approved reference. Ported verbatim rather than guessed at.
 *  3. The hero illustration slot is an empty measured-drawing panel.
 */
export const PLACEHOLDERS = [
  "Dotted URL on JD’s founder card",
  "Sean’s own LinkedIn and site URLs",
  "Hero illustration artwork",
] as const;

export type Site = typeof site;
