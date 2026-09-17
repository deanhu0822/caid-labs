# Persistent engineering change workflow

`/changes` implements request → measurable requirements → alternatives → evidence → independent review → immutable design revision. A configured persistent server uses it as the homepage; the previous sample interface remains at `/graph`. Without durable storage, the existing production homepage remains the sample graph.

## Run locally

Requires Node 22.13 or newer, including `node:sqlite` (experimental in Node 22). No additional runtime dependency is introduced.

1. Install dependencies and run `npm run dev`.
2. Before starting the server, set `FORMA_CHANGE_SETUP_TOKEN` to a cryptographically random value of at least 32 characters, e.g. generated with `openssl rand -hex 32`. Keep it out of source control.
3. Open `/changes`, enter the setup token, and create the owner account. Setup is disabled permanently once a user exists; remove the token from the environment after setup.
4. Sign in. Add an individual account for each reviewer using **Add a team member**. Deliver initial credentials privately. Passwords must contain 12–200 characters. This is a basic local account system; email addresses are identifiers, not verified email ownership.
5. Create a request with a stable product ID and the external baseline document reference. Save requirements and alternatives; then add verification evidence, assign reviewers, and submit.
6. Each reviewer signs in separately and records a decision with rationale. The author can save the revision only after all assigned reviewers approve. The artifact values, evidence, decisions, and hash can be exported as JSON.

Development storage defaults to `.forma/changes.sqlite` (ignored by Git). This is server-side SQLite, not browser storage. Refreshing a page or restarting the server preserves records.

## Production hosting contract

This first storage adapter is for **one persistent Node host**, with SQLite on a durable local volume. It is deliberately disabled on Vercel: function-local disk is not durable shared storage. Do not configure a temporary path to work around that guard.

Required production configuration:

- `FORMA_CHANGE_DB`: absolute database path on a durable volume, writable only by the application account.
- `FORMA_CHANGE_ORIGIN`: exact public origin, including scheme and port if applicable; use HTTPS in production. Requests from other origins are rejected. HTTPS origins receive Secure session cookies.
- `FORMA_CHANGE_SETUP_TOKEN`: one-time bootstrap secret, only until the first owner has been created.

Build with `npm run build -- --webpack`, then run the Next server normally. Serve it behind HTTPS. Back up SQLite using its backup API or stop the application before copying the database and WAL files. A single durable host is required; do not share the database over a network filesystem or run independent copies on multiple hosts.

To ship this workflow on the current Vercel deployment, replace the SQLite adapter with a managed transactional database and preserve its authorization, version checks, immutable revision snapshots, and atomic product-head updates. No infrastructure or credentials were provisioned by this change.

## Data and trust boundaries

- Authentication added here protects `/api/changes` only. Existing sample graph and inference endpoints keep their previous access behavior.
- One installation is one team workspace. Authenticated members can read all changes and revisions. There is no organization tenancy or project-level access partition.
- Individual accounts use salted scrypt password hashes. Opaque eight-hour sessions are hashed in storage, HttpOnly, and SameSite Strict. Logout revokes the session. Login/setup attempts have a coarse installation-wide limit. It is intentionally a small-team starting point, not enterprise identity: SSO, MFA, email verification, account removal, recovery, and password rotation are not implemented yet.
- The author alone edits, submits, rebases, and saves a request. Assigned users other than the author record review decisions. Owner privileges permit account creation, not bypassing change approval.
- All mutations require the record version being viewed. Reloading the register does not silently update the editor's expected version. Stale actions return 409 and preserve unsaved editor text.
- Every edit clears prior reviews. Changes to requirements, alternatives, or the selected alternative clear existing evidence. Rebasing clears evidence and reviews. Attach replacement evidence after saving design changes.
- Submission requires at least two alternatives, a selected alternative and rationale, artifact changes, independent reviewers, and passing non-reference evidence for every requirement. Any failing result blocks submission. Review requests for changes stop revision saving.
- Evidence records carry type, requirement ID, numeric result, source locator and revision, method, and limitations. Values and sources are supplied by the author; the app does **not** fetch, run, or independently verify them. A green comparison means only that the entered result meets the entered numeric target. Reviewers must verify scope, operating conditions, units, uncertainty, and source credibility.
- Saving runs in a single `BEGIN IMMEDIATE` transaction with a baseline check. Concurrent requests cannot both advance the same product baseline. Known artifact before-values must match the current saved manifest. The saved manifest accumulates selected artifact after-values across revisions.
- Baseline 0 is an external design described in the request. This does not import the full CAD/BOM or synchronize the sample graph. Saved revisions are design-change records, not generated CAD files or manufacturing releases.
- Revision snapshots retain the complete request, alternatives, evidence, reviewer decisions, artifact manifest, and SHA-256 digest. They are immutable through the application; a database administrator can still modify the underlying database. The digest is not an electronic signature or third-party attestation.
- Activity records identify the actor, action, timestamp, and record version. They track actions, not full historical draft snapshots; submitted and saved evidence is retained in the final revision.

## Verification

- `node --test tests/change-workflow.test.cjs tests/revision-approval.test.cjs`
- `npm run lint`
- `npx tsc --noEmit`
- `npm run build -- --webpack`
- `node scripts/verify-change-http.mjs` (after building; starts a separate local server with disposable test storage)

The workflow tests use disposable SQLite databases and cover persistence across reopen, approval isolation, all assigned reviewers, stale writes, replay, missing/failing/reference evidence, edit invalidation, concurrent baselines, rebase, artifact baseline consistency, immutable revisions, snapshot digest, session expiry/revocation, and malformed input. Browser verification uses explicitly synthetic local test records, not the live engineering dataset.
