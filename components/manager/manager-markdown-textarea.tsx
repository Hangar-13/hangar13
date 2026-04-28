"use client";

import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MarkdownContent } from "@/components/ui/markdown-content";
import { cn } from "@/lib/utils";

type Props = {
  id: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  placeholder?: string;
  /** Minimum height of the write / preview area */
  minHeightClassName?: string;
  rows?: number;
  "aria-label"?: string;
};

export function ManagerMarkdownTextarea({
  id,
  value,
  onChange,
  disabled,
  placeholder = "Use Markdown: **bold**, lists, links, code…",
  minHeightClassName = "min-h-[140px]",
  rows = 6,
  "aria-label": ariaLabel,
}: Props) {
  return (
    <div className="space-y-1.5 w-full min-w-0 max-w-3xl">
      <p className="text-xs text-muted-foreground">
        Markdown is supported (headings, lists, links, code blocks, tables).
      </p>
      <Tabs defaultValue="write" className="w-full min-w-0">
        <TabsList className="h-8">
          <TabsTrigger value="write" className="px-2.5 text-xs">
            Write
          </TabsTrigger>
          <TabsTrigger value="preview" className="px-2.5 text-xs">
            Preview
          </TabsTrigger>
        </TabsList>
        <TabsContent value="write" className="mt-2 min-w-0">
          <Textarea
            id={id}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
            rows={rows}
            placeholder={placeholder}
            spellCheck
            className={cn(
              "resize-y w-full min-w-0 font-mono text-sm leading-relaxed",
              minHeightClassName
            )}
            aria-label={ariaLabel}
          />
        </TabsContent>
        <TabsContent value="preview" className="mt-2 min-w-0">
          <div
            className={cn(
              "rounded-md border border-border bg-card/30 px-3 py-2.5",
              minHeightClassName,
              "overflow-y-auto"
            )}
          >
            {value.trim() ? (
              <MarkdownContent markdown={value} />
            ) : (
              <p className="text-sm text-muted-foreground italic">
                Nothing to preview yet. Switch to Write to add content.
              </p>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
