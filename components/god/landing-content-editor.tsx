"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { saveMarketingLandingContent } from "@/app/actions/marketing-content";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  cloneLandingContent,
  type CodeCard,
  type ComparisonRow,
  type FieldNote,
  type LandingContent,
  type PricingPlan,
  type TextBullet,
} from "@/lib/marketing/landing-content";

function Field({
  label,
  hint,
  value,
  onChange,
  multiline = false,
  rows = 3,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (value: string) => void;
  multiline?: boolean;
  rows?: number;
}) {
  const id = useId();
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      {multiline ? (
        <Textarea
          id={id}
          value={value}
          rows={rows}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <Input id={id} value={value} onChange={(e) => onChange(e.target.value)} />
      )}
    </div>
  );
}

function BulletEditor({
  items,
  onChange,
  titleLabel = "Title",
  bodyLabel = "Body",
}: {
  items: TextBullet[];
  onChange: (items: TextBullet[]) => void;
  titleLabel?: string;
  bodyLabel?: string;
}) {
  return (
    <div className="space-y-4">
      {items.map((item, index) => (
        <div key={index} className="space-y-3 rounded-md border border-border/60 p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Item {index + 1}
            </p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onChange(items.filter((_, i) => i !== index))}
            >
              Remove
            </Button>
          </div>
          <Field
            label={`${titleLabel} ${index + 1}`}
            value={item.title}
            onChange={(title) =>
              onChange(items.map((row, i) => (i === index ? { ...row, title } : row)))
            }
          />
          <Field
            label={`${bodyLabel} ${index + 1}`}
            value={item.body}
            onChange={(body) =>
              onChange(items.map((row, i) => (i === index ? { ...row, body } : row)))
            }
            multiline
          />
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => onChange([...items, { title: "", body: "" }])}
      >
        Add item
      </Button>
    </div>
  );
}

function CodeCardEditor({
  items,
  onChange,
}: {
  items: CodeCard[];
  onChange: (items: CodeCard[]) => void;
}) {
  return (
    <div className="space-y-4">
      {items.map((item, index) => (
        <div key={index} className="space-y-3 rounded-md border border-border/60 p-4">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Card {index + 1}
            </p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onChange(items.filter((_, i) => i !== index))}
            >
              Remove
            </Button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label="Short code"
              value={item.code}
              onChange={(code) =>
                onChange(items.map((row, i) => (i === index ? { ...row, code } : row)))
              }
            />
            <Field
              label="Title"
              value={item.title}
              onChange={(title) =>
                onChange(items.map((row, i) => (i === index ? { ...row, title } : row)))
              }
            />
          </div>
          <Field
            label="Description"
            value={item.body}
            onChange={(body) =>
              onChange(items.map((row, i) => (i === index ? { ...row, body } : row)))
            }
            multiline
          />
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => onChange([...items, { code: "", title: "", body: "" }])}
      >
        Add card
      </Button>
    </div>
  );
}

function PlanEditor({
  plans,
  onChange,
}: {
  plans: PricingPlan[];
  onChange: (plans: PricingPlan[]) => void;
}) {
  return (
    <div className="space-y-5">
      {plans.map((plan, index) => (
        <div key={index} className="space-y-3 rounded-md border border-border/60 p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold">{plan.name || `Plan ${index + 1}`}</p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onChange(plans.filter((_, i) => i !== index))}
            >
              Remove plan
            </Button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label="Plan code"
              hint="Small label at the top, e.g. IND-01"
              value={plan.code}
              onChange={(code) =>
                onChange(plans.map((row, i) => (i === index ? { ...row, code } : row)))
              }
            />
            <Field
              label="Plan name"
              hint="Aviation nickname, e.g. Ground Crew"
              value={plan.name}
              onChange={(name) =>
                onChange(plans.map((row, i) => (i === index ? { ...row, name } : row)))
              }
            />
            <Field
              label="Plain-English name"
              hint="e.g. Free logbook"
              value={plan.plainName}
              onChange={(plainName) =>
                onChange(plans.map((row, i) => (i === index ? { ...row, plainName } : row)))
              }
            />
            <Field
              label="Who it's for"
              value={plan.audienceLine}
              onChange={(audienceLine) =>
                onChange(plans.map((row, i) => (i === index ? { ...row, audienceLine } : row)))
              }
            />
            <Field
              label="Price"
              hint='e.g. $19 or Custom'
              value={plan.price}
              onChange={(price) =>
                onChange(plans.map((row, i) => (i === index ? { ...row, price } : row)))
              }
            />
            <Field
              label="Period"
              hint='e.g. / month or leave blank'
              value={plan.period}
              onChange={(period) =>
                onChange(plans.map((row, i) => (i === index ? { ...row, period } : row)))
              }
            />
          </div>
          <Field
            label="Tagline"
            value={plan.tagline}
            onChange={(tagline) =>
              onChange(plans.map((row, i) => (i === index ? { ...row, tagline } : row)))
            }
            multiline
            rows={2}
          />
          <Field
            label="Features"
            hint="One feature per line"
            value={plan.features.join("\n")}
            onChange={(text) =>
              onChange(
                plans.map((row, i) =>
                  i === index
                    ? {
                        ...row,
                        features: text.split("\n").map((line) => line.trim()).filter(Boolean),
                      }
                    : row
                )
              )
            }
            multiline
            rows={5}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label="Button label"
              value={plan.cta}
              onChange={(cta) =>
                onChange(plans.map((row, i) => (i === index ? { ...row, cta } : row)))
              }
            />
            <Field
              label="Button link"
              hint="Use /auth/signup or mailto:sales@hangar13.app"
              value={plan.ctaHref}
              onChange={(ctaHref) =>
                onChange(plans.map((row, i) => (i === index ? { ...row, ctaHref } : row)))
              }
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={plan.recommended}
              onChange={(e) =>
                onChange(
                  plans.map((row, i) =>
                    i === index ? { ...row, recommended: e.target.checked } : row
                  )
                )
              }
            />
            Highlight as recommended
          </label>
          {plan.recommended ? (
            <Field
              label="Recommended badge"
              value={plan.recommendedLabel}
              onChange={(recommendedLabel) =>
                onChange(
                  plans.map((row, i) => (i === index ? { ...row, recommendedLabel } : row))
                )
              }
            />
          ) : null}
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() =>
          onChange([
            ...plans,
            {
              code: "",
              name: "New plan",
              plainName: "New plan",
              audienceLine: "",
              recommended: false,
              recommendedLabel: "Recommended",
              tagline: "",
              price: "",
              period: "/ month",
              features: [],
              cta: "Choose plan",
              ctaHref: "/auth/signup",
            },
          ])
        }
      >
        Add plan
      </Button>
    </div>
  );
}

export function LandingContentEditor({
  initialContent,
  updatedAt,
}: {
  initialContent: LandingContent;
  updatedAt: string | null;
}) {
  const [content, setContent] = useState(() => cloneLandingContent(initialContent));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const patch = <K extends keyof LandingContent>(
    key: K,
    value: Partial<LandingContent[K]>
  ) => {
    setContent((prev) => ({
      ...prev,
      [key]: { ...prev[key], ...value },
    }));
  };

  async function onSave() {
    setSaving(true);
    setMessage(null);
    setError(null);
    const result = await saveMarketingLandingContent(content);
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setMessage("Saved. The public landing page now shows these words.");
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          {updatedAt
            ? `Last saved ${new Date(updatedAt).toLocaleString()}`
            : "Not saved to the database yet — defaults are showing until you save."}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" asChild>
            <Link href="/marketing/preview" target="_blank">
              Preview
            </Link>
          </Button>
          <Button type="button" onClick={onSave} disabled={saving}>
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </div>
      {message ? (
        <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">{message}</p>
      ) : null}
      {error ? (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      <Tabs defaultValue="nav">
        <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1">
          <TabsTrigger value="nav">Nav & hero</TabsTrigger>
          <TabsTrigger value="path">Path & proof</TabsTrigger>
          <TabsTrigger value="solutions">Solutions</TabsTrigger>
          <TabsTrigger value="coursework">Coursework</TabsTrigger>
          <TabsTrigger value="mentorship">Mentorship</TabsTrigger>
          <TabsTrigger value="pricing">Pricing</TabsTrigger>
          <TabsTrigger value="notes">Field notes & footer</TabsTrigger>
        </TabsList>

        <TabsContent value="nav" className="space-y-6 pt-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Brand name"
              value={content.brand.namePrefix}
              onChange={(namePrefix) => patch("brand", { namePrefix })}
            />
            <Field
              label="Brand accent"
              hint="The highlighted part of the logo, e.g. 13"
              value={content.brand.nameAccent}
              onChange={(nameAccent) => patch("brand", { nameAccent })}
            />
            <Field
              label="Solutions menu"
              value={content.nav.solutionsLabel}
              onChange={(solutionsLabel) => patch("nav", { solutionsLabel })}
            />
            <Field
              label="Mechanic dropdown link"
              value={content.nav.mechanicLinkLabel}
              onChange={(mechanicLinkLabel) => patch("nav", { mechanicLinkLabel })}
            />
            <Field
              label="Operator dropdown link"
              value={content.nav.operatorLinkLabel}
              onChange={(operatorLinkLabel) => patch("nav", { operatorLinkLabel })}
            />
            <Field
              label="Coursework link"
              value={content.nav.courseworkLabel}
              onChange={(courseworkLabel) => patch("nav", { courseworkLabel })}
            />
            <Field
              label="Mentorship link"
              value={content.nav.mentorshipLabel}
              onChange={(mentorshipLabel) => patch("nav", { mentorshipLabel })}
            />
            <Field
              label="Pricing link"
              value={content.nav.pricingLabel}
              onChange={(pricingLabel) => patch("nav", { pricingLabel })}
            />
            <Field
              label="Field notes link"
              value={content.nav.fieldNotesLabel}
              onChange={(fieldNotesLabel) => patch("nav", { fieldNotesLabel })}
            />
            <Field
              label="Mechanic nav button"
              value={content.nav.ctaLabel}
              onChange={(ctaLabel) => patch("nav", { ctaLabel })}
            />
            <Field
              label="Operator nav button"
              value={content.nav.operatorCtaLabel}
              onChange={(operatorCtaLabel) => patch("nav", { operatorCtaLabel })}
            />
          </div>
          <div className="grid gap-4">
            <Field
              label="Hero eyebrow"
              value={content.hero.eyebrow}
              onChange={(eyebrow) => patch("hero", { eyebrow })}
            />
            <div className="grid gap-4 sm:grid-cols-3">
              <Field
                label="Headline line 1"
                value={content.hero.headlineLine1}
                onChange={(headlineLine1) => patch("hero", { headlineLine1 })}
              />
              <Field
                label="Headline line 2"
                value={content.hero.headlineLine2}
                onChange={(headlineLine2) => patch("hero", { headlineLine2 })}
              />
              <Field
                label="Headline accent"
                hint="Large stacked word; keep short"
                value={content.hero.headlineAccent}
                onChange={(headlineAccent) => patch("hero", { headlineAccent })}
              />
            </div>
            <Field
              label="Hero paragraph"
              value={content.hero.body}
              onChange={(body) => patch("hero", { body })}
              multiline
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Choice headline"
                value={content.hero.choiceHeadline}
                onChange={(choiceHeadline) => patch("hero", { choiceHeadline })}
              />
              <Field
                label="Choice hint"
                value={content.hero.choiceHint}
                onChange={(choiceHint) => patch("hero", { choiceHint })}
                multiline
                rows={2}
              />
              <Field
                label="Mechanic choice"
                value={content.hero.mechanicChoiceLabel}
                onChange={(mechanicChoiceLabel) => patch("hero", { mechanicChoiceLabel })}
              />
              <Field
                label="Operator choice"
                value={content.hero.operatorChoiceLabel}
                onChange={(operatorChoiceLabel) => patch("hero", { operatorChoiceLabel })}
              />
              <Field
                label="Mechanic follow-up"
                value={content.hero.mechanicLead}
                onChange={(mechanicLead) => patch("hero", { mechanicLead })}
                multiline
                rows={2}
              />
              <Field
                label="Operator follow-up"
                value={content.hero.operatorLead}
                onChange={(operatorLead) => patch("hero", { operatorLead })}
                multiline
                rows={2}
              />
              <Field
                label="Mechanic button"
                value={content.hero.mechanicCta}
                onChange={(mechanicCta) => patch("hero", { mechanicCta })}
              />
              <Field
                label="Mechanic button link"
                value={content.hero.mechanicCtaHref}
                onChange={(mechanicCtaHref) => patch("hero", { mechanicCtaHref })}
              />
              <Field
                label="Operator button"
                value={content.hero.operatorCta}
                onChange={(operatorCta) => patch("hero", { operatorCta })}
              />
              <Field
                label="Operator button link"
                value={content.hero.operatorCtaHref}
                onChange={(operatorCtaHref) => patch("hero", { operatorCtaHref })}
              />
            </div>
          </div>
        </TabsContent>

        <TabsContent value="path" className="space-y-8 pt-4">
          <h3 className="font-semibold">Product screenshot captions</h3>
          <Field
            label="Section label"
            value={content.proof.kicker}
            onChange={(kicker) => patch("proof", { kicker })}
          />
          <Field
            label="Headline"
            value={content.proof.headline}
            onChange={(headline) => patch("proof", { headline })}
          />
          <Field
            label="Mechanic caption"
            value={content.proof.mechanicCaption}
            onChange={(mechanicCaption) => patch("proof", { mechanicCaption })}
            multiline
          />
          <Field
            label="Operator caption"
            value={content.proof.operatorCaption}
            onChange={(operatorCaption) => patch("proof", { operatorCaption })}
            multiline
          />
          <h3 className="font-semibold">What you get</h3>
          <Field
            label="Section label"
            value={content.value.kicker}
            onChange={(kicker) => patch("value", { kicker })}
          />
          <Field
            label="Mechanic headline"
            value={content.value.mechanicHeadline}
            onChange={(mechanicHeadline) => patch("value", { mechanicHeadline })}
          />
          <BulletEditor
            items={content.value.mechanicItems}
            onChange={(mechanicItems) => patch("value", { mechanicItems })}
          />
          <Field
            label="Operator headline"
            value={content.value.operatorHeadline}
            onChange={(operatorHeadline) => patch("value", { operatorHeadline })}
          />
          <BulletEditor
            items={content.value.operatorItems}
            onChange={(operatorItems) => patch("value", { operatorItems })}
          />
          <h3 className="font-semibold">Proof points</h3>
          <Field
            label="Section label"
            value={content.proofPoints.kicker}
            onChange={(kicker) => patch("proofPoints", { kicker })}
          />
          <Field
            label="Headline"
            value={content.proofPoints.headline}
            onChange={(headline) => patch("proofPoints", { headline })}
          />
          <BulletEditor
            items={content.proofPoints.points}
            onChange={(points) => patch("proofPoints", { points })}
          />
          <h3 className="font-semibold">More (accordion labels)</h3>
          <Field
            label="Compare accordion"
            value={content.details.compareLabel}
            onChange={(compareLabel) => patch("details", { compareLabel })}
          />
          <Field
            label="Quotes accordion"
            value={content.details.quotesLabel}
            onChange={(quotesLabel) => patch("details", { quotesLabel })}
          />
        </TabsContent>

        <TabsContent value="solutions" className="space-y-8 pt-4">
          <Field
            label="Section label"
            value={content.solutions.kicker}
            onChange={(kicker) => patch("solutions", { kicker })}
          />
          <Field
            label="Headline"
            value={content.solutions.headline}
            onChange={(headline) => patch("solutions", { headline })}
          />
          <Field
            label="Intro"
            value={content.solutions.body}
            onChange={(body) => patch("solutions", { body })}
            multiline
          />
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="space-y-4">
              <h3 className="font-semibold">Mechanic / logbook</h3>
              <Field
                label="Audience label"
                value={content.solutions.mechanicAudience}
                onChange={(mechanicAudience) => patch("solutions", { mechanicAudience })}
              />
              <Field
                label="Product label"
                value={content.solutions.mechanicProduct}
                onChange={(mechanicProduct) => patch("solutions", { mechanicProduct })}
              />
              <Field
                label="Headline"
                value={content.solutions.mechanicHeadline}
                onChange={(mechanicHeadline) => patch("solutions", { mechanicHeadline })}
              />
              <Field
                label="Description"
                value={content.solutions.mechanicBody}
                onChange={(mechanicBody) => patch("solutions", { mechanicBody })}
                multiline
              />
              <Field
                label="Button"
                value={content.solutions.mechanicCta}
                onChange={(mechanicCta) => patch("solutions", { mechanicCta })}
              />
              <BulletEditor
                items={content.solutions.mechanicBullets}
                onChange={(mechanicBullets) => patch("solutions", { mechanicBullets })}
              />
            </div>
            <div className="space-y-4">
              <h3 className="font-semibold">Operator / organization</h3>
              <Field
                label="Audience label"
                value={content.solutions.operatorAudience}
                onChange={(operatorAudience) => patch("solutions", { operatorAudience })}
              />
              <Field
                label="Product label"
                value={content.solutions.operatorProduct}
                onChange={(operatorProduct) => patch("solutions", { operatorProduct })}
              />
              <Field
                label="Headline"
                value={content.solutions.operatorHeadline}
                onChange={(operatorHeadline) => patch("solutions", { operatorHeadline })}
              />
              <Field
                label="Description"
                value={content.solutions.operatorBody}
                onChange={(operatorBody) => patch("solutions", { operatorBody })}
                multiline
              />
              <Field
                label="Button"
                value={content.solutions.operatorCta}
                onChange={(operatorCta) => patch("solutions", { operatorCta })}
              />
              <BulletEditor
                items={content.solutions.operatorBullets}
                onChange={(operatorBullets) => patch("solutions", { operatorBullets })}
              />
            </div>
          </div>
        </TabsContent>

        <TabsContent value="coursework" className="space-y-6 pt-4">
          <Field
            label="Section label"
            value={content.coursework.kicker}
            onChange={(kicker) => patch("coursework", { kicker })}
          />
          <Field
            label="Headline"
            value={content.coursework.headline}
            onChange={(headline) => patch("coursework", { headline })}
          />
          <Field
            label="Intro"
            value={content.coursework.body}
            onChange={(body) => patch("coursework", { body })}
            multiline
          />
          <Field
            label="Featured program label"
            value={content.coursework.featuredKicker}
            onChange={(featuredKicker) => patch("coursework", { featuredKicker })}
          />
          <Field
            label="Featured program title"
            value={content.coursework.featuredTitle}
            onChange={(featuredTitle) => patch("coursework", { featuredTitle })}
          />
          <Field
            label="Featured program description"
            value={content.coursework.featuredBody}
            onChange={(featuredBody) => patch("coursework", { featuredBody })}
            multiline
          />
          <h3 className="font-semibold">License tracks</h3>
          <CodeCardEditor
            items={content.coursework.tracks}
            onChange={(tracks) => patch("coursework", { tracks })}
          />
          <h3 className="font-semibold">Additional coursework cards</h3>
          <CodeCardEditor
            items={content.coursework.extras}
            onChange={(extras) => patch("coursework", { extras })}
          />
        </TabsContent>

        <TabsContent value="mentorship" className="space-y-6 pt-4">
          <Field
            label="Section label"
            value={content.mentorship.kicker}
            onChange={(kicker) => patch("mentorship", { kicker })}
          />
          <Field
            label="Headline"
            value={content.mentorship.headline}
            onChange={(headline) => patch("mentorship", { headline })}
          />
          <Field
            label="Intro"
            value={content.mentorship.body}
            onChange={(body) => patch("mentorship", { body })}
            multiline
          />
          <Field
            label="Button label"
            value={content.mentorship.cta}
            onChange={(cta) => patch("mentorship", { cta })}
          />
          <Field
            label="Button link"
            hint="Usually a mailto: sales address"
            value={content.mentorship.ctaHref}
            onChange={(ctaHref) => patch("mentorship", { ctaHref })}
          />
          <BulletEditor
            items={content.mentorship.points}
            onChange={(points) => patch("mentorship", { points })}
          />
        </TabsContent>

        <TabsContent value="pricing" className="space-y-8 pt-4">
          <Field
            label="Section label"
            value={content.pricing.kicker}
            onChange={(kicker) => patch("pricing", { kicker })}
          />
          <Field
            label="Headline"
            value={content.pricing.headline}
            onChange={(headline) => patch("pricing", { headline })}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Individual toggle"
              value={content.pricing.individualLabel}
              onChange={(individualLabel) => patch("pricing", { individualLabel })}
            />
            <Field
              label="Operator toggle"
              value={content.pricing.operatorLabel}
              onChange={(operatorLabel) => patch("pricing", { operatorLabel })}
            />
          </div>
          <Field
            label="Fine print under the plans"
            value={content.pricing.footnote}
            onChange={(footnote) => patch("pricing", { footnote })}
          />
          <h3 className="font-semibold">Individual plans</h3>
          <PlanEditor
            plans={content.pricing.individualPlans}
            onChange={(individualPlans) => patch("pricing", { individualPlans })}
          />
          <h3 className="font-semibold">Operator plans</h3>
          <PlanEditor
            plans={content.pricing.operatorPlans}
            onChange={(operatorPlans) => patch("pricing", { operatorPlans })}
          />
          <h3 className="font-semibold">Comparison table</h3>
          <Field
            label="Table section label"
            value={content.pricing.comparisonKicker}
            onChange={(comparisonKicker) => patch("pricing", { comparisonKicker })}
          />
          <Field
            label="Table headline"
            value={content.pricing.comparisonHeadline}
            onChange={(comparisonHeadline) => patch("pricing", { comparisonHeadline })}
          />
          <div className="grid gap-4 sm:grid-cols-3">
            <Field
              label="Column 1"
              value={content.pricing.comparisonCol1}
              onChange={(comparisonCol1) => patch("pricing", { comparisonCol1 })}
            />
            <Field
              label="Column 2"
              value={content.pricing.comparisonCol2}
              onChange={(comparisonCol2) => patch("pricing", { comparisonCol2 })}
            />
            <Field
              label="Column 3"
              value={content.pricing.comparisonCol3}
              onChange={(comparisonCol3) => patch("pricing", { comparisonCol3 })}
            />
          </div>
          <div className="space-y-3">
            {content.pricing.comparisonRows.map((row, index) => (
              <div key={index} className="space-y-3 rounded-md border border-border/60 p-4">
                <div className="flex items-center justify-between">
                  <Field
                    label="Capability"
                    value={row.capability}
                    onChange={(capability) =>
                      patch("pricing", {
                        comparisonRows: content.pricing.comparisonRows.map((item, i) =>
                          i === index ? { ...item, capability } : item
                        ),
                      })
                    }
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="mt-6"
                    onClick={() =>
                      patch("pricing", {
                        comparisonRows: content.pricing.comparisonRows.filter((_, i) => i !== index),
                      })
                    }
                  >
                    Remove
                  </Button>
                </div>
                <div className="flex flex-wrap gap-4 text-sm">
                  {(
                    [
                      ["groundCrew", content.pricing.comparisonCol1],
                      ["flightEngineer", content.pricing.comparisonCol2],
                      ["fleetCommander", content.pricing.comparisonCol3],
                    ] as const
                  ).map(([key, label]) => (
                    <label key={key} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={row[key]}
                        onChange={(e) =>
                          patch("pricing", {
                            comparisonRows: content.pricing.comparisonRows.map((item, i) =>
                              i === index ? { ...item, [key]: e.target.checked } : item
                            ),
                          })
                        }
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                patch("pricing", {
                  comparisonRows: [
                    ...content.pricing.comparisonRows,
                    {
                      capability: "",
                      groundCrew: false,
                      flightEngineer: false,
                      fleetCommander: false,
                    } satisfies ComparisonRow,
                  ],
                })
              }
            >
              Add comparison row
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="notes" className="space-y-6 pt-4">
          <Field
            label="Section label"
            value={content.fieldNotes.kicker}
            onChange={(kicker) => patch("fieldNotes", { kicker })}
          />
          <Field
            label="Headline"
            value={content.fieldNotes.headline}
            onChange={(headline) => patch("fieldNotes", { headline })}
          />
          <div className="space-y-4">
            {content.fieldNotes.notes.map((note, index) => (
              <div key={index} className="space-y-3 rounded-md border border-border/60 p-4">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Quote {index + 1}
                  </p>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      patch("fieldNotes", {
                        notes: content.fieldNotes.notes.filter((_, i) => i !== index),
                      })
                    }
                  >
                    Remove
                  </Button>
                </div>
                <Field
                  label="Quote"
                  value={note.quote}
                  onChange={(quote) =>
                    patch("fieldNotes", {
                      notes: content.fieldNotes.notes.map((row, i) =>
                        i === index ? { ...row, quote } : row
                      ),
                    })
                  }
                  multiline
                />
                <Field
                  label="Attribution"
                  value={note.attribution}
                  onChange={(attribution) =>
                    patch("fieldNotes", {
                      notes: content.fieldNotes.notes.map((row, i) =>
                        i === index ? { ...row, attribution } : row
                      ),
                    })
                  }
                />
                <Field
                  label="Log line"
                  value={note.logId}
                  onChange={(logId) =>
                    patch("fieldNotes", {
                      notes: content.fieldNotes.notes.map((row, i) =>
                        i === index ? { ...row, logId } : row
                      ),
                    })
                  }
                />
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                patch("fieldNotes", {
                  notes: [
                    ...content.fieldNotes.notes,
                    { quote: "", attribution: "", logId: "" } satisfies FieldNote,
                  ],
                })
              }
            >
              Add quote
            </Button>
          </div>
          <h3 className="font-semibold">Footer</h3>
          <Field
            label="Closing headline"
            value={content.footer.headline}
            onChange={(headline) => patch("footer", { headline })}
            multiline
            rows={2}
          />
          <Field
            label="Closing headline accent"
            hint="Shown in orange on its own line"
            value={content.footer.headlineAccent}
            onChange={(headlineAccent) => patch("footer", { headlineAccent })}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Contact button"
              value={content.footer.cta}
              onChange={(cta) => patch("footer", { cta })}
            />
            <Field
              label="Contact link"
              value={content.footer.ctaHref}
              onChange={(ctaHref) => patch("footer", { ctaHref })}
            />
            <Field
              label="Copyright"
              value={content.footer.copyright}
              onChange={(copyright) => patch("footer", { copyright })}
            />
            <Field
              label="System status"
              value={content.footer.systemStatus}
              onChange={(systemStatus) => patch("footer", { systemStatus })}
            />
            <Field
              label="Privacy label"
              value={content.footer.privacyLabel}
              onChange={(privacyLabel) => patch("footer", { privacyLabel })}
            />
            <Field
              label="Privacy link"
              value={content.footer.privacyHref}
              onChange={(privacyHref) => patch("footer", { privacyHref })}
            />
            <Field
              label="Terms label"
              value={content.footer.termsLabel}
              onChange={(termsLabel) => patch("footer", { termsLabel })}
            />
            <Field
              label="Terms link"
              value={content.footer.termsHref}
              onChange={(termsHref) => patch("footer", { termsHref })}
            />
            <Field
              label="Back to top"
              value={content.footer.topLabel}
              onChange={(topLabel) => patch("footer", { topLabel })}
            />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
