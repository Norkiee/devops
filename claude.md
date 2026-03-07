# Sync — Figma to Azure DevOps Plugin

Figma plugin that converts design frames into Azure DevOps work items (Epics, Features, User Stories, Tasks) using Claude AI.

## Architecture

```
plugin/                     # Figma plugin (React + TypeScript)
├── src/
│   ├── main.ts            # Figma API access (selection, storage)
│   └── ui/                # React UI
│       ├── App.tsx        # Main app, screen routing
│       ├── screens/       # 9 screens (home → success)
│       ├── hooks/         # useFrameSelection, useAzureAuth, etc.
│       └── services/api.ts # Backend API calls

api/                        # Vercel serverless functions
├── generate.ts            # POST /api/generate (Claude AI)
├── azure/                 # Azure DevOps endpoints
│   ├── auth.ts, callback.ts, poll.ts, refresh.ts  # OAuth flow
│   ├── orgs.ts, projects.ts                       # Org/project listing
│   ├── epics.ts, features.ts, stories.ts, tasks.ts # Work items
│   └── workitem.ts                                # Work item details
└── _lib/
    ├── azure.ts           # Azure DevOps API wrapper
    ├── claude.ts          # Claude API with retry logic
    ├── auth.ts            # Token validation, CORS
    └── redis.ts           # Redis client (ioredis)
```

## User Flow

1. Select frames/sections in Figma
2. Choose work item type (Epic, Feature, User Story, Task)
3. Connect to Azure DevOps (Microsoft Entra ID OAuth)
4. Select org, project, and parent (combined screen)
5. Add optional context
6. Generate work items (Claude AI)
7. Review, edit, submit to Azure DevOps

## Key Technical Details

**Process Template Support:** Agile (User Story), Scrum (Product Backlog Item), CMMI (Requirement), Basic (Issue)

**Hierarchy:**
- Epic → Feature → User Story → Task
- Parent selection is dynamic based on work item type
- Tasks show optional Epic filter for User Story selection

**OAuth:** Polling-based flow (not postMessage) for Figma compatibility
- Plugin generates state UUID
- Opens popup to `/api/azure/auth`
- Polls `/api/azure/poll` until complete
- Tokens stored in Redis, sessionId in plugin storage

**Auto-assignment:** All work items auto-assigned to current user

## Commands

```bash
# Plugin
cd plugin && npm run dev    # Watch mode
cd plugin && npm run build  # Production build

# API (local)
vercel dev

# Deploy (auto on push to main)
git push
```

## Environment Variables (Vercel)

```
ANTHROPIC_API_KEY=sk-ant-...
AZURE_CLIENT_ID=...
AZURE_CLIENT_SECRET=...
AZURE_TENANT_ID=common
AZURE_REDIRECT_URI=https://devops-psi.vercel.app/api/azure/callback
AZURE_DEVOPS_RESOURCE_ID=499b84ac-1321-427f-aa17-267ca6975798
REDIS_URL=redis://...
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/generate` | POST | Generate work items from frames |
| `/api/azure/auth` | GET | Start OAuth flow |
| `/api/azure/poll` | GET | Poll for OAuth completion |
| `/api/azure/refresh` | POST | Refresh access token |
| `/api/azure/orgs` | GET | List organizations |
| `/api/azure/projects` | GET | List projects, work item types, tags |
| `/api/azure/epics` | GET/POST | List/create epics |
| `/api/azure/features` | GET/POST | List/create features |
| `/api/azure/stories` | GET/POST | List/create stories |
| `/api/azure/tasks` | POST | Create tasks |
| `/api/azure/workitem` | GET | Get work item details |

## Frame Data Extraction

```typescript
interface FrameData {
  id: string;
  name: string;
  sectionName?: string;        // Parent section name
  textContent: string[];       // Text layers (max 30)
  componentNames: string[];    // Component instances (max 20)
  nestedFrameNames: string[];  // Child frame names (max 10)
  width: number;
  height: number;
}
```

## Notes

- Plugin dist files (`plugin/dist/`) are gitignored; rebuild after source changes
- 60s function timeout for Claude retry logic
- Redis uses atomic `kvGetDel` for OAuth polling (prevents race conditions)
- Story-like types: User Story, Product Backlog Item, Requirement, Issue
