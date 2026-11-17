import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/auth/auth-shell";
import { formatDocSize, listPublicDocs } from "@/lib/public-docs";

export const metadata: Metadata = {
  title: "Apprenticeship Framework · Hangar 13",
  description: "Apprenticeship framework documents from Hangar 13.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-static";

export default function DocsDirectoryPage() {
  const docs = listPublicDocs();

  return (
    <AuthShell contentClassName="max-w-xl" panelHref="/">
      <div className="space-y-8">
        <h1 className="whitespace-nowrap text-[clamp(1.15rem,4.6vw,1.85rem)] font-black uppercase leading-none tracking-[-.06em]">
          Apprenticeship Framework
        </h1>
        {docs.length === 0 ? (
          <p className="border border-[#121417]/15 bg-white px-5 py-8 text-sm text-[#515860]">
            No documents have been added yet.
          </p>
        ) : (
          <ul className="border border-[#121417]/15 bg-white">
            {docs.map((doc, index) => (
              <li key={doc.name} className="border-b border-[#121417]/10 last:border-b-0">
                <a
                  href={doc.href}
                  className="flex items-center gap-3 px-3 py-3 transition-colors hover:bg-[#F4F7F9] sm:gap-4 sm:px-4"
                >
                  {doc.previewHref ? (
                    <img
                      src={doc.previewHref}
                      alt=""
                      className="h-16 w-[3.25rem] shrink-0 border border-[#121417]/15 bg-white object-cover object-top shadow-sm"
                    />
                  ) : null}
                  <span className="w-6 shrink-0 font-mono text-xs font-bold text-[#FF4D00]">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span className="min-w-0 flex-1 font-semibold leading-snug">
                    {doc.displayName}
                  </span>
                  <span className="shrink-0 text-right font-mono text-[10px] uppercase tracking-[.14em] text-[#515860]">
                    {doc.extension || "file"}
                    <span className="mt-0.5 block tracking-normal">{formatDocSize(doc.bytes)}</span>
                  </span>
                </a>
              </li>
            ))}
          </ul>
        )}
        <p className="text-sm text-[#515860]">
          <Link
            href="/"
            className="font-semibold text-[#0055FF] underline-offset-4 hover:underline"
          >
            Back to Hangar 13
          </Link>
        </p>
      </div>
    </AuthShell>
  );
}
