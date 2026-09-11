/**
 * ============================================================================
 * EVERY user-facing string on legroomcompany.com lives here.
 *
 * No component contains hardcoded copy. To change a word, change it here and
 * nowhere else. Strings are transcribed verbatim from the approved design in
 * handoff/reference/*.html, HTML entities resolved to real characters.
 *
 * Anything wrapped in [square brackets] is a PLACEHOLDER waiting on JD. Do not
 * invent a replacement. See PLACEHOLDERS at the bottom for the full list.
 * ============================================================================
 */

/* --- types ---------------------------------------------------------------- */

export type NavLink = { readonly label: string; readonly href: string };

export type Step = {
  readonly n: string;
  readonly title: string;
  readonly body: string;
};

export type ReceiptRow = { readonly label: string; readonly value: string };

export type ClientResult = {
  readonly slug: string;
  /** File stem in /public/logos. Expects `logo-<stem>.svg` and `logo-<stem>-ghost.svg`. */
  readonly logo: string;
  /** Alt text for the foreground logo. */
  readonly logoAlt: string;
  /** Sizing for the foreground logo: the reference sized some by height, some by width. */
  readonly logoStyle: string;
  /**
   * Ghost width, per logo. The four source files differ in aspect ratio by ~5x,
   * so a single scale makes GradMasters unreadable and EL1 invisible. Measured
   * per logo against the reference. Do not collapse these into one value.
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
  /** Only the first card carries the sharpie sweep behind the figure. */
  readonly swept?: boolean;
};

export type QARow = { readonly key: string; readonly value: string };

export type StatRow = { readonly label: string; readonly value: string };

export type Social = { readonly label: string; readonly href: string };

