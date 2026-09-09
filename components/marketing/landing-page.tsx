"use client";

import { useEffect, useState, type MouseEvent, type ReactNode } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  BookOpen,
  CalendarCheck,
  Check,
  CheckCircle2,
  ChevronDown,
  ClipboardCheck,
  FileCheck2,
  Menu,
  Minus,
  ShieldCheck,
  Users,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Hangar13Mark } from "@/components/brand/hangar13-mark";
import type { LandingContent, PricingPlan } from "@/lib/marketing/landing-content";
import { LogbookProductPreview } from "@/components/marketing/logbook-product-preview";

export type LandingAudience = "mechanic" | "operator";

function TitleLines({ text }: { text: string }) {
  return <span className="whitespace-pre-line">{text}</span>;
}

function goToSection(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  const next =
    id === "top" ? window.location.pathname : `${window.location.pathname}#${id}`;
  window.history.replaceState(null, "", next);
}

function SectionNavLink({
  href,
  className,
  children,
  onClick,
}: {
  href: `#${string}`;
  className?: string;
  children: ReactNode;
  onClick?: (event: MouseEvent<HTMLAnchorElement>) => void;
}) {
  return (
    <a
      href={href}
      className={className}
      onClick={(event) => {
        event.preventDefault();
        goToSection(href.slice(1));
        onClick?.(event);
      }}
    >
      {children}
    </a>
  );
}

function sectionKicker(text: string) {
  return text.replace(/^\d{2}\s*\/\/\s*/, "").trim();
}

function MarketingLink({
  href,
  className,
  children,
  onClick,
}: {
  href: string;
  className?: string;
  children: ReactNode;
  onClick?: (event: MouseEvent<HTMLAnchorElement>) => void;
}) {
  const external = href.startsWith("http") || href.startsWith("mailto:");
  if (external) {
    return (
      <a href={href} className={className} onClick={onClick}>
        {children}
      </a>
    );
  }
  return (
    <Link href={href} className={className} onClick={onClick}>
      {children}
    </Link>
  );
}

function PlanCard({ plan, featured }: { plan: PricingPlan; featured: boolean }) {
  return (
    <article
      className={cn(
        "relative flex flex-col border p-6 lg:p-8",
        featured
          ? "border-[#121417] bg-[#121417] text-white"
          : "border-[#121417]/20 bg-white"
      )}
    >
      <p className={cn("text-sm", featured ? "text-white/65" : "text-[#515860]")}>
        {plan.audienceLine}
      </p>
      <h3 className="mt-4 text-3xl font-black tracking-tight">{plan.plainName}</h3>
      <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.14em] text-[#0055FF]">
        {plan.name}
      </p>
      <p className={cn("mt-4 min-h-12 text-base leading-6", featured ? "text-white/70" : "text-[#515860]")}>
        {plan.tagline}
      </p>
      <div className="my-8 border-y border-current/20 py-6">
        <span className="text-4xl font-black">{plan.price}</span>
        {plan.period ? (
          <span className="ml-1 text-sm opacity-60">{plan.period}</span>
        ) : null}
      </div>
      <ul className="space-y-3">
        {plan.features.map((feature) => (
          <li key={feature} className="flex gap-3 text-sm">
            <Check
              className={cn("h-4 w-4 shrink-0", featured ? "text-white" : "text-[#0055FF]")}
              aria-hidden
            />
            {feature}
          </li>
        ))}
      </ul>
      <MarketingLink
        href={plan.ctaHref}
        className={cn(
          "mt-auto flex items-center justify-between px-5 py-4 text-sm font-semibold",
          featured ? "bg-white text-[#121417]" : "bg-[#F4F7F9] text-[#121417]"
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
          <span className="text-white">{trimmedAccent}</span>
        </>
      ) : null}
    </>
  );
}

function Accordion({
  id,
  label,
  children,
}: {
  id: string;
  label: string;
  children: ReactNode;
}) {
  return (
    <details id={id} className="group border-b border-[#121417]/15">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-5 text-left text-lg font-semibold marker:content-none [&::-webkit-details-marker]:hidden">
        {label}
        <ChevronDown className="h-5 w-5 shrink-0 transition group-open:rotate-180" aria-hidden />
      </summary>
      <div className="pb-10">{children}</div>
    </details>
  );
}

const VALUE_ICONS = [BookOpen, ClipboardCheck, Users] as const;
const MENTOR_ICONS = [ShieldCheck, CalendarCheck, CheckCircle2, Users] as const;

