/**
 * Loads `.env.live.local` and runs `next dev`.
 * Avoids `node --env-file=...`: that flag is not allowed inside NODE_OPTIONS, which Next
 * worker processes inherit from .env files or the shell (copy/paste from Vercel, etc.).
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";
import dotenv from "dotenv";

const envPath = resolve(process.cwd(), ".env.live.local");

if (!existsSync(envPath)) {
  console.error(
    "Missing .env.live.local. Create it from .env.example / Vercel (see README \"dev:live\")."
  );
  process.exit(1);
}

const loaded = dotenv.config({ path: envPath, override: true });
if (loaded.error) {
  console.error(loaded.error.message);
  process.exit(1);
}

const opts = process.env.NODE_OPTIONS;
if (opts && /--env-file\b/.test(opts)) {
  const cleaned = opts.replace(/\s*--env-file(?:=\S*)?/g, " ").trim();
  if (cleaned) {
    process.env.NODE_OPTIONS = cleaned;
  } else {
    delete process.env.NODE_OPTIONS;
  }
}

const nextBin = resolve(process.cwd(), "node_modules/next/dist/bin/next");
const child = spawn(process.execPath, [nextBin, "dev"], {
  stdio: "inherit",
  env: process.env,
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
  }
  process.exit(code ?? 1);
});
