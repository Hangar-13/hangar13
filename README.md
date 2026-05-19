This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Which backend am I talking to?

You do **not** need to ship every UI tweak to production to exercise real integrations.

### Everyday local development (`npm run dev`)

Uses `.env.local` (gitignored). Point these at a dev Supabase project and Talent sandbox if you have them, or at production credentials when you accept writing real prod data from localhost.

### Same code against production APIs (`npm run dev:live`)

1. Requires **Node 20.9+** (matches Next.js 16).
2. Create **`.env.live.local`** (gitignored) with the full variable set you want—typically a copy of production/Vercel env vars edited so **`APP_ORIGIN`** is `http://localhost:3000` (or whatever host/port you use). SAML metadata and Talent redirects must match what you actually open in the browser.
3. Run:

```bash
npm run dev:live
```

The script loads `.env.live.local` into the process environment, then starts `next dev`. Next’s own env loader only fills in keys that are **not** already set, so values from `.env.live.local` keep precedence over `.env.local` for the same names.

**If you see** `--env-file= is not allowed in NODE_OPTIONS`: Node forbids that flag inside `NODE_OPTIONS`. Remove any `NODE_OPTIONS=...--env-file...` from `.env.live.local` (common when pasting env exports), or `unset NODE_OPTIONS` in your shell. The dev script strips `--env-file` from `NODE_OPTIONS` when possible, but fixing the source avoids surprises.

### Preview deploys (no production deploy)

[Vercel Preview](https://vercel.com/docs/deployments/environments#preview-environment-variables) branches give you HTTPS URLs and env isolation—often enough to validate integrations without touching the production deployment.

### Env template

See [`.env.example`](./.env.example) for variable names used by this app.

### Test Talent LMS REST lookup (no Postman)

From the repo root, with `TALENTLMS_SUBDOMAIN` and `TALENTLMS_API_KEY` in `.env.local` (or another file):

```bash
npm run talent:probe -- learner@example.com
npm run talent:probe -- --env-file=.env.live.local learner@example.com
npm run talent:probe -- --env-file=.env.live.local --user-id=4 learner@example.com
npm run talent:probe -- --env-file=.env.live.local --user-id=4
```

The optional **`--user-id`** runs **`GET .../users/id:N`** first (same [Talent API family](https://market.talentlms.com/pages/docs/TalentLMS-API-Documentation.pdf) as `/users/email:` / `/users/username:`). Use it when Admin shows `/plus/users/4` but email/username return 404 — then compare the JSON **`login`** / **`email`** fields to what you probe.

This runs [`scripts/talent-lms-api-probe.mjs`](./scripts/talent-lms-api-probe.mjs): same Basic auth and `/users/email:` then `/users/username:` attempts as the app (including `TALENTLMS_SAML_USERNAME_MODE` username variants).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