export type Founder = {
  readonly index: string;
  readonly photo: string;
  readonly photoAlt: string;
  /** Rendered on two lines: given name, then family name. */
  readonly firstName: string;
  readonly lastName: string;
  readonly role: string;
  readonly school: string;
  readonly socials: readonly Social[];
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
    title: "Legroom — We give owners their legroom back",
    description:
      "We find the work eating your team's week and build the systems that do it for you. Free 45-minute business breakdown, no pitch.",
    ogImage: "/og-image.jpg",
    ogImageAlt: "Legroom. We give owners their legroom back.",
    locale: "en_US",
    region: "Washington",
    email: "hello@legroomcompany.com",
    /** Schema.org areaServed + the ticker line under the wordmark. */
    servedIndustries: ["Youth sports", "Home services"],
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
    /* The headline is three parts so the sharpie highlight can wrap exactly
       the one word. Never highlight two words. */
    headlineBefore: "We give owners",
    headlineHighlight: "LEGROOM",
    headlineAfter: "back.",
    headlineLead: "their",
    sub: "We find the work eating your team's week and build the systems that do it for you.",
    ctaPrimary: "Book a free breakdown",
    ctaSecondary: "Send us a note",
    trust: "Operating since 2019",
    /* The narrow-screen facts strip, from reference/08-mobile.html. It replaces
       the trust line's job on phones, where the credibility band is a long
       scroll away. Desktop never shows it. */
    mobileFacts: [
      { bold: "OPERATING SINCE 2019", rest: "" },
      { bold: "10\u00d7 ROAS", rest: " \u00b7 EL1" },
      { bold: "+200%", rest: " \u00b7 Savoir" },
      { bold: "$30K saved", rest: " \u00b7 GradMasters" },
    ],
    /* The measured-drawing panel. Annotations are positioned absolutely; the
       coordinates live in Hero.astro because they are geometry, not copy. */
    figure: {
      dimA: "A — every hour, mapped",
      note1: "1 — Where the\nweek goes",
      note2: "2 — What we\nautomate first",
      dimB: "B — owner time",
      measure: "C — legroom · what you get back",
      figCaption: "Fig. 1 — the seat, measured",
      slotNote: "Illustration slot · 500 × 470",
      slotNoteMobile: "Illustration slot · 350 × 280",
      markAlt: "",
    },
  },

  /* --- 2. the breakdown --------------------------------------------------- */
  breakdown: {
    eyebrow: "The free breakdown · 45 minutes · no pitch",
    headlineLines: ["We sit down,", "we do the math,", "you keep the "],
    headlineHighlight: "one page",
    headlineTail: ".",
    lead: "Forty-five minutes on how work actually moves through your business. We size what it's costing you, then hand you the two things worth automating first — with the hours and dollars attached.",
    steps: [
      {
        n: "01",
        title: "We sit down with you",
        body: "One conversation. How a job gets from first call to paid, where it jams, who it lands on.",
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
      success: "Got it. Check your inbox — the booking link is in there.",
      errorGeneric: "That didn't send. Email hello@legroomcompany.com and we'll pick it up.",
      errorEmail: "That email address doesn't look right.",
      errorRate: "Too many tries. Give it a minute, then send again.",
    },
    receipt: {
      eyebrow: "Legroom breakdown",
      company: "Sample Co.",
      markAlt: "",
      rows: [
        { label: "Monthly visitors", value: "4,200" },
        { label: "Leads not answered in 5 min", value: "~68%" },
        { label: "Hours on manual intake / wk", value: "11.5" },
        { label: "Build #1 — instant lead reply", value: "2 wks" },
      ] as readonly ReceiptRow[],
      totalLabel: "Recovered / year",
      totalValue: "$61,400",
      footnote:
        "Every figure tagged: observed, benchmark, or modeled. Nothing printed we can't source.",
      caption: "The one page. Your numbers, ready to act on.",
    },
    get: {
      eyebrow: "What you'll get",
      items: [
        "The two automations worth building first, ranked",
        "What the manual version costs you today, in hours and dollars",
        "A build plan and a flat price — no obligation to use it",
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
    body: "Not a new agency riding a trend. Seven years of growth work, early on AI since the first models that could actually ship it, and results across four industries that had nothing in common except the same bottleneck.",
    facts: [
      { bold: "4 industries", rest: "" },
      { bold: "Early to AI", rest: " · since 2022" },
      { bold: "Founder-led", rest: " delivery" },
    ],
    workEyebrow: "Selected work",
    work: [
      {
        slug: "el1",
        logo: "el1",
        logoAlt: "EL1",
        logoStyle: "height:42px",
        ghostWidth: "168%",
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
        ghostWidth: "210%",
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
        ghostWidth: "150%",
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
        ghostWidth: "160%",
        result: "2.5×",
        qualifier: "subscribers in under three months",
        company: "Formidable",
        vertical: "Newsletter SaaS",
      },
    ] as readonly ClientResult[],
    footnote:
      "Four different industries. Same job every time: find the work that shouldn't be done by hand, and build the thing that does it.",
  },

  /* --- 4. the promise ----------------------------------------------------- */
  promise: {
    eyebrow: "The promise",
    headlineLines: ["You get the week back.", "We show you the receipt."],
    lead: "Every build ships with a before-and-after. Hours in, hours out, dollars attached. If the number isn't real, we don't print it.",
    cards: [
      {
        figure: "15+ HOURS",
        label: "BACK PER WEEK",
        body: "Per person, on the first process we automate. Quoting, intake, follow-up — whatever the breakdown finds first.",
        swept: true,
      },
      {
        figure: "$5,000+",
        label: "MONTHLY LABOR TARGETED",
        body: "The cost of the manual work the system takes over. We size it before we build, from your real volume.",
      },
      {
        figure: "SECONDS",
        label: "SPEED TO LEAD",
        body: "New lead answered in seconds instead of hours. It is the single change that moves close rate the most.",
      },
    ] as readonly PromiseCard[],
    footnoteBefore:
      "These are ranges from work we've done — not guarantees. Your breakdown replaces every one of them with ",
    footnoteUnderline: "your numbers",
    footnoteAfter: ", pulled from your site, your volume, your market.",
  },

  /* --- 5. wordmark break -------------------------------------------------- */
  wordmark: {
    ticker: ["Save time", "Make more money", "Prove it with numbers", "Keep improving it"],
    lockupAlt: "Legroom",
    tagline: "We do your legwork.",
    sub: "The Legroom Company · Washington · Built for youth sports and home services",
  },

  /* --- 6. CTA + founders -------------------------------------------------- */
  cta: {
    eyebrow: "Last thing",
    headlineLines: ["Two spots.", "Take one."],
    lead: "We take two new builds a month so the work stays good. Start with the free breakdown — if the numbers aren't worth your time, you've lost nothing but forty-five minutes.",
    qa: [
      {
        key: "Cost",
        value: "The breakdown is free. Builds are quoted flat, before any work starts.",
      },
      { key: "Time", value: "45 minutes to sit down. First build usually live in 2–4 weeks." },
      {
        key: "After",
        value: "Monthly partnership if you want it. Not required, never auto-renewed.",
      },
      {
        key: "Fit",
        value: "Youth sports and home services. If we're not right for you, we'll say so.",
      },
    ] as readonly QARow[],
    ctaPrimary: "Book a free breakdown",
    ctaSecondary: "Send us a note",
    chip: "2 spots open · September",
  },

  founders: {
    /** Sits above the name on every card. */
    cardEyebrow: "Who you'll sit down with",
    cardOrg: "The Legroom Company",
    /** Accessible name for the scrollable deck region. */
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
        role: "Founder. Growth, and the systems underneath it.",
        school: "[School]",
        socials: [
          { label: "LinkedIn", href: "#" },
          { label: "Instagram", href: "#" },
        ],
        stats: [
          { label: "In the game since", value: "2019" },
          { label: "Best number on the board", value: "10× ROAS" },
          { label: "Home field", value: "Youth baseball & softball" },
        ],
        bio: "Seven years of growth marketing, most of it inside youth sports. Ran acquisition for EL1 to 10× ROAS, built and shipped for Monet.ai, ABT and bBow. Started building with AI the moment it could actually do the work — not when it got a logo.",
        quote:
          "Every owner I talk to is doing four jobs. I want to hand two of them back.",
      },
      {
        index: "02 / 02",
        photo: "/photos/sean-photo.jpg",
        photoAlt: "Sean, partner on delivery at Legroom",
        firstName: "Sean",
        lastName: "[Last name]",
        role: "Partner on delivery. Build and reliability.",
        school: "[School]",
        socials: [
          { label: "LinkedIn", href: "#" },
          { label: "Instagram", href: "#" },
        ],
        stats: [
          { label: "In the game since", value: "[Year]" },
          { label: "Best number on the board", value: "[Stat]" },
          { label: "Home field", value: "[Focus]" },
        ],
        bio: "[Bio to confirm.] Builds the systems that have to keep running after we leave — integrations, data, the unglamorous parts. If it breaks at 6am on a Saturday, he's the reason it doesn't.",
        quote: "[Pull quote to confirm — one line, in his own words.]",
      },
    ] as readonly Founder[],
  },

  /* --- footer -------------------------------------------------------------- */
  footer: {
    logoAlt: "Legroom",
    email: "hello@legroomcompany.com",
    links: [
      { label: "LinkedIn", href: "#" },
      { label: "Instagram", href: "#" },
    ] as readonly NavLink[],
    copyright: "© 2026 The Legroom Company LLC",
  },

  /* --- contact page / no-JS fallback --------------------------------------- */
  contact: {
    eyebrow: "Send us a note",
    headline: "Tell us what's eating the week.",
    lead: "One email back from a real person. If a breakdown makes sense we'll send a booking link with it.",
    nameLabel: "Your name",
    namePlaceholder: "Jane Rivera",
    emailLabel: "Your email",
    emailPlaceholder: "you@yourcompany.com",
    messageLabel: "What's going on",
    messagePlaceholder: "The part of the week that keeps disappearing.",
    submit: "Send it",
    back: "Back to the top",
  },

  thanks: {
    eyebrow: "Got it",
    headline: "That's in.",
    lead: "One of us reads every note. You'll hear back from a real person, usually same day.",
    bookLine: "Want to skip the back-and-forth? Grab the 45 minutes now.",
    cta: "Book a free breakdown",
    back: "Back to the site",
  },
} as const;

/**
 * Still waiting on JD. Every one of these renders literally as written, in
 * brackets, so it is obvious on the page that it is unfinished. Do not
 * substitute plausible-looking content.
 *
 *  1. [School]      — both founder cards
 *  2. [Last name]   — Sean's surname
 *  3. [Year]        — Sean, "In the game since"
 *  4. [Stat]        — Sean, "Best number on the board"
 *  5. [Focus]       — Sean, "Home field"
 *  6. [Bio to confirm.]        — Sean's bio, first sentence
 *  7. [Pull quote to confirm]  — Sean's quote
 *  8. Founder + footer social hrefs are "#" until the real profile URLs exist.
 *  9. The hero illustration slot is an empty measured-drawing panel; JD is
 *     supplying a figure illustration later.
 */
export const PLACEHOLDERS = [
  "[School] on both founder cards",
  "Sean's last name",
  "Sean's year, stat, focus",
  "Sean's bio and pull quote",
  "Social profile URLs (founder cards + footer)",
  "Hero illustration artwork",
] as const;

export type Site = typeof site;
