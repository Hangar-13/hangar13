# Talent LMS SAML troubleshooting

Hangar acts as the **SAML Identity Provider**; Talent LMS is the **Service Provider**. Learners reach Hangar IdP via Talent’s SSO login (`/api/auth/saml/talentlms/login`).

Implementation reference:

- Response attributes: [`lib/talentlms/talentlms-saml.ts`](../lib/talentlms/talentlms-saml.ts)
- Username rule (must match JIT signup + REST lookups): [`TALENTLMS_SAML_USERNAME_MODE`](../.env.example) → [`resolveTalentLmsUsername`](../lib/talentlms/talentlms-saml.ts)

---

## Error: `idp_email_already_exists`

Talent LMS reports this when the **email** from your IdP matches an **existing** learner, but Talent cannot treat the login as that same account—most often because the **username your IdP sends does not equal that user’s Talent “Login” (username)**.

Talent documents this under [Common SSO issues](https://help.talentlms.com/hc/en-us/articles/16419645852700-Common-SSO-issues) (section **“idp_email_already_exists”**):

1. **Email found, username mismatch** — Align the Talent user’s **Login** with the SAML **Username** attribute Hangar sends. In Hangar that value is **`lower(full email)`** by default (`TALENTLMS_SAML_USERNAME_MODE=email`), or **`local-part@` stripped** when `emailLocalPart`.
2. **Archived / deleted user still holding that email** — Restore the user or **permanently delete** the archived record so the email is not conflicting.

### What Hangar sends in the assertion

For a signed-in Hangar learner, the route [`app/api/auth/saml/talentlms/login/route.ts`](../app/api/auth/saml/talentlms/login/route.ts) reads `public.users.email` (fallback: Supabase Auth email), lowercases it, then sets:

| SAML piece | Typical value |
|------------|----------------|
| `NameID` (emailAddress format) | Lowercase Hangar email |
| Username attribute (OID from `TALENTLMS_SAML_ATTR_USERNAME`, default `urn:oid:1.3.6.1.4.1.5923.1.1.1.10`) | Same as JIT REST signup: [`resolveTalentLmsUsername`](../lib/talentlms/talentlms-saml.ts) |
| Email attribute | Lowercase Hangar email |
| First / last name | From `users.full_name` |

**Critical:** Talent’s SAML admin UI field that maps **“Username” / TargetedID** must bind to **the same attribute name/OID** Hangar emits (`TALENTLMS_SAML_ATTR_USERNAME`). If Talent maps Username to the wrong SAML attribute, it may see email from another mapping but mismatch on login—Talent then surfaces errors like `idp_email_already_exists`.

Use Talent’s **Save and Check configuration** (or equivalent SAML trace) to confirm the inbound **Username**, **Email**, **First name**, **Last name** values match expectation.

### Fix checklist

1. In Talent: **Users** → locate the learner by email → confirm **Login** equals what Hangar would send (`email` vs `emailLocalPart` rule above).
2. If Login is wrong but the account must be kept: **change Login in Talent** to match Hangar policy (recommended: full lowercase email, consistent with Hangar SSO + JIT enrollment).
3. If the account was created before you standardized logins: update Login or merge users per your Talent licensing/support process.
4. In Talent SSO settings: verify **Username attribute mapping** matches [`TALENTLMS_SAML_ATTR_*`](../lib/talentlms/saml-config.ts) overrides in Hangar `.env`.
5. If the email points at an **archived** Talent user: restore or permanently delete per Talent docs, then retry.

---

## Finding the fix without guessing (recommended)

Talent’s **`idp_email_already_exists`** always comes down to a **triple match** Hangar asserts vs what Talent has:

1. **Email** attribute / NameID ↔ learner’s email in Talent  
2. **`samlUsername`** (SAML Username attribute) ↔ learner’s **Login** in Talent (character-for-character, after your `usernameMode` rule)  
3. Talent’s SSO screen maps **Username** ↔ the OID/name Hangar actually sends (`TALENTLMS_SAML_ATTR_USERNAME`)

### Step A — See exactly what Hangar sends (temporary)

**The logs appear on whichever host receives the SAML redirect from Talent.** Talent’s admin “Identity provider URL” is usually your **production** origin. In that case **`npm run dev`** on your laptop never sees the request → **no terminal lines**. Use the flag on **Vercel** (or temporarily repoint Talent’s IdP URL at a tunnel → your local port—rarely worth it).

Also, **`npm run dev:live`** only loads **`.env.live.local`** (see `scripts/dev-live.mjs`). Putting the flag only in `.env.local` won’t apply to `dev:live`.

1. Set **`TALENTLMS_SAML_DIAGNOSTIC_LOGGING=true`** on the environment that Talent’s IdP URL points at, deploy, reproduce **one** “Review lesson” → SAML login.  
2. Open **function / server logs** for that deployment and search for **`[TALENTLMS_SAML_DIAGNOSTIC]`**. The first line **`IdP route hit on this server`** proves the request reached that server; if you **never** see it, the browser is still hitting **another** URL (e.g. production).  
3. The next log line (after you’re signed in) includes **`emailNormalized`** and **`samlUsername`**.  
4. **Remove the env var** (`false` / unset) and redeploy as soon as you’re done — it logs **PII**.

You can confirm in the browser **Network** panel: after “Login with SAML 2.0”, the navigation request’s URL should match the host where you’re looking at logs (**`localhost`** vs **`https://your-prod-domain`**`). The JSON log also includes `usernameMode` and `attrUsernameOid` / `attrEmailOid`.

### Step B — Compare to Talent

1. In Talent: learner with that **`emailNormalized`** → read **Login** → compare **exact string** to **`samlUsername`**. Fix whichever side is wrong (usually change Talent **Login** to match Hangar’s `samlUsername` if policy is full-email logins).
2. In Talent SSO: **Save and check configuration** (or SAML trace). Confirm Talent’s inbound **Username** value equals **`samlUsername`** from step A and that the **OID mapping** matches `attrUsernameOid`.

### Step C — bisect Hangar releases (only if A/B disagree with reality)

Deploy a **Vercel preview** (or local prod build) pinned to Git commit **`22d0975`** (or another known-good SHA), **reuse the same production env vars**, and retry SSO. Same error → problem is env/Talent data, not only Hangar SAML code churn. Different behavior → correlate with commits after that SHA (often cookie / middleware).

---

## “It worked in the browser, then broke in a webview”

Hangar → Talent LMS SSO is **full browser redirects** (`*.talentlms.com` → your Hangar origin → Talent again) with cookies on the Hangar domain. **Embedded WebViews** (in-app browsers, shells, hybrid wrappers) often use a **separate cookie and storage partition** from the device’s Safari/Chrome profile, impose **stricter third‑party cookie** rules, or clear state between launches. Symptoms look like endless login loops, Hangar showing signed-out on the SAML hop, or Talent errors—even when the flow works in a normal desktop/mobile browser.

**Expectation:** treat Talent SSO as requiring the **system browser** (Safari / Chrome): open Hangar training in Safari, or use **`target="_blank"`** so the LMS opens next to Hangar rather than trapping the SSO chain inside an embedded viewer. If you previously tested only in Safari and later opened the **same Hangar URLs inside a WebView**, that alone can explain regressions unrelated to SAML attribute tuning.

---

## Related

- Hangar identity policy (email vs Talent login): [`docs/domain-concepts.md`](./domain-concepts.md) (“Talent LMS learner identity”).
- SAML metadata URL Hangar publishes: `{APP_ORIGIN}/api/auth/saml/talentlms/metadata`
