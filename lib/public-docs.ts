import fs from "node:fs";
import path from "node:path";

export type PublicDoc = {
  name: string;
  displayName: string;
  href: string;
  previewHref: string | null;
  bytes: number;
  extension: string;
};

/** `1_Curriculum_Framework_1.docx` → `Curriculum Framework`. */
export function displayDocName(filename: string): string {
  const base = filename.replace(/\.[^.]+$/, "");
  return base
    .replace(/^\d+_/, "")
    .replace(/_\d+$/, "")
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();
}

const DOCS_DIR = path.join(process.cwd(), "public", "docs");
const PREVIEW_DIR = path.join(process.cwd(), "public", "marketing", "doc-previews");

/** Files dropped in `public/docs/` and served at `/docs/<filename>`. */
export function listPublicDocs(): PublicDoc[] {
  if (!fs.existsSync(DOCS_DIR)) return [];

  return fs
    .readdirSync(DOCS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isFile() && !entry.name.startsWith("."))
    .map((entry) => {
      const bytes = fs.statSync(path.join(DOCS_DIR, entry.name)).size;
      const extension = path.extname(entry.name).replace(/^\./, "").toLowerCase();
      const previewName = `${entry.name}.png`;
      const previewHref = fs.existsSync(path.join(PREVIEW_DIR, previewName))
        ? `/marketing/doc-previews/${encodeURIComponent(previewName)}`
        : null;
      return {
        name: entry.name,
        displayName: displayDocName(entry.name),
        href: `/docs/${encodeURIComponent(entry.name)}`,
        previewHref,
        bytes,
        extension,
      };
    })
    .sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" })
    );
}

export function formatDocSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) {
    const kb = bytes / 1024;
    return `${kb < 10 ? kb.toFixed(1) : Math.round(kb)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
