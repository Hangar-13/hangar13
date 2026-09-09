export type TextBullet = {
  title: string;
  body: string;
};

export type CodeCard = {
  code: string;
  title: string;
  body: string;
};

export type PricingPlan = {
  code: string;
  name: string;
  plainName: string;
  audienceLine: string;
  recommended: boolean;
  recommendedLabel: string;
  tagline: string;
  price: string;
  period: string;
  features: string[];
  cta: string;
  ctaHref: string;
};

export type ComparisonRow = {
  capability: string;
  groundCrew: boolean;
  flightEngineer: boolean;
  fleetCommander: boolean;
};

export type FieldNote = {
  quote: string;
  attribution: string;
  logId: string;
};

export type LandingContent = {
  brand: {
    namePrefix: string;
    nameAccent: string;
  };
  nav: {
    solutionsLabel: string;
    mechanicLinkLabel: string;
    operatorLinkLabel: string;
    courseworkLabel: string;
    mentorshipLabel: string;
    pricingLabel: string;
    fieldNotesLabel: string;
    ctaLabel: string;
    operatorCtaLabel: string;
  };
  hero: {
    eyebrow: string;
    headlineLine1: string;
    headlineLine2: string;
    headlineAccent: string;
    body: string;
    mechanicChoiceLabel: string;
    operatorChoiceLabel: string;
    choiceHeadline: string;
    choiceHint: string;
    mechanicLead: string;
    operatorLead: string;
    mechanicCta: string;
    mechanicCtaHref: string;
    operatorCta: string;
    operatorCtaHref: string;
    primaryCta: string;
    secondaryCta: string;
    mockKicker: string;
    mockStatus: string;
    mockTitle: string;
    mockSigned: string;
  };
  proof: {
    kicker: string;
    headline: string;
    mechanicCaption: string;
    operatorCaption: string;
  };
  value: {
    kicker: string;
    mechanicHeadline: string;
    operatorHeadline: string;
    mechanicItems: TextBullet[];
    operatorItems: TextBullet[];
  };
  proofPoints: {
    kicker: string;
    headline: string;
    points: TextBullet[];
  };
  details: {
    courseworkLabel: string;
    mentorshipLabel: string;
    compareLabel: string;
    quotesLabel: string;
  };
  solutions: {
    kicker: string;
    headline: string;
    body: string;
    mechanicAudience: string;
    mechanicProduct: string;
    mechanicHeadline: string;
    mechanicBody: string;
    mechanicCta: string;
    mechanicBullets: TextBullet[];
    operatorAudience: string;
    operatorProduct: string;
    operatorHeadline: string;
    operatorBody: string;
    operatorCta: string;
    operatorBullets: TextBullet[];
  };
  coursework: {
    kicker: string;
    headline: string;
    body: string;
    featuredKicker: string;
    featuredTitle: string;
    featuredBody: string;
    tracks: CodeCard[];
    extras: CodeCard[];
  };
  mentorship: {
    kicker: string;
    headline: string;
    body: string;
    cta: string;
    ctaHref: string;
    points: TextBullet[];
  };
  pricing: {
    kicker: string;
    headline: string;
    individualLabel: string;
    operatorLabel: string;
    footnote: string;
    individualPlans: PricingPlan[];
    operatorPlans: PricingPlan[];
    comparisonKicker: string;
    comparisonHeadline: string;
    comparisonCol1: string;
    comparisonCol2: string;
    comparisonCol3: string;
    comparisonRows: ComparisonRow[];
  };
  fieldNotes: {
    kicker: string;
    headline: string;
    notes: FieldNote[];
  };
  footer: {
    headline: string;
    headlineAccent: string;
    cta: string;
    ctaHref: string;
    copyright: string;
    systemStatus: string;
    privacyLabel: string;
    privacyHref: string;
    termsLabel: string;
    termsHref: string;
    topLabel: string;
  };
};

