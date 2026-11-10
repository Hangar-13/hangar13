import { unzipSync } from "fflate";
import { DOMParser } from "@xmldom/xmldom";

const MAX_FILES = 500;
const MAX_UNCOMPRESSED_BYTES = 80 * 1024 * 1024;

export type ParsedScormPackage = {
  title: string;
  schemaVersion: string;
  masteryScore: number | null;
  launchPath: string;
  scoCount: number;
  files: Record<string, Uint8Array>;
};

function localName(nodeName: string | null | undefined): string {
  if (!nodeName) return "";
  const i = nodeName.indexOf(":");
  return (i >= 0 ? nodeName.slice(i + 1) : nodeName).toLowerCase();
}

type XmlNode = {
  nodeType: number;
  nodeName: string | null;
  childNodes: { length: number; item(index: number): XmlNode | null };
  textContent?: string | null;
  getAttribute?(name: string): string | null;
};

function firstByLocalName(node: XmlNode, name: string): XmlNode | null {
  const want = name.toLowerCase();
  const stack: XmlNode[] = [node];
  while (stack.length) {
    const cur = stack.shift()!;
    if (cur.nodeType === 1 && localName(cur.nodeName) === want) {
      return cur;
    }
    const kids = cur.childNodes;
    for (let i = 0; i < kids.length; i++) {
      const kid = kids.item(i);
      if (kid) stack.push(kid);
    }
  }
  return null;
}

function elementsByLocalName(node: XmlNode, name: string): XmlNode[] {
  const want = name.toLowerCase();
  const found: XmlNode[] = [];
  const stack: XmlNode[] = [node];
  while (stack.length) {
    const cur = stack.shift()!;
    if (cur.nodeType === 1 && localName(cur.nodeName) === want) {
      found.push(cur);
    }
    const kids = cur.childNodes;
    for (let i = 0; i < kids.length; i++) {
      const kid = kids.item(i);
      if (kid) stack.push(kid);
    }
  }
  return found;
}

function attr(node: XmlNode | null | undefined, name: string): string {
  const value = node?.getAttribute?.(name);
  return typeof value === "string" ? value.trim() : "";
}

function textOf(node: { textContent?: string | null } | null): string {
  return (node?.textContent ?? "").replace(/\s+/g, " ").trim();
}

function normalizeEntries(
  raw: Record<string, Uint8Array>
): Record<string, Uint8Array> {
  const names = Object.keys(raw).filter((name) => name.length > 0 && !name.endsWith("/"));
  if (names.length === 0) {
    throw new Error("The zip has no files.");
  }
  if (names.length > MAX_FILES) {
    throw new Error(`The zip has more than ${MAX_FILES} files.`);
  }

  for (const name of names) {
    if (name.includes("\\") || name.split("/").includes("..")) {
      throw new Error("The zip contains an unsafe path.");
    }
  }

  const manifest = names.find(
    (name) =>
      name.toLowerCase() === "imsmanifest.xml" ||
      name.toLowerCase().endsWith("/imsmanifest.xml")
  );
  if (!manifest) {
    throw new Error("The zip is missing imsmanifest.xml.");
  }

  const slash = manifest.lastIndexOf("/");
  const prefix = slash >= 0 ? manifest.slice(0, slash + 1) : "";
  let total = 0;
  const files: Record<string, Uint8Array> = {};

  for (const name of names) {
    if (prefix && !name.startsWith(prefix)) {
      throw new Error("The zip has files outside the manifest folder.");
    }
    const rel = prefix ? name.slice(prefix.length) : name;
    if (!rel || rel.split("/").includes("..")) {
      throw new Error("The zip contains an unsafe path.");
    }
    const bytes = raw[name];
    total += bytes.byteLength;
    if (total > MAX_UNCOMPRESSED_BYTES) {
      throw new Error("The unzipped package is too large.");
    }
    files[rel] = bytes;
  }

  return files;
}

function parseMastery(item: XmlNode): number | null {
  const node = firstByLocalName(item, "masteryscore");
  if (!node) return null;
  const n = Number.parseFloat(textOf(node));
  return Number.isFinite(n) ? n : null;
}

export function parseScormZip(bytes: Uint8Array): ParsedScormPackage {
  let raw: Record<string, Uint8Array>;
  try {
    raw = unzipSync(bytes);
  } catch {
    throw new Error("That file is not a zip archive.");
  }

  const files = normalizeEntries(raw);
  const manifestBytes = files["imsmanifest.xml"];
  if (!manifestBytes) {
    throw new Error("The zip is missing imsmanifest.xml.");
  }

  const xml = new TextDecoder().decode(manifestBytes).replace(/^\uFEFF/, "");
  const doc = new DOMParser().parseFromString(xml, "text/xml");
  const manifest = firstByLocalName(doc, "manifest");
  if (!manifest) {
    throw new Error("imsmanifest.xml has no manifest element.");
  }

  const schemaVersion =
    textOf(firstByLocalName(manifest, "schemaversion")) || "1.2";
  if (schemaVersion !== "1.2") {
    throw new Error(
      `This player accepts SCORM 1.2 packages. This file is version ${schemaVersion}.`
    );
  }

  const organizations = firstByLocalName(manifest, "organizations");
  const defaultOrgId = attr(organizations, "default");
  const orgs = organizations ? elementsByLocalName(organizations, "organization") : [];
  const org =
    orgs.find((el) => attr(el, "identifier") === defaultOrgId) ?? orgs[0];
  if (!org) {
    throw new Error("The manifest has no organization.");
  }

  const items = elementsByLocalName(org, "item");
  const resources = elementsByLocalName(manifest, "resource");
  const resourceById = new Map<string, XmlNode>();
  for (const resource of resources) {
    const id = attr(resource, "identifier");
    if (id) resourceById.set(id, resource);
  }

  const scos: { href: string; title: string; mastery: number | null }[] = [];
  for (const item of items) {
    const ref = attr(item, "identifierref");
    if (!ref) continue;
    const resource = resourceById.get(ref);
    const href = attr(resource, "href");
    if (!href || href.includes("..")) continue;
    const title = textOf(firstByLocalName(item, "title")) || href;
    scos.push({ href, title, mastery: parseMastery(item) });
  }

  if (scos.length === 0) {
    throw new Error("The manifest has no launchable item.");
  }

  const launch = scos[0];
  if (!files[launch.href]) {
    throw new Error(`The launch file ${launch.href} is not in the zip.`);
  }

  const orgTitle = textOf(firstByLocalName(org, "title"));

  return {
    title: orgTitle || launch.title || "Lesson",
    schemaVersion,
    masteryScore: launch.mastery,
    launchPath: launch.href,
    scoCount: scos.length,
    files,
  };
}
