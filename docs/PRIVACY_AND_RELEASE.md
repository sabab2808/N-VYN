# Privacy and release checklist

This is a product-specific technical notice draft and release checklist, not legal advice. The site owner must identify the responsible organization, select the hosting and Supabase regions, set retention periods, and have the final notice reviewed for the laws that apply to the deployment before collecting real applicant data.

## Data handled by the application

Depending on what the applicant enters, the workspace can contain contact and profile details, education history, test dates and scores, budget amounts, program and scholarship research, application notes, recommender contact details, document checklist metadata, and uploaded passport or academic files.

- In guest mode, workspace data is stored in the current browser's local storage. It is not encrypted by this app and can be lost when browser data is cleared or exposed to other users of the same device.
- In signed-in mode, account records are stored in the configured Supabase project. Row-level security policies scope database records to the authenticated user. Authentication tokens are managed by the Supabase client in browser storage.
- Uploaded PDF/JPG/PNG files are stored in the private `private-documents` Supabase Storage bucket, under a user-specific path. The application requests a short-lived signed URL when opening a file. Do not make this bucket public.
- An exported JSON backup is downloaded to the applicant's device. It contains applicant/workspace information and, when signed in, the account export returned by Supabase. It does not include uploaded file bytes. Protect and delete the downloaded backup as carefully as the original records.
- The optional official-source search feature sends a query and selected country to the deployed `search-official-sources` function and its configured search provider. Search results are unverified leads. Do not include passwords, passport numbers, private document contents, or other sensitive personal data in a search query.
- The source-refresh function fetches URLs that the signed-in user has stored as official-source evidence. It stores bounded text snapshots and hashes for change comparison; this does not verify the facts on those pages.
- The application does not send professor emails, recommendation requests, or email reminders. Browser notifications are best-effort while the site is open.

## Retention, access, and deletion

Applicants can export account data from the account controls. Restore currently works only in a guest browser and is not a cloud merge. Applicants can request permanent account deletion through the deployed `delete-my-account` function. That function removes private objects through the Storage API before deleting the Auth user and cascading database records. The process is not atomic: if storage cleanup succeeds and Auth deletion subsequently fails, the account remains but its uploaded files have been removed. Investigate and communicate the returned error; do not claim deletion succeeded unless the function reports success.

Database backups, logs, search caches, email-authentication records, and provider retention are controlled partly by the actual Supabase, hosting, and search-provider settings. Review those retention and backup settings separately. Document the support contact, response process, retention schedule, and any processor disclosures in the published privacy notice.

## Before collecting real applicant data

- [ ] Replace this draft with a reviewed privacy notice naming the data controller, contact address, purposes, legal basis where applicable, processors, hosting regions, retention period, user rights, and complaint route.
- [ ] Confirm the Supabase project region, Auth email settings, production redirect URLs, backup retention, log retention, and recovery procedures.
- [ ] Keep the Supabase service-role key and Brave API key only in server-side Supabase Function secrets. Never expose them through `VITE_*` variables or commit them.
- [ ] Apply and inspect every database migration in a disposable project first. Confirm all owner-scoped RLS policies and storage policies with two separate test accounts.
- [ ] Deploy `delete-my-account` with JWT verification enabled. Test deletion using a disposable account with nested uploaded files; verify the Storage API removes the objects and the Auth user and database rows disappear.
- [ ] Test account export and guest restore with non-sensitive fixture data. Confirm that exported data is readable, complete for the documented scope, and contains no file bytes or another user's records.
- [ ] Test private-file upload, signed-URL access, cross-account denial, removal, and account cleanup. Never test destructive actions on a real applicant account.
- [ ] Verify all external sources, application requirements, language evidence, costs, and deadlines against official, intake-specific pages. Mark unknown or historical facts honestly; do not promote a lead to a verified recommendation based on link availability alone.
- [ ] Check keyboard access, screen-reader labels, contrast, responsive layouts, error reporting, and production SPA routing.
- [ ] Establish a process for security updates, incident response, user support, and honoring data-export/deletion requests.

## Release verification performed in this workspace

The repository build and static TypeScript checks are run with `npm.cmd run build`. A successful local build does not validate Supabase SQL against a live schema, deploy Edge Functions, confirm RLS behavior, test account deletion, or establish legal compliance. Those release checks require a disposable configured Supabase project and the deployment-specific settings above.
