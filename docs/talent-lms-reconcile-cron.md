# Talent LMS reconcile cron (polling)

Hangar includes a periodic job that pulls Talent LMS course completion into `lesson_submissions` (`/api/cron/talent-lesson-completion`). **Polling is opt-in**: it stays off unless you enable it in env and schedule.

## Enable

1. **Deploy env:** set **`TALENTLMS_RECONCILE_CRON_ENABLED=true`** (Production on Vercel and anywhere else that invokes the route).
2. **Vercel schedule:** add a **`crons`** entry in **`vercel.json`**, for example:

```json
{
  "crons": [
    {
      "path": "/api/cron/talent-lesson-completion",
      "schedule": "*/15 * * * *"
    }
  ]
}
```

Pacific “~5am and ~noon” behavior is gated **inside** the route (`lib/talentlms/reconcile-schedule.ts`); the platform cron only needs to run often enough for that gate to see those windows.

3. Confirm **`SUPABASE_SERVICE_ROLE_KEY`**, **`TALENTLMS_API_KEY`**, and **`TALENTLMS_SUBDOMAIN`** are set on the deployment.

## Disable again

1. **`TALENTLMS_RECONCILE_CRON_ENABLED`** unset or `false`.
2. **`vercel.json` → `"crons": []`** so Vercel does not invoke the endpoint on a timer.
