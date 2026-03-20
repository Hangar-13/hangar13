#!/usr/bin/env node
/**
 * Generates SQL seed script for acs_code table from public/acs_code_info.json
 * Maps chapter numbers from JSON to ata_chapter IDs (matches 044_ata_chapter_complete order)
 */
const fs = require("fs");
const path = require("path");

// chapter_number -> id mapping (from 044_ata_chapter_complete.sql insert order)
const CHAPTER_ORDER = [
  "00", "05", "06", "07", "08", "09", "10", "11", "12", "20", "21", "22", "23", "24", "25", "26",
  "27", "28", "29", "30", "31", "32", "33", "34", "35", "36", "38", "49", "51", "52", "53", "54",
  "55", "56", "57", "61", "62", "63", "64", "65", "70", "71", "72", "73", "74", "75", "76", "77",
  "78", "79", "80", "81", "82", "83", "84", "85", "91",
];
const chapterToId = Object.fromEntries(CHAPTER_ORDER.map((ch, i) => [ch, i + 1]));

const jsonPath = path.join(__dirname, "../public/acs_code_info.json");
const data = JSON.parse(fs.readFileSync(jsonPath, "utf8"));

function escapeSql(str) {
  if (str == null) return "NULL";
  return "'" + String(str).replace(/'/g, "''") + "'";
}

/** Normalize chapter number to two digits (e.g. "9" -> "09", "51" -> "51") */
function normalizeChapterNumber(n) {
  const s = String(n).trim();
  if (s.length === 1 && /^\d$/.test(s)) return "0" + s;
  return s;
}

/** Convert chapter numbers from JSON to SQL INTEGER[] (ata_chapter IDs) */
function chapterNumbersToIds(chapterNumbers) {
  if (!Array.isArray(chapterNumbers) || chapterNumbers.length === 0) {
    return "ARRAY[]::integer[]";
  }
  const ids = [...new Set(chapterNumbers.map((n) => chapterToId[normalizeChapterNumber(n)]).filter(Boolean))].sort((a, b) => a - b);
  if (ids.length === 0) return "ARRAY[]::integer[]";
  return `ARRAY[${ids.join(",")}]::integer[]`;
}

const rows = data.map((row) => {
  const code = escapeSql(row.code);
  const domain = escapeSql(row.domain);
  const subjectLetter = escapeSql(row.subject_letter);
  const subject = escapeSql(row.subject);
  const category = escapeSql(row.category);
  const description = escapeSql(row.description);
  const ataChaptersSql = chapterNumbersToIds(row.ata_chapters || []);
  return `  (${code}, ${domain}, ${subjectLetter}, ${subject}, ${category}, ${description}, ${ataChaptersSql})`;
});

const insertSql = `INSERT INTO public.acs_code (code, domain, subject_letter, subject, category, description, ata_chapters)
VALUES
${rows.join(",\n")};
`;

const seedSql = `-- Seed ACS codes from public/acs_code_info.json
-- ata_chapters: ata_chapter IDs (resolved from chapter numbers in JSON via 044 order)
-- Clear existing ACS-related data first to avoid duplicate key errors

DELETE FROM public.logbook_entry_acs_pending;
DELETE FROM public.logbook_entry_acs;
DELETE FROM public.acs_signoff;
DELETE FROM public.acs_code;

${insertSql}
`;

const refreshSql = `-- Refresh acs_code with latest data from public/acs_code_info.json
-- ata_chapters: ata_chapter IDs (resolved from chapter numbers in JSON).
-- WARNING: This removes logbook entry ACS links and ACS signoffs.

DELETE FROM public.logbook_entry_acs_pending;
DELETE FROM public.logbook_entry_acs;
DELETE FROM public.acs_signoff;
DELETE FROM public.acs_code;

${insertSql}
`;

// Write to migrations (for pre-squash) or seed (for post-squash)
const migDir = path.join(__dirname, "../supabase/migrations");
const seedPath = path.join(__dirname, "../supabase/seed.sql");
if (fs.existsSync(migDir)) {
  const f040 = path.join(migDir, "040_seed_acs_codes.sql");
  const f041 = path.join(migDir, "041_refresh_acs_codes.sql");
  const f047 = path.join(migDir, "047_refresh_acs_codes_ids.sql");
  if (fs.existsSync(f047)) {
    fs.writeFileSync(f040, seedSql, "utf8");
    fs.writeFileSync(f041, refreshSql, "utf8");
    fs.writeFileSync(
      f047,
      `-- Re-seed acs_code after 046 (ata_chapters INTEGER[]). Uses ata_chapter IDs.
-- WARNING: This removes logbook entry ACS links and ACS signoffs.

DELETE FROM public.logbook_entry_acs_pending;
DELETE FROM public.logbook_entry_acs;
DELETE FROM public.acs_signoff;
DELETE FROM public.acs_code;

${insertSql}
`,
      "utf8"
    );
    console.log(`Generated ${data.length} rows -> ${f040}, ${f041}, ${f047}`);
  }
}
// Always update acs_code section in seed.sql if it exists (for post-squash)
if (fs.existsSync(seedPath)) {
  let seed = fs.readFileSync(seedPath, "utf8");
  const acsSection = `-- 2. ACS codes
${insertSql}`;
  const match = seed.match(/(-- 2\. ACS codes[\s\S]*?)(-- 3\.|$)/);
  if (match) {
    seed = seed.replace(match[1], acsSection + "\n\n");
    fs.writeFileSync(seedPath, seed, "utf8");
    console.log(`Updated acs_code in ${seedPath}`);
  }
}
