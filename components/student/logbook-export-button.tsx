"use client";

import { useState } from "react";
import { FileDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { AtaChapterItem } from "./ata-chapter-coverage";
import { LogbookExportModal } from "./logbook-export-modal";
import type { LogbookExportEntry } from "@/lib/logbook-export";

type Props = {
  studentName: string;
  entries: LogbookExportEntry[];
  ataChapters: AtaChapterItem[];
  acsCodesByEntry: Record<string, string[]>;
};

export function LogbookExportButton({
  studentName,
  entries,
  ataChapters,
  acsCodesByEntry,
}: Props) {
  const [exportOpen, setExportOpen] = useState(false);

  return (
    <>
      <Button type="button" variant="outline" onClick={() => setExportOpen(true)}>
        <FileDown className="mr-2 h-4 w-4" />
        Print / Export Logs
      </Button>
      <LogbookExportModal
        open={exportOpen}
        onOpenChange={setExportOpen}
        studentName={studentName}
        entries={entries}
        ataChapters={ataChapters}
        acsCodesByEntry={acsCodesByEntry}
      />
    </>
  );
}
