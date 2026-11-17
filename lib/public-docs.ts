import fs from "node:fs";
import path from "node:path";

export type PublicDoc = {
  name: string;
  href: string;
  bytes: number;
  extension: string;
};

const DOCS_DIR = path.join(process.cwd(), "public", "docs");

/** Files dropped in `public/docs/` and served at `/docs/<filename>`. */
export function listPublicDocs(): PublicDoc[] {
  if (!fs.existsSync(DOCS_DIR)) return [];

  return fs
    .readdirSync(DOCS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isFile() && !entry.name.startsWith("."))
    .map((entry) => {
      const bytes = fs.statSync(path.join(DOCS_DIR, entry.name)).size;
      const extension = path.extname(entry.name).replace(/^\./, "").toLowerCase();
      return {
        name: entry.name,
        href: `/docs/${encodeURIComponent(entry.name)}`,
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
