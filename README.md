# Korea Master's Command Center

A private, evidence-first planning workspace for a Bangladeshi CSE applicant targeting a September 2027 Master's intake in South Korea, with additional research leads in Germany and France. The current MVP includes an editable applicant profile, shortlist and comparison, scholarship/funding opportunity records with evidence-first ranking and filters, application stages, task/calendar views, editable KRW/EUR/BDT budget scenarios, document checklist, professor outreach tracker, official-source register, export, local persistence, optional Supabase Auth/database sync, a private Storage bucket, and a scheduled-source-refresh Edge Function.

## Important data limits

- The SNU, KAIST, and UNIST rows and the TUM, Paris-Saclay, and Grenoble MOSIG international rows are clearly identified **starter research leads**, not recommendations or verified 2027 program/funding facts. Official source pages are starting points only. Verify each program, language, intake, deadlines, and funding yourself.
- Official pages were inspected on 20 October 2026: SNU's [graduate program directory](https://en.snu.ac.kr/academics/programs/graduate), KAIST's [international graduate admissions](https://admission.kaist.ac.kr/intl-graduate/), SNU's [scholarship overview](https://en.snu.ac.kr/academics/resources/scholarships), and the [Study in Korea portal](https://www.studyinkorea.go.kr/ko/main.do). SNU's scholarship overview identifies itself as last updated in 2023, so it is treated as historical. The reviewed pages do not establish Fall 2027 admission or funding terms. The UNIST institutional homepage is not an admissions notice. The Korean Embassy in Bangladesh page could not be retrieved during this check. No GKS 2027 graduate notice was confirmed.
- No Fall 2027 deadline, tuition, fee, eligibility, funding amount, professor availability, or application outcome has been populated. Unknown means unknown; it is not an estimate.
- The **Scholarships & funding** view starts with three Korean graduate-program leads and a GKS 2027 notice-to-verify lead. These are not verified scholarship claims: language rules, MOI acceptance, funding components, eligibility match, and Fall 2027 availability remain unknown. The default view prioritizes verified full funding with IELTS not required and a strong profile match; when none qualify, it labels the closest records as alternatives. A full-funding status requires complete applicable cost coverage, an official quotation, a confirmed source, and verified Fall 2027 applicability.
- The opportunity editor keeps IELTS requirement, IELTS waiver, MOI acceptance and scope, alternative tests, scores, validity, and language deadlines separate. It also tracks tuition, living stipend, housing, insurance, airfare, mandatory fees, upfront cash, renewal/termination conditions, conflicts, verification date, and admissions-office questions. Applicant IELTS information is self-reported; no score or booking is inferred.
- The research workspace supports South Korea (Fall 2027), Germany (Winter Semester 2027/28), and France (Autumn 2027). It includes initial research leads for TUM Informatics, Paris-Saclay Computer Science, and Grenoble MOSIG with official source links; these are not recommendations or confirmation that a particular program is offered in English for 2027. Program dates and national scholarship rules must be checked against the relevant official notice.
- The `.xlsx` importer reads the `Ranked university list`, `Application requirements`, and `Timeline` sheets locally in the browser. Imported entries and workbook URLs are unverified leads; broad timeline ranges become undated tasks, never exact calendar deadlines. A CGPA discrepancy between the workbook and profile generates a review task and does not overwrite either value.
- Profile settings include the public portfolio, GitHub, LinkedIn, contact email, CV link, skills, and experience. These are editable; they are not independently verified by the application.
- Official-source search is a secured server-side Brave Search proxy. Search snippets are leads, not verified facts, and searches are restricted to official-source domains. Search requires Supabase authentication and a server-side Brave API key; the key must never be placed in a `VITE_*` variable.
- A successful HTTP fetch only records a timestamp/status/content hash and a bounded plain-text page snapshot. It never verifies a source or changes a confirmed fact. Changed page hashes set `needs_review` and create a `source_changes` record with the previous and new snapshots for manual review.
- Only record a fact as confirmed after reviewing the cited official source and confirming its intake and relevance. Preserve previous evidence when a page changes.
- Browser-only local mode stores workspace state in local storage; do not treat it as a secure vault. Authenticated accounts sync budget scenarios, document checklist metadata and private files, and professor contacts to owner-scoped Supabase tables.
- The professor CRM does not send email. Browser task reminders are best-effort while the site is open; they are not delivered by email or a background scheduler.

## Local development

Requirements: Node.js 20.19+ (or 22.12+) and npm.

```powershell
npm.cmd install
npm.cmd run dev
```

Open the local URL printed by Vite. Without credentials, the application works in local browser-storage mode. Duplicate `.env.example` to `.env.local` and set:

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_YOUR_KEY
```

Restart Vite after changing environment values. Only the publishable key belongs in the browser; never expose a secret key, service-role key, database password, or scheduler secret in `VITE_*` variables. `VITE_SUPABASE_ANON_KEY` remains supported for older local setups.

## Supabase setup

1. Create a Supabase project. Keep Auth email/password enabled and configure its redirect/confirmation settings for your deployment.
2. Apply migrations with the Supabase CLI (`supabase db push`) or SQL editor, in filename order. `20261020000000_initial_schema.sql` creates normalized user-owned tables, owner-scoped RLS, an auth profile trigger, and a private document bucket with UID-folder policies. `20261021000000_international_research.sql` adds country/intake and editable profile research metadata, plus a private search cache and rate limiter. `20261022000000_account_portability_and_source_review.sql` creates the owner-scoped budget scenario and adds document availability and bounded source-change snapshots. `20261023000000_scholarship_opportunities.sql` creates the owner-scoped opportunity-record store with RLS. `20261024000000_masters_application_readiness.sql` adds profile readiness fields, program/application details, and the authenticated account-export RPC. `20261025000000_realtime_opportunity_alerts.sql` adds scholarship opportunity rows to Supabase Realtime when the `supabase_realtime` publication exists. The browser uses a publishable key; RLS is the authorization boundary.
3. Set the two `VITE_*` values above. After signing in, universities, program requirements and recommendation tracking, application status, tasks, budget scenarios, scholarship/funding opportunity records, document checklist metadata, and professor contacts load from and persist to the user's Supabase account. If a migration is not applied, account data displays a load/save error rather than claiming cloud sync is active. Guest mode stays local to that browser.
4. Deploy the refresh function with gateway JWT verification enabled:

   ```powershell
   supabase functions deploy refresh-sources
   supabase secrets set REFRESH_ALLOWED_HOSTS=snu.ac.kr,kaist.ac.kr,unist.ac.kr,gist.ac.kr,postech.ac.kr,seoultech.ac.kr,knu.ac.kr,studyinkorea.go.kr,mofa.go.kr
   ```

   `REFRESH_ALLOWED_HOSTS` is a comma-separated allowlist of trusted official hostnames; redirects are revalidated against it. Add a university hostname only after confirming it is the institution's official domain. Supabase injects the URL and server API keys into Edge Functions. Manual refresh requires a signed-in user. Scheduled refresh is not enabled in this project; do not disable gateway JWT verification to schedule it without an explicit security review.
5. Scheduled refresh is not configured. The deployed function requires Supabase gateway JWT verification, so do not call it from an unauthenticated cron job or disable gateway verification. Manual refresh requires a signed-in user. Each run checks at most six URLs, one URL per hostname, applies conditional HTTP caching, retries transient failures up to three times, and rate-limits between hosts. Per-source checks have a five-minute cooldown. Inspect `refresh_logs` and `source_changes`. The function monitors URLs recorded in `source_evidence`; add reviewed official source URLs through authenticated CRUD or SQL under the correct `user_id`. Successful refreshes retain at most 20,000 characters of plain-text page evidence for before/after comparison; this is source-page evidence only and does not update or verify structured facts.
6. In the signed-in **Documents** view, upload PDF/JPG/PNG files up to 20 MB. Files are stored in the private `private-documents` bucket under the authenticated user's UUID and opened using 60-second signed URLs. Do not make the bucket public.
7. To enable live official-domain research, add your Brave Search API credential as a Supabase function secret, deploy the Edge Function, and sign in:

   ```powershell
   supabase secrets set BRAVE_SEARCH_API_KEY=YOUR_BRAVE_SEARCH_API_KEY
   supabase functions deploy search-official-sources
   ```

   The search function authenticates the user's JWT, validates country/query input, restricts results to approved official domains (and domains from that user's manually confirmed university evidence), caps result count and query length, uses a per-user cache, and rate-limits calls. It does not confirm facts or ingest results into the university database. Search will remain unavailable until the migration, secret, function, Supabase Auth, and frontend project configuration are all in place.
8. To enable permanent account deletion, run `supabase functions deploy delete-my-account` with JWT verification enabled (the default). This function authenticates the caller, removes their private document objects through the Storage API, then deletes their Auth account (which cascades owner-scoped database rows). It uses Supabase's server-provided service-role secret only inside the Edge Function; never put that key in a frontend variable. If file removal fails, the function leaves the account intact and returns an error. The file removal and Auth deletion cannot be one atomic transaction; if Auth deletion fails after storage cleanup, retry after investigating the returned error. Test only with a disposable account before production use.

## Workbook import and international research

In **University research**, choose **Import .xlsx** and select the applicant's workbook. Review the preview and any CGPA warning before confirming. The workbook is parsed locally, and the original file is not uploaded or modified. Existing starter examples with matching names are enriched; existing non-example universities are not overwritten. Imported claims stay explicitly unverified and must be checked against the university's current graduate admissions, program, lab, and scholarship sources before entering decisions or exact dates.

The authenticated budget scenario, document checklist metadata, program/application readiness fields, and professor CRM sync to the signed-in user's Supabase account. The budget saves after a short pause in editing; currencies are stored as separate user-selected scenarios (KRW, EUR, or BDT), with no conversion. Documents store checklist fields and private Storage paths; uploaded bytes are not included in JSON backups. Professor contacts support add, edit, and remove; no email is sent. In the guest workspace these records remain browser-local.

Use **Export account backup** before major changes. The JSON backup includes the workspace and metadata, and signed-in exports include the RLS-visible account rows. It does not contain uploaded file bytes. Restore is currently restricted to a guest browser; signed-in cloud restore is not automatic. Import validates the backup structure but is not a merge or account migration.

Browser reminders check tasks and entered university deadlines up to seven days ahead, plus scholarship deadlines only when their Fall 2027 application deadline has confirmed evidence. They run while this site is open, with browser notifications enabled; they are not a background scheduler, email, or guaranteed delivery service. Signed-in users receive Supabase Realtime alerts for new opportunity rows and rows that improve in the app's evidence-aware ranking. This watches only records in that user's account; it does not discover new scholarships from external websites. Source pages still need a manual refresh, and changes need human review. Calendar dates only appear when entered. Do not treat any starter task date or scholarship deadline as an official deadline.

In **Sources & reports**, manually refresh tracked sources and review any changed page in **Source-change review queue**. Compare the retained plain-text captures and SHA-256 hashes, then open the official source. Marking a change reviewed or dismissed only closes that queue item and, when no changes remain pending for that URL, clears its review flag. It does not update a deadline, scholarship term, or verification status; update those facts manually after confirming the source.

The persistent context pack is stored in `docs/project-context/`. Its 25 Korean university candidates and six-phase roadmap load as planning records in a new local workspace. Existing local workspaces can add missing entries with **Import Korea context** in University research. In an authenticated workspace, this action compares normalized university names and task titles in Supabase, then inserts only missing records through the existing university → program → application → source-evidence and task tables. Existing database values and applicant profile fields are left untouched. Candidate program details, cities, deadlines, tuition, and funding remain unknown unless the context pack supplies a historical lead; those leads are explicitly labeled historical and still require current official verification.

Use the country filter to compare the Korean shortlist with separately researched Germany and France options. The search page defaults to English-taught master's queries and only returns official-domain search leads. A result does not establish that a program is available in English for the target intake, that funding covers living expenses, or that a listed contact is current. Add confirmed program and funding evidence manually after reviewing the linked official page. For GKS, do not apply Embassy- or University-track rules until the relevant official 2027 graduate notice has been published and reviewed.

## Build and deployment

```powershell
npm.cmd run build
npm.cmd test
npm.cmd run preview
```

Deploy the `dist` directory to a static host configured for SPA fallback, set the two public Supabase environment variables in the host, and configure Auth redirect URLs for the deployed domain. Deploy the Edge Function separately with the Supabase CLI. Database access is protected by RLS; never bundle privileged secrets. Review your database backup and retention settings with your Supabase project configuration.

## Current MVP boundaries

- Research entries and official sources in the starter data are examples and start unverified. Source refresh checks page changes, not structured facts, and does not resolve conflicting claims.
- University, program/application readiness, task, budget, document-metadata/file, scholarship-opportunity, and professor-contact persistence are wired to Supabase. Requirements can store per-intake evidence, program requirements can link to applicant document metadata, and recommendation letters, submission dates, decisions, and next actions are tracked. These are applicant-entered planning records, not automatically verified admissions facts.
- Account export and account deletion require the latest migration and deployed Edge Function. Back up first; deletion is permanent and has not been tested against a live project from this repository. Validate the migration and function on a disposable Supabase project before launch.
- Privacy, retention, backup, Auth, storage, and incident-response settings must be reviewed for the actual deployment. The privacy document is a technical checklist and notice draft, not legal advice or a jurisdiction-specific compliance determination.
- Funding charts and costs remain blank until you enter verified or explicitly labeled planning values. The calculator is an editable annual scenario, not financial advice and not yet linked to evidence records.
- Test workflows manually after configuring a project; no credentials or official-source facts are bundled.
