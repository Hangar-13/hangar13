import type { Metadata } from "next";
import { Hangar13Mark } from "@/components/brand/hangar13-mark";
import { formatDocSize, listPublicDocs } from "@/lib/public-docs";

export const metadata: Metadata = {
  title: "Documents · Hangar 13",
  description: "Documents from Hangar 13.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-static";

export default function DocsDirectoryPage() {
  const docs = listPublicDocs();

  return (
    <div className="marketing-page min-h-svh bg-[#F4F7F9] text-[#121417]">
      <header className="border-b border-[#121417]/15 px-5 py-5 sm:px-8">
        <Hangar13Mark href="/" size="lg" />
      </header>
      <main className="mx-auto w-full max-w-3xl px-5 py-10 sm:px-8 sm:py-14">
        <p className="font-mono text-xs font-semibold uppercase tracking-[0.14em] text-[#FF4D00]">
          Hangar 13
        </p>
        <h1 className="mt-3 text-4xl font-black tracking-tight">Documents</h1>
        <p className="mt-3 max-w-xl text-base text-[#121417]/70">
          Open a file below.
        </p>
        {docs.length === 0 ? (
          <p className="mt-10 border border-[#121417]/15 bg-white px-5 py-8 text-sm text-[#121417]/70">
            No documents have been added yet.
          </p>
        ) : (
          <ul className="mt-10 divide-y divide-[#121417]/10 border border-[#121417]/15 bg-white">
            {docs.map((doc) => (
              <li key={doc.name}>
                <a
                  href={doc.href}
                  className="flex items-baseline justify-between gap-4 px-5 py-4 hover:bg-[#F4F7F9]"
                >
                  <span className="min-w-0 break-words font-semibold">{doc.name}</span>
                  <span className="shrink-0 font-mono text-xs uppercase tracking-wide text-[#121417]/50">
                    {doc.extension || "file"} · {formatDocSize(doc.bytes)}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
