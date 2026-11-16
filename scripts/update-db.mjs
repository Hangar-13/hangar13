/**
 * Push Supabase migrations to one database.
 *
 *   npm run update-db -- local
 *   npm run update-db -- staging
 *   npm run update-db -- prod
 *   npm run update-db -- prod --yes
 *
 * Remote targets link that project, then push. Local pushes to the stack from
 * `supabase start` and does not change the linked project.
 */
import { spawnSync } from "node:child_process";
import readline from "node:readline/promises";
import process from "node:process";

const TARGETS = {
  prod: {
    label: "production",
    name: "Hangar 13",
    ref: "nehpaeebasijyzcafkoz",
  },
  production: {
    label: "production",
    name: "Hangar 13",
    ref: "nehpaeebasijyzcafkoz",
  },
  staging: {
    label: "staging",
    name: "Hangar 13 Staging",
    ref: "iwlkanmqoxlarjkvllvk",
  },
  local: {
    label: "local",
    name: "local Supabase",
    ref: null,
  },
};

function usage() {
  console.log(`Usage: npm run update-db -- <prod|staging|local> [--yes]

  prod      ${TARGETS.prod.name} (${TARGETS.prod.ref})
  staging   ${TARGETS.staging.name} (${TARGETS.staging.ref})
  local     local database from supabase start`);
}

function supabase(args) {
  const result = spawnSync("npx", ["supabase", ...args], {
    stdio: "inherit",
  });
  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

const args = process.argv.slice(2).filter((arg) => arg !== "--");
const yes = args.includes("--yes");
const targetName = args.find((arg) => !arg.startsWith("--"));
const target = targetName ? TARGETS[targetName] : null;

if (!target) {
  usage();
  process.exit(targetName ? 1 : 0);
}

if (target.ref && target.label === "production" && !yes) {
  if (!process.stdin.isTTY) {
    console.error("Refusing to push production without --yes.");
    process.exit(1);
  }
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = (await rl.question(`Push migrations to production ${target.ref}? Type prod to continue: `)).trim();
  rl.close();
  if (answer !== "prod") {
    console.error("Cancelled.");
    process.exit(1);
  }
}

const yesFlag = yes ? ["--yes"] : [];

if (!target.ref) {
  console.log("Target: local");
  console.log("npx supabase db push");
  supabase(["db", "push", ...yesFlag]);
} else {
  console.log(`Target: ${target.label} (${target.name})`);
  console.log(`Ref: ${target.ref}`);
  console.log(
    `npx supabase link --project-ref ${target.ref} && npx supabase db push --remote`
  );
  supabase(["link", "--project-ref", target.ref, ...yesFlag]);
  supabase(["db", "push", "--remote", ...yesFlag]);
}
