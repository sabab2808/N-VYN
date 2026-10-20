# Korea Master's Command Center

A private, evidence-first planning workspace for a Bangladeshi CSE applicant targeting a September 2027 Master's intake in South Korea, with additional research leads in Germany and France. The current MVP includes an editable applicant profile, shortlist and comparison, application stages, task/calendar views, editable KRW/EUR/BDT budget scenarios, document checklist, professor outreach tracker, official-source register, export, local persistence, optional Supabase Auth/database sync, a private Storage bucket, and a scheduled-source-refresh Edge Function.

## Important data limits

- The SNU, KAIST, and UNIST rows and the TUM, Paris-Saclay, and Grenoble MOSIG international rows are clearly identified **starter research leads**, not recommendations or verified 2027 program/funding facts. Official source pages are starting points only. Verify each program, language, intake, deadlines, and funding yourself.
- Official pages were inspected on 20 October 2026: SNU's [graduate program directory](https://en.snu.ac.kr/academics/programs/graduate), KAIST's [international graduate admissions](https://admission.kaist.ac.kr/intl-graduate/), SNU's [scholarship overview](https://en.snu.ac.kr/academics/resources/scholarships), and the [Study in Korea portal](https://www.studyinkorea.go.kr/ko/main.do). SNU's scholarship overview identifies itself as last updated in 2023, so it is treated as historical. The reviewed pages do not establish Fall 2027 admission or funding terms. The UNIST institutional homepage is not an admissions notice. The Korean Embassy in Bangladesh page could not be retrieved during this check. No GKS 2027 graduate notice was confirmed.
- No Fall 2027 deadline, tuition, fee, eligibility, funding amount, professor availability, or application outcome has been populated. Unknown means unknown; it is not an estimate.
- The research workspace supports South Korea (Fall 2027), Germany (Winter Semester 2027/28), and France (Autumn 2027). It includes initial research leads for TUM Informatics, Paris-Saclay Computer Science, and Grenoble MOSIG with official source links; these are not recommendations or confirmation that a particular program is offered in English for 2027. Program dates and national scholarship rules must be checked against the relevant official notice.
- The `.xlsx` importer reads the `Ranked university list`, `Application requirements`, and `Timeline` sheets locally in the browser. Imported entries and workbook URLs are unverified leads; broad timeline ranges become undated tasks, never exact calendar deadlines. A CGPA discrepancy between the workbook and profile generates a review task and does not overwrite either value.
- Profile settings include the public portfolio, GitHub, LinkedIn, contact email, CV link, skills, and experience. These are editable; they are not independently verified by the application.
- Official-source search is a secured server-side Brave Search proxy. Search snippets are leads, not verified facts, and searches are restricted to official-source domains. Search requires Supabase authentication and a server-side Brave API key; the key must never be placed in a `VITE_*` variable.
- A successful HTTP fetch only records a timestamp/status/content hash. It never verifies a source or changes a confirmed fact. Changed page hashes set `needs_review` and create a `source_changes` record.
- Only record a fact as confirmed after reviewing the cited official source and confirming its intake and relevance. Preserve previous evidence when a page changes.
- The browser-only local mode stores workspace state in local storage. Do not use it for confidential files. Metadata fields in some MVP pages remain browser-local until full CRUD screens are connected.
- No email is sent by the professor CRM. It does not dispatch reminders, either; reminder scheduling is a backend extension point.

## Local development

Requirements: Node.js 20.19+ (or 22.12+) and npm.

```powershell
npm.cmd install
npm.cmd run dev
```

Open the local URL printed by Vite. Without credentials, the application works in local browser-storage mode. Duplicate `.env.example` to `.env.local` and set:

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
```

Restart Vite after changing environment values. Only the public anon key belongs in the browser; never expose a service-role key, database password, or scheduler secret in `VITE_*` variables.

## Supabase setup

1. Create a Supabase project. Keep Auth email/password enabled and configure its redirect/confirmation settings for your deployment.
2. Apply migrations with the Supabase CLI (`supabase db push`) or SQL editor, in filename order. `20261020000000_initial_schema.sql` creates normalized user-owned tables, owner-scoped RLS, an auth profile trigger, and a private document bucket with UID-folder policies. `20261021000000_international_research.sql` adds country/intake and editable profile research metadata, plus a private search cache and rate limiter. The browser uses the anon key; RLS is the authorization boundary.
3. Set the two `VITE_*` values above. The UI loads and persists the university and task records it edits for an authenticated user. Other record surfaces are currently local-only; their tables and access policies are prepared in the migration.
4. Deploy the refresh function:

   ```powershell
   supabase functions deploy refresh-sources --no-verify-jwt
   supabase secrets set REFRESH_JOB_SECRET=YOUR_LONG_RANDOM_SECRET REFRESH_ALLOWED_HOSTS=snu.ac.kr,kaist.ac.kr,unist.ac.kr,studyinkorea.go.kr,mofa.go.kr,cit.tum.de,daad.de,uni-assist.de,hochschulkompass.de,campusfrance.org,campusfrance.com,gouv.fr,universite-paris-saclay.fr,mosig.imag.fr
   ```

   The function verifies a user's JWT itself for manual calls. The `--no-verify-jwt` flag allows the scheduled request to use the separate server-only `x-job-secret`; configure a long random value and do not reuse an account password. `REFRESH_ALLOWED_HOSTS` must be a comma-separated allowlist of trusted official hostnames; redirects are revalidated against it, so a user-supplied source cannot make the privileged job fetch arbitrary hosts. The listed European domains cover a few official university pages and study-information portals, not all universities. Add a university hostname only after confirming it is the institution's official domain. The function also needs the Supabase-provided server secrets `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`.
5. Enable `pg_cron`, `pg_net`, and Vault in Supabase. Store the function endpoint and scheduler secret in Vault; never paste these values into this repository. Example SQL after saving the Vault secrets `refresh_function_url` and `refresh_job_secret`:

   ```sql
   select cron.schedule(
     'refresh-official-sources-daily',
     '15 2 * * *',
     $job$
       select net.http_post(
         url := (select decrypted_secret from vault.decrypted_secrets where name = 'refresh_function_url'),
         headers := jsonb_build_object(
           'Content-Type', 'application/json',
           'x-job-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'refresh_job_secret')
         ),
         body := '{}'::jsonb,
         timeout_milliseconds := 180000
       );
     $job$
   );
   ```

   Set the daily hour to a quiet time appropriate for your project. Each run checks at most six URLs, one URL per hostname, applies conditional HTTP caching, retries transient failures up to three times, and rate-limits between hosts. Per-source checks have a five-minute cooldown. Inspect `refresh_logs` and `source_changes`. The `refresh-sources` function currently monitors URLs recorded in `source_evidence`; add reviewed official source URLs through authenticated CRUD or SQL under the correct `user_id`.
6. For document uploads, use the private `private-documents` bucket and paths beginning with the authenticated user's UUID. Access must use authenticated Storage APIs/signed URLs; never make the bucket public. Current UI documents are metadata-only and do not upload files.
7. To enable live official-domain research, add your Brave Search API credential as a Supabase function secret, deploy the Edge Function, and sign in:

   ```powershell
   supabase secrets set BRAVE_SEARCH_API_KEY=YOUR_BRAVE_SEARCH_API_KEY
   supabase functions deploy search-official-sources
   ```

   The search function authenticates the user's JWT, validates country/query input, restricts results to approved official domains (and domains from that user's manually confirmed university evidence), caps result count and query length, uses a per-user cache, and rate-limits calls. It does not confirm facts or ingest results into the university database. Search will remain unavailable until the migration, secret, function, Supabase Auth, and frontend project configuration are all in place.

## Workbook import and international research

In **University research**, choose **Import .xlsx** and select the applicant's workbook. Review the preview and any CGPA warning before confirming. The workbook is parsed locally, and the original file is not uploaded or modified. Existing starter examples with matching names are enriched; existing non-example universities are not overwritten. Imported claims stay explicitly unverified and must be checked against the university's current graduate admissions, program, lab, and scholarship sources before entering decisions or exact dates.

The persistent context pack is stored in `docs/project-context/`. Its 25 Korean university candidates and six-phase roadmap load as planning records in a new local workspace. Existing local workspaces can add missing entries with **Import Korea context** in University research. In an authenticated workspace, this action compares normalized university names and task titles in Supabase, then inserts only missing records through the existing university → program → application → source-evidence and task tables. Existing database values and applicant profile fields are left untouched. Candidate program details, cities, deadlines, tuition, and funding remain unknown unless the context pack supplies a historical lead; those leads are explicitly labeled historical and still require current official verification.

Use the country filter to compare the Korean shortlist with separately researched Germany and France options. The search page defaults to English-taught master's queries and only returns official-domain search leads. A result does not establish that a program is available in English for the target intake, that funding covers living expenses, or that a listed contact is current. Add confirmed program and funding evidence manually after reviewing the linked official page. For GKS, do not apply Embassy- or University-track rules until the relevant official 2027 graduate notice has been published and reviewed.

## Build and deployment

```powershell
npm.cmd run build
npm.cmd run preview
```

Deploy the `dist` directory to a static host configured for SPA fallback, set the two public Supabase environment variables in the host, and configure Auth redirect URLs for the deployed domain. Deploy the Edge Function separately with the Supabase CLI. Database access is protected by RLS; never bundle privileged secrets. Review your database backup and retention settings with your Supabase project configuration.

## Current MVP boundaries

- Research entries and official sources in the starter data are examples and start unverified. Source refresh checks page changes, not structured facts, and does not resolve conflicting claims.
- Only university and task CRUD are currently wired to Supabase. Applications are represented by university stage in the UI. Document upload, recurring reminders, notification delivery, activity streaks, complete application evidence/decision forms, professor/contact persistence, and secured backup export need follow-on implementation before relying on the product as a complete production system.
- Funding charts and costs remain blank until you enter verified or explicitly labeled planning values. The calculator is an editable annual scenario, not financial advice and not yet linked to evidence records.
- Test workflows manually after configuring a project; no credentials or official-source facts are bundled.
