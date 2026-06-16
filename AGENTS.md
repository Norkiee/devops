# Tasklist — Figma → Azure DevOps (manual)

Figma plugin that reads a **tasklist frame** and creates each list item as an Azure DevOps **Task** — set to in-progress and assigned to the person running the plugin. No AI. A dedup guard keeps re-runs from creating duplicates, and existing tasks can be **closed** from the Review screen.

This repo was split from the AI-based **TaskScribe** tool (now a separate project). It keeps the original Vercel deployment, Entra/Azure app registration, and Neon database. All Codex/AI generation has been removed.

## Architecture

```
plugin/                     # Figma plugin (React + TypeScript)
├── src/
│   ├── main.ts            # Figma sandbox: selection counts, tasklist parse, dedup pluginData
│   ├── parseTasklist.ts   # parse selected frame's text (incl. native lists) → task titles + hashes
│   ├── ui.tsx             # React entry
│   └── ui/
│       ├── App.tsx        # screen routing + create/close orchestration
│       ├── screens/       # Home, ConnectAzure, SelectProject, SelectParent, ParseTasklist, Review, Submitting, Success, PartialFailure
│       ├── components/    # Button, Input, Select, WorkItemCard, ...
│       ├── hooks/         # useFrameSelection, useAzureAuth, usePluginStorage, useAutoResize
│       └── services/      # api.ts (backend calls), storage.ts

api/                        # Vercel serverless functions (11; Hobby cap is 12)
├── azure/
│   ├── auth.ts, callback.ts, poll.ts, refresh.ts   # Microsoft Entra OAuth (polling flow)
│   ├── orgs.ts, projects.ts                         # org/project listing
│   ├── epics.ts, features.ts, stories.ts            # parent selection lists
│   ├── tasks.ts                                     # create tasks + close tasks (closeIds)
│   └── workitem.ts                                  # work item details + batch existence/state check (?ids=)
└── _lib/
    ├── azure.ts           # Azure DevOps API wrapper (create, state transition, states, existence)
    ├── auth.ts            # bearer token + CORS
    ├── db.ts              # Neon Postgres KV (OAuth token handoff only)
    ├── logger.ts, types.ts
```

## Flow

`Home → ConnectAzure → SelectProject (org + project + parent story) → ParseTasklist → Review → Submit`

1. **Parse** — user selects the tasklist frame. `main.ts`/`parseTasklist.ts` walk descendant TextNodes, detect Figma native lists via `getStyledTextSegments(['listOptions'])` (the "1." / "•" is NOT in `node.characters`), and also honor literal `1.`/`-` markers. Skips the date, the `Task` label, and hidden layers.
2. **Dedup + reconcile** — each line is hashed; the frame's `pluginData` map (`hash → azureId`) marks already-created lines. At parse time the plugin fetches those ids' current state from Azure: deleted ones re-list as new (and are pruned); existing ones are tagged open/closed.
3. **Review** — new tasks show a **Create** checkbox (editable); existing-open tasks show a **Close** checkbox; already-closed show a done badge. Footer has dual actions: **Create N** and **Close M**.
4. **Create** — Task created with parent link + assignee, in its default state, then a follow-up PATCH transitions it to the in-progress state. (Azure rejects setting a non-initial state on create.)
5. **Close** — selected open tasks are transitioned to the process's completed state.

## Process-template handling (important)

Task state names vary by process: Agile `Active`/`Closed`, Basic `Doing`/`Done`, Scrum `In Progress`/`Done`. Never hardcode. `getTaskInProgressState` / `getTaskClosedState` read the Task type's states and pick by **metastate category** (`InProgress` / `Completed`). The states API returns the category under `category` (or `stateCategory`).

## Figma sandbox gotcha

The plugin VM rejects **optional catch binding** (`catch {`). Always write `catch (e)`. After building, the minified `dist/main.js` must contain no `catch{`, `?.`, or `??`.

## Commands

```bash
cd plugin && npm run build      # production build → plugin/dist
cd plugin && npm run typecheck
npm run typecheck               # API
# Node lives at /usr/local/bin; export PATH="/usr/local/bin:$PATH" if not found
```

## Deploy

Auto-deploys from GitHub `main` → Vercel (production: `https://devops-omega-tan.vercel.app`). The plugin's API URL is baked in at build time (`plugin/webpack.config.js`); override with `TASKLIST_API_URL=...`. GitHub pushes use an HTTPS token (macOS keychain).

## Environment Variables (Vercel)

```
AZURE_CLIENT_ID=...
AZURE_CLIENT_SECRET=...
AZURE_TENANT_ID=...
AZURE_REDIRECT_URI=https://devops-omega-tan.vercel.app/api/azure/callback
AZURE_DEVOPS_RESOURCE_ID=499b84ac-1321-427f-aa17-267ca6975798
DATABASE_URL=postgres://...     # Neon (OAuth token handoff only)
```

## Notes

- Plugin `dist/` is gitignored; rebuild after source changes, then re-run the plugin in Figma (it re-reads `dist/` each run).
- Dedup detects **hard deletes** (recycle-bin / 404). A task merely set to a Removed state still exists, so it stays deduped.
- Deleting a parent **story** in Azure orphans its child tasks (and they stay deduped since the task itself still exists) — delete the **task** to make it re-list.