function PathCard({
  label,
  imageSrc,
  imageAlt,
  selected,
  expanded,
  fill,
  switchLabel,
  onSelect,
  onSwitch,
}: {
  label: string;
  imageSrc: string;
  imageAlt: string;
  selected: boolean;
  expanded?: boolean;
  fill?: boolean;
  switchLabel?: string;
  onSelect: () => void;
  onSwitch?: () => void;
}) {
  const frameClass = cn(
    "group relative overflow-hidden text-left transition-[min-height] duration-500 ease-out",
    expanded
      ? "min-h-[32rem] self-stretch md:min-h-[40rem]"
      : fill
        ? "h-full min-h-[240px]"
        : "min-h-[300px] md:min-h-[420px] lg:min-h-[520px]",
    selected && "ring-4 ring-inset ring-[#FF4D00]"
  );

  const media = (
    <>
      <img
        src={imageSrc}
        alt={imageAlt}
        className="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-105"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-[#121417] via-[#121417]/50 to-[#121417]/15" />
      <div className="absolute inset-x-0 bottom-0 p-6 sm:p-8 lg:p-10">
        <p className="text-3xl font-black uppercase leading-[0.95] tracking-tight text-white sm:text-4xl lg:text-5xl">
          {label}
        </p>
        {expanded && onSwitch && switchLabel ? (
          <button
            type="button"
            onClick={onSwitch}
            className="mt-4 text-sm font-semibold text-white/85 underline-offset-4 hover:text-white hover:underline"
          >
            {switchLabel}
          </button>
        ) : !expanded ? (
          <p className="mt-4 text-sm font-semibold text-white">Select this path</p>
        ) : null}
      </div>
    </>
  );

  if (expanded) {
    return (
      <div className={frameClass} aria-pressed="true">
        {media}
      </div>
    );
  }

  return (
    <button type="button" onClick={onSelect} aria-pressed={selected} className={frameClass}>
      {media}
    </button>
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
  const [audience, setAudience] = useState<LandingAudience | null>(null);

  useEffect(() => {
    const hash = window.location.hash;
    if (hash === "#operator") setAudience("operator");
    if (hash === "#mechanic") setAudience("mechanic");
  }, []);

  function selectAudience(next: LandingAudience) {
    setAudience(next);
  }

  const hasPath = audience !== null;
  const isMechanic = audience === "mechanic";
  const plans = isMechanic ? content.pricing.individualPlans : content.pricing.operatorPlans;
  const valueItems = isMechanic ? content.value.mechanicItems : content.value.operatorItems;
  const navCta = isMechanic ? content.nav.ctaLabel : content.nav.operatorCtaLabel;
  const navCtaHref = isMechanic
    ? content.hero.mechanicCtaHref
    : content.hero.operatorCtaHref;

  return (
    <div className="marketing-page min-h-screen bg-[#F4F7F9] text-[#121417]">
      {preview ? (
        <div className="sticky top-0 z-[60] flex items-center justify-between gap-3 bg-[#121417] px-4 py-2 text-xs text-white sm:px-6">
          <p>Preview of the public landing page. Visitors see this without signing in.</p>
          <Link
            href="/dashboard/god/landing"
            className="shrink-0 text-[#FF4D00] underline-offset-4 hover:underline"
          >
            Back to editor
          </Link>
        </div>
      ) : null}

      <header className="fixed inset-x-0 top-0 z-50 border-b border-[#121417]/15 bg-[#F4F7F9]/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-[1440px] items-center justify-between px-5 lg:px-8">
          <Hangar13Mark
            href="#top"
            prefix={content.brand.namePrefix}
            accent={content.brand.nameAccent}
            onClick={(event) => {
              event.preventDefault();
              goToSection("top");
            }}
          />
          <nav className="hidden items-center gap-7 text-sm md:flex">
            <SectionNavLink href="#choose" className="hover:text-[#0055FF]">
              Who it&apos;s for
            </SectionNavLink>
            <SectionNavLink href="#coursework" className="hover:text-[#0055FF]">
              {content.nav.courseworkLabel}
            </SectionNavLink>
            <SectionNavLink href="#mentor" className="hover:text-[#0055FF]">
              {content.nav.mentorshipLabel}
            </SectionNavLink>
            <SectionNavLink
              href={hasPath ? "#pricing" : "#choose"}
              className="hover:text-[#0055FF]"
            >
              {content.nav.pricingLabel}
            </SectionNavLink>
            <SectionNavLink href="#more" className="hover:text-[#0055FF]">
              More
            </SectionNavLink>
            <a href="/auth/login" className="hover:text-[#0055FF]">
              Sign in
            </a>
          </nav>
          <div className="flex items-center gap-3">
            {hasPath ? (
              <MarketingLink
                href={navCtaHref}
                className="hidden bg-[#FF4D00] px-4 py-2.5 text-sm font-semibold text-white sm:inline-flex"
              >
                {navCta}
              </MarketingLink>
            ) : null}
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
          <div className="border-t border-[#121417]/15 bg-[#F4F7F9] px-5 py-4 text-sm md:hidden">
            <div className="flex flex-col gap-3">
              <SectionNavLink href="#choose" onClick={() => setMobileOpen(false)}>
                Who it&apos;s for
              </SectionNavLink>
              <SectionNavLink href="#coursework" onClick={() => setMobileOpen(false)}>
                {content.nav.courseworkLabel}
              </SectionNavLink>
              <SectionNavLink href="#mentor" onClick={() => setMobileOpen(false)}>
                {content.nav.mentorshipLabel}
              </SectionNavLink>
              <SectionNavLink
                href={hasPath ? "#pricing" : "#choose"}
                onClick={() => setMobileOpen(false)}
              >
                {content.nav.pricingLabel}
              </SectionNavLink>
              <SectionNavLink href="#more" onClick={() => setMobileOpen(false)}>
                More
              </SectionNavLink>
              <a href="/auth/login" onClick={() => setMobileOpen(false)}>
                Sign in
              </a>
            </div>
          </div>
        ) : null}
      </header>

      <main>
        <section id="top" className="scroll-mt-16 pt-16">
          {hasPath ? null : (
            <div className="grid lg:min-h-[calc(100svh-4rem)] lg:grid-cols-[minmax(18rem,0.72fr)_minmax(0,1.28fr)]">
              <div className="@container flex h-full flex-col justify-center px-5 py-12 lg:justify-start lg:px-10 lg:py-10 xl:px-12">
                <p className="mb-5 font-mono text-xs font-bold uppercase tracking-[.22em] text-[#0055FF]">
                  {content.hero.eyebrow}
                </p>
                <h1 className="text-[clamp(2.6rem,16cqi,5.5rem)] font-black uppercase leading-[.84] tracking-[-.075em]">
                  {content.hero.headlineLine1}
                  <br />
                  {content.hero.headlineLine2}
                  <br />
                  {content.hero.headlineAccent}
                </h1>
                <p className="mt-6 text-base leading-7 text-[#30363D] sm:text-lg sm:leading-8">
                  {content.hero.body}
                </p>
                <p className="mt-8 font-mono text-[11px] font-bold uppercase tracking-[.2em] text-[#121417]/45">
                  Choose a path →
                </p>
              </div>
              <div
                id="choose"
                className="grid min-h-[480px] grid-rows-2 lg:min-h-full"
                role="group"
                aria-label="Choose your path"
              >
                <PathCard
                  label="For mechanics"
                  imageSrc="/marketing/maintenance-workbench.webp"
                  imageAlt="Mechanic at a hangar workbench"
                  selected={false}
                  fill
                  onSelect={() => selectAudience("mechanic")}
                />
                <PathCard
                  label="For operators"
                  imageSrc="/marketing/turbine-assembly.webp"
                  imageAlt="Turbine assembly in a hangar"
                  selected={false}
                  fill
                  onSelect={() => selectAudience("operator")}
                />
              </div>
            </div>
          )}
          {hasPath ? (
          <div
            id="choose"
            className="grid scroll-mt-16 bg-white md:grid-cols-2"
            role="group"
            aria-label="Choose your path"
          >
            {audience !== "operator" ? (
              <PathCard
                label="For mechanics"
                imageSrc="/marketing/maintenance-workbench.webp"
                imageAlt="Mechanic at a hangar workbench"
                selected
                expanded
                switchLabel="Switch to Operator"
                onSelect={() => selectAudience("mechanic")}
                onSwitch={() => selectAudience("operator")}
              />
            ) : null}
            <div
              id="what-you-get"
              className={cn(
                "flex flex-col justify-center bg-white px-5 py-12 md:px-8 md:py-16 lg:px-12 xl:px-16",
                audience === "operator" && "max-md:order-last"
              )}
            >
              <p className="section-label">{sectionKicker(content.value.kicker)}</p>
              <h2 className="section-title">
                <TitleLines
                  text={isMechanic ? content.value.mechanicHeadline : content.value.operatorHeadline}
                />
              </h2>
              <div className="mt-8 space-y-4">
                {valueItems.map((item, index) => {
                  const Icon = VALUE_ICONS[index] ?? ShieldCheck;
                  return (
                    <article
                      key={item.title}
                      className="border border-[#121417]/10 bg-[#F4F7F9] p-5"
                    >
                      <Icon className="h-5 w-5 text-[#0055FF]" aria-hidden />
                      <h3 className="mt-3 text-lg font-bold">{item.title}</h3>
                      <p className="mt-2 text-sm leading-6 text-[#515860]">{item.body}</p>
                    </article>
                  );
                })}
              </div>
            </div>
            {audience !== "mechanic" ? (
              <PathCard
                label="For operators"
                imageSrc="/marketing/turbine-assembly.webp"
                imageAlt="Turbine assembly in a hangar"
                selected
                expanded
                switchLabel="Switch to Mechanic"
                onSelect={() => selectAudience("operator")}
                onSwitch={() => selectAudience("mechanic")}
              />
            ) : null}
          </div>
          ) : null}
        </section>

        <section id="proof" className="on-ink scroll-mt-16 bg-[#121417] px-5 py-14 lg:px-12 lg:py-20">
          <div className="mx-auto max-w-[1440px]">
            <p className="section-label">{sectionKicker(content.proof.kicker)}</p>
            <h2 className="section-title">
              <TitleLines text={content.proof.headline} />
            </h2>
            <div className="mt-10">
              <LogbookProductPreview
                caption={
                  audience === "operator"
                    ? content.proof.operatorCaption
                    : content.proof.mechanicCaption
                }
              />
            </div>
          </div>
        </section>

        <section id="coursework" className="scroll-mt-16 bg-[#F4F7F9] px-5 py-14 lg:px-12 lg:py-20">
          <div className="mx-auto max-w-[1440px]">
            <p className="section-label">{sectionKicker(content.coursework.kicker)}</p>
            <h2 className="section-title">
              <TitleLines text={content.coursework.headline} />
            </h2>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-[#30363D]">{content.coursework.body}</p>
            <div className="mt-10 overflow-hidden border border-[#121417]/15 bg-white">
              <div className="bg-[#121417] p-6 text-white lg:p-10">
                <p className="font-mono text-xs uppercase tracking-widest text-[#FF4D00]">
                  {content.coursework.featuredKicker}
                </p>
                <h3 className="mt-3 text-2xl font-black uppercase tracking-tight lg:text-4xl">
                  {content.coursework.featuredTitle}
                </h3>
                <p className="mt-3 max-w-2xl text-base leading-7 text-white/70">
                  {content.coursework.featuredBody}
                </p>
              </div>
              <div className="grid md:grid-cols-3">
                {content.coursework.tracks.map((track) => (
                  <article
                    key={track.code}
                    className="border-t border-[#121417]/10 p-6 md:border-t-0 md:border-l md:first:border-l-0"
                  >
                    <span className="font-mono text-xs font-bold text-[#0055FF]">{track.code}</span>
                    <h4 className="mt-3 text-lg font-bold">{track.title}</h4>
                    <p className="mt-2 text-base leading-6 text-[#515860]">{track.body}</p>
                  </article>
                ))}
              </div>
              <div className="grid sm:grid-cols-2">
                {content.coursework.extras.map((extra) => (
                  <article
                    key={extra.code}
                    className="border-t border-[#121417]/10 p-6 sm:border-l sm:odd:border-l-0"
                  >
                    <span className="font-mono text-xs text-[#0055FF]">{extra.code}</span>
                    <h4 className="mt-2 font-bold">{extra.title}</h4>
                    <p className="mt-2 text-sm leading-6 text-[#515860]">{extra.body}</p>
                  </article>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section id="mentor" className="on-ink scroll-mt-16 bg-[#121417] px-5 py-14 lg:px-12 lg:py-20">
          <div className="mx-auto max-w-[1440px]">
            <p className="section-label">{sectionKicker(content.mentorship.kicker)}</p>
            <h2 className="section-title">
              <TitleLines text={content.mentorship.headline} />
            </h2>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-white/70">{content.mentorship.body}</p>
            <div className="mt-10 grid gap-4 sm:grid-cols-2">
              {content.mentorship.points.map((point, index) => {
                const Icon = MENTOR_ICONS[index] ?? ShieldCheck;
                return (
                  <article key={point.title} className="border border-white/10 bg-white/[0.04] p-6">
                    <Icon className="h-5 w-5 text-[#FF4D00]" aria-hidden />
                    <h3 className="mt-4 text-xl font-bold text-white">{point.title}</h3>
                    <p className="mt-3 text-base leading-7 text-white/65">{point.body}</p>
                  </article>
                );
              })}
            </div>
            <MarketingLink
              href={content.mentorship.ctaHref}
              className="mt-10 inline-flex items-center gap-2 bg-[#FF4D00] px-5 py-3 text-sm font-semibold text-white"
            >
              {content.mentorship.cta}
              <ArrowUpRight className="h-4 w-4" aria-hidden />
            </MarketingLink>
          </div>
        </section>

        {hasPath ? (
        <section
          id="pricing"
          className="scroll-mt-16 bg-[#E9EDF0] px-5 py-14 lg:px-12 lg:py-20"
        >
          <div className="mx-auto max-w-[1440px]">
            <p className="section-label">{sectionKicker(content.pricing.kicker)}</p>
            <h2 className="section-title">
              <TitleLines text={content.pricing.headline} />
            </h2>
            <p className="mt-6 text-base text-[#515860]">
              {isMechanic ? "Mechanic plans" : "Operator plans"}
              <span className="text-[#121417]/40"> · </span>
              <button
                type="button"
                className="text-[#0055FF] underline-offset-4 hover:underline"
                onClick={() => setAudience(isMechanic ? "operator" : "mechanic")}
              >
                Switch to {isMechanic ? "operator" : "mechanic"}
              </button>
            </p>
            <div className="mt-8 grid gap-4 lg:grid-cols-3">
              {plans.map((plan) => (
                <PlanCard key={plan.code + plan.plainName} plan={plan} featured={plan.recommended} />
              ))}
            </div>
            <p className="mt-8 text-sm text-[#515860]">{content.pricing.footnote}</p>
          </div>
        </section>
        ) : null}

        <section id="proof-points" className="scroll-mt-16 bg-white px-5 py-14 lg:px-12 lg:py-20">
          <div className="mx-auto max-w-[1440px]">
            <p className="section-label">{sectionKicker(content.proofPoints.kicker)}</p>
            <h2 className="section-title">
              <TitleLines text={content.proofPoints.headline} />
            </h2>
            <div className="mt-8 grid gap-4 md:grid-cols-3">
              {content.proofPoints.points.map((point) => (
                <article key={point.title} className="border border-[#121417]/10 bg-[#F4F7F9] p-6">
                  <FileCheck2 className="h-6 w-6 text-[#0055FF]" aria-hidden />
                  <h3 className="mt-4 text-xl font-bold">{point.title}</h3>
                  <p className="mt-3 text-base leading-7 text-[#515860]">{point.body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="more" className="scroll-mt-16 bg-[#F4F7F9] px-5 py-8 lg:px-12">
          <div className="mx-auto max-w-[1440px]">
            <Accordion id="compare" label={content.details.compareLabel}>
              <div className="overflow-x-auto border border-[#121417]/15 bg-white">
                <table className="w-full min-w-[36rem] text-left text-sm">
                  <thead>
                    <tr className="border-b border-[#121417]/15 text-[#515860]">
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
            </Accordion>

            <Accordion id="field-notes" label={content.details.quotesLabel}>
              <div className="space-y-8">
                {content.fieldNotes.notes.map((note) => (
                  <blockquote key={note.attribution} className="max-w-3xl">
                    <p className="text-lg leading-8">“{note.quote}”</p>
                    <footer className="mt-3 text-sm text-[#515860]">{note.attribution}</footer>
                  </blockquote>
                ))}
              </div>
            </Accordion>
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
              {hasPath ? (
                <MarketingLink
                  href={isMechanic ? content.hero.mechanicCtaHref : content.footer.ctaHref}
                  className="flex items-center gap-4 bg-[#FF4D00] px-6 py-4 text-sm font-semibold text-white"
                >
                  {isMechanic ? content.hero.mechanicCta : content.footer.cta}
                  <ArrowUpRight className="h-4 w-4" aria-hidden />
                </MarketingLink>
              ) : null}
            </div>
          </div>
          <div className="flex flex-col justify-between gap-5 pt-7 text-sm text-white/55 md:flex-row">
            <span>{content.footer.copyright}</span>
            <span>{content.footer.systemStatus}</span>
            <div className="flex gap-5">
              <MarketingLink href={content.footer.privacyHref}>{content.footer.privacyLabel}</MarketingLink>
              <MarketingLink href={content.footer.termsHref}>{content.footer.termsLabel}</MarketingLink>
              <a
                href="#top"
                onClick={(event) => {
                  event.preventDefault();
                  goToSection("top");
                }}
              >
                {content.footer.topLabel}
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
