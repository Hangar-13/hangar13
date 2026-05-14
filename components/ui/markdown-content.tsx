"use client";

import type { ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { isTalentLmsHttpsUrl } from "@/lib/talentlms/lesson-url";
import { talentLmsSpInitiatedSsoLaunchUrl } from "@/lib/talentlms/sso-launch-url";
import { cn } from "@/lib/utils";

const bodyClass = cn(
  "max-w-none text-sm",
  "text-foreground/95",
  "[&_p]:mb-3 [&_p]:last:mb-0",
  "[&_h1]:text-lg [&_h1]:font-bold [&_h1]:mb-2 [&_h1]:mt-1",
  "[&_h2]:text-base [&_h2]:font-semibold [&_h2]:mb-2 [&_h2]:mt-2",
  "[&_h3]:text-sm [&_h3]:font-semibold [&_h3]:mb-1.5 [&_h3]:mt-2",
  "[&_ul]:list-disc [&_ul]:pl-5 [&_ul]:mb-2 [&_ul]:space-y-1.5",
  "[&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:mb-2 [&_ol]:space-y-1.5",
  "[&_li]:pl-0.5",
  "[&_blockquote]:border-l-4 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:italic [&_blockquote]:text-muted-foreground",
  "[&_hr]:my-4 [&_hr]:border-border",
  "[&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2",
  "[&_pre]:my-2 [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:border [&_pre]:border-border [&_pre]:bg-muted/40 [&_pre]:p-3 [&_pre]:text-xs",
  "[&_code]:text-[0.85em] [&_p_code]:rounded [&_p_code]:bg-muted [&_p_code]:px-1 [&_p_code]:py-0.5 [&_p_code]:font-mono",
  "[&_pre_code]:bg-transparent [&_pre_code]:p-0",
  "dark:[&_a]:text-primary"
);

const tableWrap = "my-2 overflow-x-auto rounded-md border border-border";

type Props = {
  markdown: string;
  className?: string;
  /**
   * When provided (including `null`), `*.talentlms.com` links use SP-initiated SAML in a new tab.
   * Omit for previews / non-training contexts (links stay as authored).
   */
  talentPortalOrigin?: string | null;
};

/**
 * Renders GitHub-flavored markdown (headings, lists, links, code, tables).
 * Does not use raw HTML (react-markdown default is safe; no rehype-raw).
 */
export function MarkdownContent({
  markdown,
  className,
  talentPortalOrigin,
}: Props) {
  return (
    <div className={cn(bodyClass, className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) => {
            const raw = typeof href === "string" ? href : "";
            const isHttp = raw.startsWith("http");
            const resolvedHref =
              typeof talentPortalOrigin !== "undefined" &&
              isHttp &&
              isTalentLmsHttpsUrl(raw)
                ? talentLmsSpInitiatedSsoLaunchUrl(raw, {
                    portalOrigin: talentPortalOrigin ?? null,
                  })
                : raw;

            return (
              <a
                href={resolvedHref || undefined}
                className="text-primary underline underline-offset-2"
                target={isHttp ? "_blank" : undefined}
                rel={isHttp ? "noopener noreferrer" : undefined}
              >
                {children}
              </a>
            );
          },
          table: ({ children }) => (
            <div className={tableWrap}>
              <table className="w-full border-collapse text-left text-sm">
                {children as ReactNode}
              </table>
            </div>
          ),
          thead: (props) => <thead className="bg-muted/50" {...props} />,
          th: (props) => (
            <th
              className="border-b border-border px-2 py-1.5 font-medium"
              {...props}
            />
          ),
          td: (props) => (
            <td className="border-b border-border/80 px-2 py-1.5" {...props} />
          ),
        }}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  );
}
