"use client";

import { useState, type ComponentType, type ReactNode, type SVGProps } from "react";
import Link from "next/link";
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Award,
  BookOpen,
  BookOpenCheck,
  Building2,
  CalendarCheck,
  Check,
  ChevronDown,
  CircleCheck,
  CircleX,
  ClipboardCheck,
  FileCheck2,
  Lock,
  Menu,
  Minus,
  PenLine,
  Radio,
  ShieldCheck,
  ShoppingBag,
  Users,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { LandingContent, PricingPlan, TextBullet } from "@/lib/marketing/landing-content";

type Icon = ComponentType<SVGProps<SVGSVGElement>>;

const MECHANIC_BULLET_ICONS: Icon[] = [ShoppingBag, BookOpen, ShieldCheck];
const OPERATOR_BULLET_ICONS: Icon[] = [Users, BookOpen, ShieldCheck];
const EXTRA_ICONS: Icon[] = [Award, ClipboardCheck, Lock, Users];
const MENTOR_ICONS: { icon: Icon; className: string }[] = [
  { icon: FileCheck2, className: "text-[#FF4D00]" },
  { icon: CalendarCheck, className: "text-[#FF4D00]" },
  { icon: CircleCheck, className: "text-emerald-400" },
  { icon: CircleX, className: "text-[#0055FF]" },
];

function TitleLines({ text }: { text: string }) {
  return <span className="whitespace-pre-line">{text}</span>;
}

function MarketingLink({
  href,
  className,
  children,
}: {
  href: string;
  className?: string;
  children: ReactNode;
}) {
  const external = href.startsWith("http") || href.startsWith("mailto:");
  if (external) {
    return (
      <a href={href} className={className}>
        {children}
      </a>
    );
  }
  return (
    <Link href={href} className={className}>
      {children}
    </Link>
  );
}

