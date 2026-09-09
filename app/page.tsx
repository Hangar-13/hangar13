import type { Metadata } from "next";
import { LandingPage } from "@/components/marketing/landing-page";
import { fetchLandingContent } from "@/lib/marketing/fetch-landing-content";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const content = await fetchLandingContent();
  return {
    title: `${content.brand.namePrefix}${content.brand.nameAccent}`,
    description: content.hero.body,
  };
}

export default async function Home() {
  const content = await fetchLandingContent();
  return <LandingPage content={content} />;
}