export const DEFAULT_LANDING_CONTENT: LandingContent = {
  brand: {
    namePrefix: "HANGAR",
    nameAccent: "13",
  },
  nav: {
    solutionsLabel: "Solutions",
    mechanicLinkLabel: "For the mechanic",
    operatorLinkLabel: "For the operator",
    courseworkLabel: "Coursework",
    mentorshipLabel: "Mentorship",
    pricingLabel: "Pricing",
    fieldNotesLabel: "Field notes",
    ctaLabel: "Start your logbook — free",
    operatorCtaLabel: "See operator plans",
  },
  hero: {
    eyebrow: "Aviation training, built right",
    headlineLine1: "Log.",
    headlineLine2: "Learn.",
    headlineAccent: "Certify.",
    body: "The training command center built for aviation maintenance. Track on-the-job training, issue FAA-aligned coursework, and prove proficiency — without chasing paper.",
    mechanicChoiceLabel: "For mechanics",
    operatorChoiceLabel: "For operators",
    choiceHeadline: "Choose your path.",
    choiceHint: "Nothing is selected yet. Pick one and the page will show the product, plans, and next step for you.",
    mechanicLead:
      "A portable OJT record that travels with you. Start free, then add coursework when you need it.",
    operatorLead:
      "Bring mentors, training managers, and apprentices into one record — assign work, review it, and stay audit-ready.",
    mechanicCta: "Start your logbook — free",
    mechanicCtaHref: "/auth/signup",
    operatorCta: "See operator plans",
    operatorCtaHref: "#pricing",
    primaryCta: "I'm a mechanic",
    secondaryCta: "I run a shop",
    mockKicker: "OJT entry",
    mockStatus: "Validated",
    mockTitle: "Turbine blade inspection",
    mockSigned: "Supervisor signed",
  },
  proof: {
    kicker: "The product",
    headline: "Your record, signed and searchable.",
    mechanicCaption:
      "This is the logbook in Hangar13 — hours, ATA chapters, ACS codes, and a supervisor signature on the same row.",
    operatorCaption:
      "The same logbook your apprentices keep. Mentors approve or reject from this record; nothing lives in a side spreadsheet.",
  },
  value: {
    kicker: "What you get",
    mechanicHeadline: "A record that follows you.",
    operatorHeadline: "Oversight in one place.",
    mechanicItems: [
      {
        title: "Portable OJT logbook",
        body: "Log work, attach evidence, and collect supervisor sign-offs — then take the record with you.",
      },
      {
        title: "FAA-aligned coursework",
        body: "Add A&P, IA, or recurrent training when you need it. No annual lock-in.",
      },
      {
        title: "Mentored OJT",
        body: "If you join a shop program, weekly deliverables and reviews happen in the same system.",
      },
    ],
    operatorItems: [
      {
        title: "Roles that fit the floor",
        body: "Mentors, training managers, and admins each see the right work and the right controls.",
      },
      {
        title: "Assign and track coursework",
        body: "Public courses or proprietary shop training — assigned to people, visible in one org record.",
      },
      {
        title: "Mentorship without the binder",
        body: "Monday deliverables go out automatically. Mentors approve or reject; the record updates itself.",
      },
    ],
  },
  proofPoints: {
    kicker: "Why it holds up",
    headline: "Built for the audit, not the binder.",
    points: [
      {
        title: "Supervisor digital sign-off",
        body: "See who performed the task, who verified it, and when — without chasing paper.",
      },
      {
        title: "Mapped to FAA ACS codes",
        body: "Entries and coursework tie back to AMT standards, so remaining work is obvious.",
      },
      {
        title: "Export your history",
        body: "Take a training history with you across stations and employers.",
      },
    ],
  },
  details: {
    courseworkLabel: "See the 130-week coursework breakdown",
    mentorshipLabel: "Mentorship and Attain, LLC",
    compareLabel: "Compare plans",
    quotesLabel: "From the floor",
  },
  solutions: {
    kicker: "Solutions",
    headline: "Two tracks.\nOne system.",
    body: "Whether you're earning your first license or running a maintenance organization, Hangar13 meets you where you are — a personal logbook that travels with you, and an operator workspace that brings oversight and mentorship together.",
    mechanicAudience: "For the mechanic",
    mechanicProduct: "Product // The logbook",
    mechanicHeadline: "Your record, portable.",
    mechanicBody:
      "A clean, portable OJT record that travels with you across stations and employers. Start free, then add what you need as you grow.",
    mechanicCta: "Start your logbook",
    mechanicBullets: [
      {
        title: "In-app training, on your terms.",
        body: "Purchase additional training or an OJT route as you need it — no commitment, just the next step.",
      },
      {
        title: "A&P school, 130 weeks.",
        body: "The full Airframe & Powerplant curriculum broken into 130 weeks based on FAA AMT standards and ACS codes.",
      },
      {
        title: "IA course, and more to come.",
        body: "An Inspection Authorization course and new programs rolling out continuously.",
      },
    ],
    operatorAudience: "For the operator",
    operatorProduct: "Product // Operator access",
    operatorHeadline: "Oversight, in one place.",
    operatorBody:
      "Bring mentors, training managers, and admins together under one organization. Plug any individual user into your org for oversight, assign coursework, and mentor apprentices through their OJT.",
    operatorCta: "See the mentorship program",
    operatorBullets: [
      {
        title: "Roles that fit your team.",
        body: "Mentors, training managers, and admins — each with the right view and the right controls.",
      },
      {
        title: "Plug individuals into your org.",
        body: "Add any user to your organization to assign courses, track progress, and keep oversight in one record.",
      },
      {
        title: "Mentor through the OJT.",
        body: "Guide apprentices through their on-the-job training with structured deliverables and weekly review.",
      },
    ],
  },
  coursework: {
    kicker: "Coursework",
    headline: "From instruction\nto authorization.",
    body: "Coursework built on FAA standards — structured, trackable, and available to individuals and organizations alike.",
    featuredKicker: "A&P school // 130 weeks",
    featuredTitle: "Airframe, General & Powerplant",
    featuredBody:
      "Structured into 130 weeks based on FAA AMT standards and ACS codes, IAW 14 CFR 66.77(b). Take all three together, or split the 130 weeks to pursue a single license.",
    tracks: [
      {
        code: "A & G",
        title: "Airframe + General",
        body: "The Airframe and General portions of the 130-week program, for mechanics pursuing the Airframe license.",
      },
      {
        code: "P & G",
        title: "Powerplant + General",
        body: "The Powerplant and General portions, for mechanics pursuing the Powerplant license.",
      },
      {
        code: "A&P + G",
        title: "Airframe & Powerplant + General",
        body: "The full 130 weeks — Airframe, Powerplant, and General together for the complete A&P.",
      },
    ],
    extras: [
      {
        code: "IA",
        title: "Inspection Authorization",
        body: "Built on FAA guidance — not just to make you test-ready like the other books, but to equip you with the knowledge and resources to be a great IA.",
      },
      {
        code: "Recurrent",
        title: "FAA recurrent",
        body: "Standard recurrent topics we all complete — human factors and more — kept current and ready to assign.",
      },
      {
        code: "Proprietary",
        title: "Org-only training",
        body: "Proprietary training built for your organization — visible only inside your library, never public.",
      },
      {
        code: "Access",
        title: "Public or private",
        body: "Every course is either public — anyone can purchase and access it — or proprietary, available only to students within your organization.",
      },
    ],
  },
  mentorship: {
    kicker: "Mentorship",
    headline: "In partnership\nwith Attain, LLC.",
    body: "Attain ensures all SOPs and documents are in place for regulatory purposes — FAA and beyond. Hangar13 powers the mentorship program itself, so the paperwork stays handled and the mentorship stays hands-on.",
    cta: "Talk to us about mentorship",
    ctaHref: "mailto:sales@hangar13.app",
    points: [
      {
        title: "Regulatory foundation",
        body: "Attain, LLC puts every SOP and supporting document in place for regulatory compliance — so your program is defensible from day one.",
      },
      {
        title: "Monday deliverables",
        body: "Each week, structured deliverables go out to apprentices automatically — no manual setup, no chasing tasks.",
      },
      {
        title: "Approve or reject",
        body: "At the end of the week, mentors review each apprentice's submissions and simply approve or reject them — the record updates itself.",
      },
      {
        title: "Less paperwork, more mentorship",
        body: "With compliance handled and deliverables automated, mentors spend their time mentoring — not administrating.",
      },
    ],
  },
  pricing: {
    kicker: "Pricing",
    headline: "Select your\nflight plan.",
    individualLabel: "Individual",
    operatorLabel: "Operator",
    footnote:
      "USD pricing · Cancel anytime · Operator plans scale with active learners",
    individualPlans: [
      {
        code: "IND-01",
        name: "Ground Crew",
        plainName: "Free logbook",
        audienceLine: "For mechanics starting a portable OJT record",
        recommended: false,
        recommendedLabel: "Recommended",
        tagline: "Start a clean, portable OJT record.",
        price: "$0",
        period: "/ forever",
        features: [
          "Personal OJT logbook",
          "Evidence attachments",
          "Supervisor sign-offs",
          "Training history export",
        ],
        cta: "Start your logbook — free",
        ctaHref: "/auth/signup",
      },
      {
        code: "IND-02",
        name: "Flight Engineer",
        plainName: "Pro — coursework",
        audienceLine: "For mechanics adding A&P and IA training",
        recommended: true,
        recommendedLabel: "Recommended",
        tagline: "Advance qualifications and stay current.",
        price: "$19",
        period: "/ month",
        features: [
          "Everything in Ground Crew",
          "A&P and IA coursework",
          "Assessments and certificates",
          "Renewal reminders",
        ],
        cta: "Continue with Pro",
        ctaHref: "/auth/signup",
      },
      {
        code: "IND-03",
        name: "Fleet Commander",
        plainName: "Team",
        audienceLine: "For instructors and independent trainers",
        recommended: false,
        recommendedLabel: "Recommended",
        tagline: "For instructors and independent trainers.",
        price: "$49",
        period: "/ month",
        features: [
          "Everything in Flight Engineer",
          "Up to 10 learners",
          "Custom training paths",
          "Progress reporting",
        ],
        cta: "Talk to us about a team",
        ctaHref: "/auth/signup",
      },
    ],
    operatorPlans: [
      {
        code: "OPS-01",
        name: "Ground Crew",
        plainName: "Shop",
        audienceLine: "For a small maintenance team",
        recommended: false,
        recommendedLabel: "Recommended",
        tagline: "A focused system for a small maintenance team.",
        price: "$99",
        period: "/ month",
        features: [
          "Up to 15 active learners",
          "OJT task libraries",
          "Digital approvals",
          "Core compliance reports",
        ],
        cta: "Talk to us",
        ctaHref: "mailto:sales@hangar13.app",
      },
      {
        code: "OPS-02",
        name: "Flight Engineer",
        plainName: "Operations",
        audienceLine: "For growing maintenance operations",
        recommended: true,
        recommendedLabel: "Recommended",
        tagline: "Full training command for growing operations.",
        price: "$249",
        period: "/ month",
        features: [
          "Up to 75 active learners",
          "FAA-aligned coursework",
          "Custom roles and pathways",
          "Advanced reporting",
        ],
        cta: "Talk to us",
        ctaHref: "mailto:sales@hangar13.app",
      },
      {
        code: "OPS-03",
        name: "Fleet Commander",
        plainName: "Enterprise",
        audienceLine: "Across stations and fleets",
        recommended: false,
        recommendedLabel: "Recommended",
        tagline: "Enterprise control across stations and fleets.",
        price: "Custom",
        period: "",
        features: [
          "Unlimited scale options",
          "Multi-station oversight",
          "Implementation support",
          "Custom reporting",
        ],
        cta: "Talk to us",
        ctaHref: "mailto:sales@hangar13.app",
      },
    ],
    comparisonKicker: "Capability check",
    comparisonHeadline: "Compare systems",
    comparisonCol1: "Ground Crew",
    comparisonCol2: "Flight Engineer",
    comparisonCol3: "Fleet Commander",
    comparisonRows: [
      { capability: "Verified OJT logbook", groundCrew: true, flightEngineer: true, fleetCommander: true },
      { capability: "Supervisor digital sign-off", groundCrew: true, flightEngineer: true, fleetCommander: true },
      { capability: "FAA-aligned coursework", groundCrew: false, flightEngineer: true, fleetCommander: true },
      { capability: "Custom learning pathways", groundCrew: false, flightEngineer: true, fleetCommander: true },
      { capability: "Multi-station reporting", groundCrew: false, flightEngineer: false, fleetCommander: true },
      { capability: "Implementation support", groundCrew: false, flightEngineer: false, fleetCommander: true },
    ],
  },
  fieldNotes: {
    kicker: "Field notes",
    headline: "Signed by\nthe floor.",
    notes: [
      {
        quote:
          "Hangar13 gives our technicians a clear line from assigned work to demonstrated proficiency. Reviews that used to take hours are now part of the job flow.",
        attribution: "M. Rivera // A&P Lead // Part 145 repair station",
        logId: "LOG-0481 // Verified entry",
      },
      {
        quote:
          "The digital sign-off trail makes it easy to see who performed the task, who verified it, and which requirement it satisfies.",
        attribution: "D. Chen // IA // Director of Maintenance",
        logId: "LOG-0527 // Verified entry",
      },
      {
        quote:
          "Our apprentices know exactly what remains, while supervisors finally have one reliable record instead of binders and spreadsheets.",
        attribution: "S. Bennett // Training Manager // MRO operations",
        logId: "LOG-0613 // Verified entry",
      },
    ],
  },
  footer: {
    headline: "Build proficiency.",
    headlineAccent: "Prove it.",
    cta: "Contact Hangar13",
    ctaHref: "mailto:sales@hangar13.app",
    copyright: "© 2026 Hangar13 // Training systems",
    systemStatus: "System available",
    privacyLabel: "Privacy",
    privacyHref: "mailto:privacy@hangar13.app",
    termsLabel: "Terms",
    termsHref: "mailto:legal@hangar13.app",
    topLabel: "Top ↑",
  },
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function deepMerge<T>(base: T, override: unknown): T {
  if (override === undefined) return base;
  if (Array.isArray(base)) {
    if (!Array.isArray(override)) return base;
    const template = base[0];
    if (isPlainObject(template)) {
      return override.map((item, index) => {
        const itemBase = (base[index] ?? template) as Record<string, unknown>;
        return isPlainObject(item) ? deepMerge(itemBase, item) : item;
      }) as T;
    }
    return override as T;
  }
  if (!isPlainObject(base) || !isPlainObject(override)) {
    return override as T;
  }
  const next: Record<string, unknown> = { ...base };
  for (const key of Object.keys(base as object)) {
    if (key in override) {
      next[key] = deepMerge(
        (base as Record<string, unknown>)[key],
        override[key]
      );
    }
  }
  return next as T;
}

export function parseLandingContent(raw: unknown): LandingContent {
  const content = deepMerge(DEFAULT_LANDING_CONTENT, raw);
  content.solutions.kicker = content.solutions.kicker.replace(/^\d{2}\s*\/\/\s*/, "").trim();
  content.coursework.kicker = content.coursework.kicker.replace(/^\d{2}\s*\/\/\s*/, "").trim();
  content.mentorship.kicker = content.mentorship.kicker.replace(/^\d{2}\s*\/\/\s*/, "").trim();
  content.pricing.kicker = content.pricing.kicker.replace(/^\d{2}\s*\/\/\s*/, "").trim();
  content.fieldNotes.kicker = content.fieldNotes.kicker.replace(/^\d{2}\s*\/\/\s*/, "").trim();
  return content;
}

export function cloneLandingContent(content: LandingContent): LandingContent {
  return structuredClone(content);
}