function BulletList({
  items,
  icons,
}: {
  items: TextBullet[];
  icons: Icon[];
}) {
  return (
    <ul className="mt-10 space-y-5">
      {items.map((bullet, index) => {
        const Icon = icons[index] ?? ShieldCheck;
        return (
          <li key={`${bullet.title}-${index}`} className="flex gap-4">
            <Icon className="mt-1 h-5 w-5 shrink-0 text-[#FF4D00]" aria-hidden />
            <div>
              <b>{bullet.title}</b>
              <p className="text-base text-[#515860]">{bullet.body}</p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function PlanCard({ plan, featured }: { plan: PricingPlan; featured: boolean }) {
  return (
    <article
      className={cn(
        "relative flex min-h-[520px] flex-col border p-6 lg:p-8",
        featured
          ? "border-[#FF4D00] bg-[#121417] text-white shadow-[8px_8px_0_#FF4D00]"
          : "border-[#121417]/20 bg-white"
      )}
    >
      <div className="flex justify-between font-mono text-[10px] uppercase tracking-widest">
        <span>{plan.code}</span>
        {plan.recommended ? (
          <span className="text-[#FF4D00]">{plan.recommendedLabel}</span>
        ) : null}
      </div>
      <h3 className="mt-12 text-3xl font-black uppercase tracking-tight">{plan.name}</h3>
      <p
        className={cn(
          "mt-3 min-h-14 text-base leading-6",
          featured ? "text-white/65" : "text-[#515860]"
        )}
      >
        {plan.tagline}
      </p>
      <div className="my-8 border-y border-current/20 py-6">
        <span className="text-4xl font-black">{plan.price}</span>
        {plan.period ? (
          <span className="font-mono text-xs uppercase opacity-60">{plan.period}</span>
        ) : null}
      </div>
      <ul className="space-y-4">
        {plan.features.map((feature) => (
          <li key={feature} className="flex gap-3 text-sm">
            <Check
              className={cn(
                "h-4 w-4 shrink-0",
                featured ? "text-[#FF4D00]" : "text-[#0055FF]"
              )}
              aria-hidden
            />
            {feature}
          </li>
        ))}
      </ul>
      <MarketingLink
        href={plan.ctaHref}
        className={cn(
          "mt-auto flex items-center justify-between px-5 py-4 font-mono text-xs font-bold uppercase tracking-wider",
          featured ? "bg-[#FF4D00] text-white" : "bg-[#F4F7F9] text-[#121417]"
        )}
      >
        {plan.cta}
        <ArrowUpRight className="h-4 w-4" aria-hidden />
      </MarketingLink>
    </article>
  );
}

function FooterHeadline({ headline, accent }: { headline: string; accent: string }) {
  const trimmedAccent = accent.trim();
  const trimmedHeadline = headline.trim();
  const base =
    trimmedAccent && trimmedHeadline.toLowerCase().endsWith(trimmedAccent.toLowerCase())
      ? trimmedHeadline.slice(0, -trimmedAccent.length).trim().replace(/[.]+$/, ".")
      : trimmedHeadline;

  return (
    <>
      <TitleLines text={base} />
      {trimmedAccent ? (
        <>
          <br />
          <span className="text-[#FF4D00]">{trimmedAccent}</span>
        </>
      ) : null}
    </>
  );
}

export function LandingPage({
  content,
  preview = false,
}: {
  content: LandingContent;
  preview?: boolean;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [solutionsOpen, setSolutionsOpen] = useState(false);
  const [audience, setAudience] = useState<"individual" | "operator">("individual");
  const plans =
    audience === "individual"
      ? content.pricing.individualPlans
      : content.pricing.operatorPlans;

  const navLinks = [
    { href: "#coursework", label: content.nav.courseworkLabel },
    { href: "#mentor", label: content.nav.mentorshipLabel },
    { href: "#pricing", label: content.nav.pricingLabel },
    { href: "#field-notes", label: content.nav.fieldNotesLabel },
  ];

  return (
    <div className="marketing-page min-h-screen bg-[#F4F7F9] text-[#121417]">
      {preview ? (
        <div className="sticky top-0 z-[60] flex items-center justify-between gap-3 bg-[#121417] px-4 py-2 text-xs text-white sm:px-6">
          <p>Preview of the public landing page. Visitors see this without signing in.</p>
          <Link
            href="/dashboard/god/landing"
            className="shrink-0 font-mono uppercase tracking-wider text-[#FF4D00] underline-offset-4 hover:underline"
          >
            Back to editor
          </Link>
        </div>
      ) : null}

      <header className="fixed inset-x-0 top-0 z-50 border-b border-[#121417]/15 bg-[#F4F7F9]/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-[1440px] items-center justify-between px-5 lg:px-8">
          <a href="#top" className="font-mono text-lg font-black tracking-[-.06em]">
            {content.brand.namePrefix}
            <span className="text-[#FF4D00]">{content.brand.nameAccent}</span>
          </a>

          <nav className="hidden items-center gap-7 font-mono text-[11px] uppercase tracking-[.14em] md:flex">
            <div className="relative">
              <button
                type="button"
                className="flex items-center gap-1 hover:text-[#0055FF]"
                onClick={() => setSolutionsOpen((open) => !open)}
                aria-expanded={solutionsOpen}
              >
                {content.nav.solutionsLabel}
                <ChevronDown className="h-3.5 w-3.5" aria-hidden />
              </button>
              {solutionsOpen ? (
                <div className="absolute left-0 top-full z-20 mt-3 min-w-[14rem] border border-[#121417]/15 bg-white py-2 shadow-lg">
                  <a
                    href="#solutions-mechanic"
                    className="block px-4 py-2 hover:bg-[#F4F7F9] hover:text-[#0055FF]"
                    onClick={() => setSolutionsOpen(false)}
                  >
                    {content.nav.mechanicLinkLabel}
                  </a>
                  <a
                    href="#solutions-operator"
                    className="block px-4 py-2 hover:bg-[#F4F7F9] hover:text-[#0055FF]"
                    onClick={() => setSolutionsOpen(false)}
                  >
                    {content.nav.operatorLinkLabel}
                  </a>
                </div>
              ) : null}
            </div>
            {navLinks.map((link) => (
              <a key={link.href} href={link.href} className="hover:text-[#0055FF]">
                {link.label}
              </a>
            ))}
            <Link href="/auth/login" className="hover:text-[#0055FF]">
              Sign in
            </Link>
          </nav>

          <div className="flex items-center gap-3">
            <a
              href="#pricing"
              className="bg-[#FF4D00] px-4 py-2.5 font-mono text-xs font-bold uppercase tracking-wider text-white transition hover:-translate-y-0.5 hover:shadow-[0_0_0_3px_rgba(255,77,0,.16)]"
            >
              {content.nav.ctaLabel}
            </a>
            <button
              type="button"
              className="md:hidden"
              aria-label={mobileOpen ? "Close menu" : "Open menu"}
              onClick={() => setMobileOpen((open) => !open)}
            >
              {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>
        {mobileOpen ? (
          <div className="border-t border-[#121417]/15 bg-[#F4F7F9] px-5 py-4 md:hidden">
            <div className="flex flex-col gap-3 font-mono text-[11px] uppercase tracking-[.14em]">
              <a href="#solutions-mechanic" onClick={() => setMobileOpen(false)}>
                {content.nav.mechanicLinkLabel}
              </a>
              <a href="#solutions-operator" onClick={() => setMobileOpen(false)}>
                {content.nav.operatorLinkLabel}
              </a>
              {navLinks.map((link) => (
                <a key={link.href} href={link.href} onClick={() => setMobileOpen(false)}>
                  {link.label}
                </a>
              ))}
              <Link href="/auth/login" onClick={() => setMobileOpen(false)}>
                Sign in
              </Link>
            </div>
          </div>
        ) : null}
      </header>

      <main>
        <section
          id="top"
          className="relative grid min-h-[860px] scroll-mt-16 border-b border-[#121417]/15 pt-16 lg:grid-cols-12"
        >
          <div className="relative z-10 flex flex-col justify-between px-5 py-16 lg:col-span-7 lg:px-12 lg:py-24">
            <div>
              <p className="mb-8 font-mono text-xs font-bold uppercase tracking-[.22em] text-[#0055FF]">
                {content.hero.eyebrow}
              </p>
              <h1 className="max-w-4xl text-[clamp(4.2rem,10vw,9.4rem)] font-black uppercase leading-[.82] tracking-[-.075em]">
                {content.hero.headlineLine1}
                <br />
                {content.hero.headlineLine2}
                <br />
                <span className="text-[#FF4D00]">{content.hero.headlineAccent}</span>
              </h1>
            </div>
            <div className="mt-16 max-w-xl border-l-2 border-[#FF4D00] pl-6">
              <p className="text-lg leading-8 text-[#30363D]">{content.hero.body}</p>
              <div className="mt-8 flex flex-wrap gap-3">
                <a
                  href="#solutions"
                  className="flex items-center gap-3 bg-[#121417] px-6 py-4 font-mono text-xs font-bold uppercase tracking-wider text-white"
                >
                  {content.hero.primaryCta}
                  <ArrowDownRight className="h-4 w-4" aria-hidden />
                </a>
                <a
                  href="#coursework"
                  className="border border-[#121417] px-6 py-4 font-mono text-xs font-bold uppercase tracking-wider"
                >
                  {content.hero.secondaryCta}
                </a>
              </div>
            </div>
          </div>
          <div className="relative min-h-[500px] overflow-hidden border-t border-[#121417]/15 lg:col-span-5 lg:border-l lg:border-t-0">
            <img
              src="/marketing/turbine-assembly.webp"
              alt="Precision jet turbine assembly under cold hangar lighting"
              className="absolute inset-0 h-full w-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#121417]/85 via-transparent to-transparent" />
            <div className="absolute bottom-8 left-6 right-6 border border-white/35 bg-[#121417]/85 p-5 text-white backdrop-blur">
              <div className="mb-5 flex justify-between font-mono text-[10px] uppercase tracking-widest text-white/60">
                <span>{content.hero.mockKicker}</span>
                <span className="text-emerald-400">{content.hero.mockStatus}</span>
              </div>
              <p className="text-lg font-bold">{content.hero.mockTitle}</p>
              <div className="mt-4 h-1 bg-white/20">
                <div className="h-full w-full bg-[#0055FF]" />
              </div>
              <div className="mt-4 flex justify-between font-mono text-[10px] uppercase">
                <span className="flex gap-2">
                  <CircleCheck className="h-3.5 w-3.5 text-emerald-400" aria-hidden />
                  {content.hero.mockSigned}
                </span>
                <ShieldCheck className="h-5 w-5 text-[#FF4D00]" aria-hidden />
              </div>
            </div>
          </div>
        </section>

        <section id="solutions" className="scroll-mt-16 border-b border-[#121417]/15">
          <div className="px-5 py-16 lg:px-12 lg:py-24">
            <p className="section-label">{content.solutions.kicker}</p>
            <div className="grid gap-8 lg:grid-cols-2 lg:items-end">
              <h2 className="section-title">
                <TitleLines text={content.solutions.headline} />
              </h2>
              <p className="section-copy">{content.solutions.body}</p>
            </div>
          </div>

          <div
            id="solutions-mechanic"
            className="grid scroll-mt-16 border-t border-[#121417]/15 lg:grid-cols-12"
          >
            <div className="relative min-h-[360px] border-b border-[#121417]/15 lg:col-span-5 lg:border-b-0 lg:border-r">
              <img
                src="/marketing/maintenance-workbench.webp"
                alt="Organized aviation maintenance workbench"
                className="absolute inset-0 h-full w-full object-cover"
              />
              <div className="absolute left-5 top-5 border border-white/50 bg-[#121417]/80 px-3 py-2 font-mono text-[10px] uppercase tracking-widest text-white">
                {content.solutions.mechanicAudience}
              </div>
            </div>
            <div className="px-5 py-14 lg:col-span-7 lg:px-12 lg:py-16">
              <div className="flex items-center gap-3">
                <BookOpen className="h-6 w-6 text-[#0055FF]" aria-hidden />
                <span className="font-mono text-xs uppercase tracking-widest text-[#0055FF]">
                  {content.solutions.mechanicProduct}
                </span>
              </div>
              <h3 className="mt-6 text-4xl font-black uppercase tracking-tight lg:text-5xl">
                {content.solutions.mechanicHeadline}
              </h3>
              <p className="mt-5 max-w-xl text-lg leading-8 text-[#30363D]">
                {content.solutions.mechanicBody}
              </p>
              <BulletList items={content.solutions.mechanicBullets} icons={MECHANIC_BULLET_ICONS} />
              <a
                href="#pricing"
                className="mt-10 inline-flex items-center gap-3 border-b-2 border-[#FF4D00] pb-1 font-mono text-xs font-bold uppercase tracking-wider"
              >
                {content.solutions.mechanicCta}
                <ArrowRight className="h-4 w-4" aria-hidden />
              </a>
            </div>
          </div>

          <div id="solutions-operator" className="grid scroll-mt-16 border-t border-[#121417]/15 bg-[#E9EDF0] lg:grid-cols-12">
            <div className="order-2 px-5 py-14 lg:order-1 lg:col-span-7 lg:px-12 lg:py-16">
              <div className="flex items-center gap-3">
                <Building2 className="h-6 w-6 text-[#0055FF]" aria-hidden />
                <span className="font-mono text-xs uppercase tracking-widest text-[#0055FF]">
                  {content.solutions.operatorProduct}
                </span>
              </div>
              <h3 className="mt-6 text-4xl font-black uppercase tracking-tight lg:text-5xl">
                {content.solutions.operatorHeadline}
              </h3>
              <p className="mt-5 max-w-xl text-lg leading-8 text-[#30363D]">
                {content.solutions.operatorBody}
              </p>
              <BulletList items={content.solutions.operatorBullets} icons={OPERATOR_BULLET_ICONS} />
              <a
                href="#mentor"
                className="mt-10 inline-flex items-center gap-3 border-b-2 border-[#FF4D00] pb-1 font-mono text-xs font-bold uppercase tracking-wider"
              >
                {content.solutions.operatorCta}
                <ArrowRight className="h-4 w-4" aria-hidden />
              </a>
            </div>
            <div className="relative order-1 min-h-[360px] border-b border-[#121417]/15 lg:order-2 lg:col-span-5 lg:border-b-0 lg:border-l">
              <img
                src="/marketing/turbine-assembly.webp"
                alt="Hangar turbine assembly representing operator oversight"
                className="absolute inset-0 h-full w-full object-cover"
              />
              <div className="absolute left-5 top-5 border border-white/50 bg-[#121417]/80 px-3 py-2 font-mono text-[10px] uppercase tracking-widest text-white">
                {content.solutions.operatorAudience}
              </div>
            </div>
          </div>
        </section>

        <section id="coursework" className="scroll-mt-16 px-5 py-20 lg:px-12 lg:py-28">
          <div className="mx-auto max-w-[1440px]">
            <p className="section-label">{content.coursework.kicker}</p>
            <div className="grid gap-8 lg:grid-cols-2 lg:items-end">
              <h2 className="section-title">
                <TitleLines text={content.coursework.headline} />
              </h2>
              <p className="section-copy">{content.coursework.body}</p>
            </div>

            <div className="mt-16 border-l border-t border-[#121417]/15">
              <div className="border-b border-r border-[#121417]/15 bg-[#121417] p-6 text-white">
                <div className="flex items-center gap-3">
                  <BookOpenCheck className="h-6 w-6 text-[#FF4D00]" aria-hidden />
                  <span className="font-mono text-xs uppercase tracking-widest text-white/60">
                    {content.coursework.featuredKicker}
                  </span>
                </div>
                <h3 className="mt-4 text-2xl font-black uppercase tracking-tight lg:text-3xl">
                  {content.coursework.featuredTitle}
                </h3>
                <p className="mt-3 max-w-2xl text-base leading-7 text-white/70">
                  {content.coursework.featuredBody}
                </p>
              </div>
              <div className="grid border-r border-[#121417]/15 md:grid-cols-3">
                {content.coursework.tracks.map((track) => (
                  <article
                    key={track.code}
                    className="border-b border-[#121417]/15 bg-white p-6 md:border-b-0 md:border-r md:last:border-r-0"
                  >
                    <span className="font-mono text-xs font-bold text-[#0055FF]">{track.code}</span>
                    <h4 className="mt-3 text-lg font-bold">{track.title}</h4>
                    <p className="mt-2 text-base leading-6 text-[#515860]">{track.body}</p>
                  </article>
                ))}
              </div>
            </div>

            <div className="mt-10 grid border-l border-t border-[#121417]/15 md:grid-cols-2 lg:grid-cols-4">
              {content.coursework.extras.map((extra, index) => {
                const Icon = EXTRA_ICONS[index] ?? Award;
                const last = index === content.coursework.extras.length - 1;
                return (
                  <article
                    key={extra.code}
                    className={cn(
                      "min-h-72 border-b border-r border-[#121417]/15 p-6",
                      last ? "bg-[#E9EDF0]" : "bg-white"
                    )}
                  >
                    <span className="font-mono text-xs text-[#FF4D00]">{extra.code}</span>
                    <Icon className="mt-10 h-8 w-8 text-[#0055FF]" aria-hidden />
                    <h3 className="mt-6 text-xl font-bold">{extra.title}</h3>
                    <p className="mt-3 text-base leading-7 text-[#515860]">{extra.body}</p>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        <section
          id="mentor"
          className="scroll-mt-16 border-t border-[#121417]/15 bg-[#121417] px-5 py-20 text-white lg:px-12 lg:py-28"
        >
          <div className="mx-auto max-w-[1440px]">
            <div className="grid gap-8 lg:grid-cols-2 lg:items-end">
              <div>
                <p className="mb-6 font-mono text-xs font-bold uppercase tracking-[.22em] text-[#FF4D00]">
                  {content.mentorship.kicker}
                </p>
                <h2 className="text-5xl font-black uppercase leading-[.92] tracking-[-.055em] lg:text-7xl">
                  <TitleLines text={content.mentorship.headline} />
                </h2>
              </div>
              <p className="max-w-xl text-lg leading-8 text-white/70">{content.mentorship.body}</p>
            </div>
            <div className="mt-16 grid border-l border-t border-white/15 lg:grid-cols-2">
              {content.mentorship.points.map((point, index) => {
                const spec = MENTOR_ICONS[index] ?? MENTOR_ICONS[0];
                const Icon = spec.icon;
                return (
                  <article key={point.title} className="border-b border-r border-white/15 p-8">
                    <Icon className={cn("h-8 w-8", spec.className)} aria-hidden />
                    <h3 className="mt-6 text-2xl font-bold">{point.title}</h3>
                    <p className="mt-3 text-base leading-7 text-white/70">{point.body}</p>
                  </article>
                );
              })}
            </div>
            <MarketingLink
              href={content.mentorship.ctaHref}
              className="mt-12 inline-flex items-center gap-3 bg-[#FF4D00] px-6 py-4 font-mono text-xs font-bold uppercase tracking-wider text-white"
            >
              {content.mentorship.cta}
              <ArrowRight className="h-4 w-4" aria-hidden />
            </MarketingLink>
          </div>
        </section>

        <section
          id="pricing"
          className="scroll-mt-16 border-y border-[#121417]/15 bg-[#E9EDF0] px-5 py-20 lg:px-12 lg:py-28"
        >
          <div className="mx-auto max-w-[1440px]">
            <div className="flex flex-col justify-between gap-8 lg:flex-row lg:items-end">
              <div>
                <p className="section-label">{content.pricing.kicker}</p>
                <h2 className="section-title">
                  <TitleLines text={content.pricing.headline} />
                </h2>
              </div>
              <div
                className="inline-flex self-start border border-[#121417] bg-[#121417] p-1 font-mono text-xs font-bold uppercase"
                role="group"
                aria-label="Pricing type"
              >
                <button
                  type="button"
                  className={cn(
                    "px-6 py-3 text-white",
                    audience === "individual" && "bg-[#FF4D00]"
                  )}
                  onClick={() => setAudience("individual")}
                >
                  {content.pricing.individualLabel}
                </button>
                <button
                  type="button"
                  className={cn(
                    "px-6 py-3 text-white",
                    audience === "operator" && "bg-[#FF4D00]"
                  )}
                  onClick={() => setAudience("operator")}
                >
                  {content.pricing.operatorLabel}
                </button>
              </div>
            </div>

            <div className="mt-14 grid gap-5 lg:grid-cols-3">
              {plans.map((plan) => (
                <PlanCard
                  key={plan.code + plan.name}
                  plan={plan}
                  featured={plan.recommended}
                />
              ))}
            </div>
            <p className="mt-8 font-mono text-[11px] uppercase tracking-[0.14em] text-[#515860]">
              {content.pricing.footnote}
            </p>
          </div>
        </section>

        <section className="px-5 py-20 lg:px-12">
          <div className="mx-auto max-w-5xl">
            <p className="section-label">{content.pricing.comparisonKicker}</p>
            <h2 className="section-title">
              <TitleLines text={content.pricing.comparisonHeadline} />
            </h2>
            <div className="mt-8 overflow-x-auto border border-[#121417]/15 bg-white">
              <table className="w-full min-w-[36rem] text-left text-sm">
                <thead>
                  <tr className="border-b border-[#121417]/15 font-mono text-[11px] uppercase tracking-[0.14em] text-[#515860]">
                    <th className="p-4 font-medium">Capability</th>
                    <th className="p-4 font-medium">{content.pricing.comparisonCol1}</th>
                    <th className="p-4 font-medium">{content.pricing.comparisonCol2}</th>
                    <th className="p-4 font-medium">{content.pricing.comparisonCol3}</th>
                  </tr>
                </thead>
                <tbody>
                  {content.pricing.comparisonRows.map((row) => (
                    <tr key={row.capability} className="border-b border-[#121417]/10 last:border-0">
                      <td className="p-4 font-medium">{row.capability}</td>
                      {([row.groundCrew, row.flightEngineer, row.fleetCommander] as const).map(
                        (included, i) => (
                          <td key={i} className="p-4">
                            {included ? (
                              <Check className="h-5 w-5 text-emerald-600" aria-label="Included" />
                            ) : (
                              <Minus className="h-5 w-5 text-[#A3A9AF]" aria-label="Not included" />
                            )}
                          </td>
                        )
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <section
          id="field-notes"
          className="scroll-mt-16 border-t border-[#121417]/15 px-5 py-20 lg:px-12 lg:py-28"
        >
          <div className="mx-auto grid max-w-[1440px] gap-14 lg:grid-cols-12">
            <div className="lg:col-span-4">
              <p className="section-label">{content.fieldNotes.kicker}</p>
              <h2 className="section-title">
                <TitleLines text={content.fieldNotes.headline} />
              </h2>
            </div>
            <div className="lg:col-span-8">
              {content.fieldNotes.notes.map((note, index) => (
                <blockquote
                  key={note.logId}
                  className={cn(
                    "border-t border-[#121417] py-8",
                    index === 0 && "border-t-2"
                  )}
                >
                  <div className="flex gap-5">
                    <PenLine className="mt-1 h-5 w-5 shrink-0 text-[#FF4D00]" aria-hidden />
                    <p className="text-xl font-medium leading-8 lg:text-2xl">“{note.quote}”</p>
                  </div>
                  <footer className="mt-7 flex flex-wrap justify-between gap-3 pl-10 font-mono text-[10px] uppercase tracking-widest">
                    <span>{note.attribution}</span>
                    <span className="text-[#0055FF]">{note.logId}</span>
                  </footer>
                </blockquote>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className="bg-[#121417] px-5 py-12 text-white lg:px-12">
        <div className="mx-auto max-w-[1440px]">
          <div className="grid gap-10 border-b border-white/15 pb-12 lg:grid-cols-2">
            <h2 className="text-5xl font-black uppercase leading-none tracking-[-.05em] lg:text-7xl">
              <FooterHeadline
                headline={content.footer.headline}
                accent={content.footer.headlineAccent}
              />
            </h2>
            <div className="flex flex-col items-start justify-end lg:items-end">
              <MarketingLink
                href={content.footer.ctaHref}
                className="flex items-center gap-4 bg-white px-6 py-4 font-mono text-xs font-bold uppercase text-[#121417]"
              >
                {content.footer.cta}
                <ArrowUpRight className="h-4 w-4" aria-hidden />
              </MarketingLink>
            </div>
          </div>
          <div className="flex flex-col justify-between gap-5 pt-7 font-mono text-[10px] uppercase tracking-widest text-white/55 md:flex-row">
            <span>{content.footer.copyright}</span>
            <span className="flex items-center gap-2 text-emerald-400">
              <Radio className="h-3 w-3" aria-hidden />
              {content.footer.systemStatus}
            </span>
            <div className="flex gap-5">
              <MarketingLink href={content.footer.privacyHref}>{content.footer.privacyLabel}</MarketingLink>
              <MarketingLink href={content.footer.termsHref}>{content.footer.termsLabel}</MarketingLink>
              <a href="#top">{content.footer.topLabel}</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
