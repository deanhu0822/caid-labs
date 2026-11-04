# Caid Labs — evidence-linked workspace

This local workspace explores hardware engineering objectives using attached images and PDFs. An Anthropic-powered workflow drafts editable alternatives with evidence links, tradeoffs, and review steps. The dashboard's product graph provides an overview and focused artifact inspector; the rover is an optional synthetic reference.

**Release status: early development.** This is a local, single-user application, not a production team deployment. Supabase identity verification and workspace-record endpoints are development foundations; sign-in, shared review UI, authenticated analysis, shared attachments, and production operations are not complete. Generated suggestions and relationships require human review. No physical engineering result or release approval is implied.

## Hosted browser preview

On Vercel the workspace is available at `/workspace`. It stores drafts and attachments in that browser and uses local source-text drafting; it does not run live Anthropic analysis or share work between people. Use the local workflow below for the implemented live analysis path. The earlier graph remains at `/graph`.

## Run locally

Requires Node.js 26 or newer.

```sh
npm ci
cp .env.example .env.local
# Add your own ANTHROPIC_API_KEY to .env.local.
npm run build
npm start
```

Open http://127.0.0.1:5173/. On macOS, `Start Demo.command` builds and opens the local workspace after dependencies are installed. Keep the server running while using it. The API binds to loopback. Do not expose it to a network: the existing analysis endpoints do not authenticate users.

`ANTHROPIC_API_KEY` stays on the server. Never commit `.env.local`, user files, database contents, or generated run outputs. Live analysis sends the user's objective and selected source files to Anthropic and incurs provider charges. Without a configured provider, the live path fails visibly; the separate local drafting option is explicitly identified.

## Workflow

1. Describe the objective and attach images or documents.
2. Run live analysis to assemble evidence, draft alternatives, and review the result; one repair and a final review are bounded stages.
3. Edit the resulting proposal and inspect evidence at the linked image or PDF page. Visual interpretations and model-generated relationships remain unverified.
4. Open Product graph from the dashboard, focus an artifact, and use its inspector to start a change with the available source context.
5. Save and reopen reviews in the same browser or export Markdown. Originals are stored separately in browser storage and are not embedded in the export.

The server validates source references against a catalog derived from original files; source linkage does not establish engineering correctness. A recorded air-monitor example using a manufacturer guide and image completed a live review and a one-case replay in the original local workspace. That is a smoke test, not a general accuracy benchmark. The original user recordings, source PDFs, saved reviews, and run traces are intentionally not included in this public source tree.

## Limits and storage

Live analysis accepts up to eight sources, 10 MB per file, 5 MB per image, and 24 MB in total. PDF extraction is limited to 30 pages and 120,000 text characters per file. Drafts, reviews, and source blobs use browser IndexedDB; server-side analysis snapshots and feedback use `data/analysis.sqlite`. They are local storage, not shared team storage or backups. The server keeps inputs on failure and does not silently substitute a sample response.

The workspace persistence prototype enforces membership, roles, and version checks in test cases. It is not wired into the UI and does not support shared attachments. Real Supabase sign-in and cross-user access have not been verified. No autonomous physical changes, self-training, or automatic model promotion are implemented.

## Verification

```sh
npm test
npm run test:server
npm run build
```

The server tests use simulated identity and model providers, plus a small first-party PDF fixture. They do not prove a real Supabase session or team deployment. Live analysis requires configured credentials and sends real paid requests.

## Main modules

- `src/App.tsx`, `src/components/AssemblyGraph.tsx`: objective, review, and graph flow.
- `src/analysis-client.ts`, `src/domain.ts`, `src/storage.ts`: submissions, provenance, editable reviews, and local browser storage.
- `server/harness.mjs`, `server/evidence.mjs`: bounded analysis stages, provider adapter, and evidence catalog.
- `server/identity.mjs`, `server/workspaces.mjs`: preliminary identity verification and workspace persistence boundaries.
- `server/index.mjs`: local static server and API.

This workspace is maintained alongside the existing Caid Labs application at the repository root. Its run commands and dependencies are independent of that application.
