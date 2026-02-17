# DevOps Sync — Figma to Azure DevOps Plugin

## Project Overview

DevOps Sync is a Figma plugin that allows UI/UX designers to convert design work directly into Azure DevOps tasks with minimal manual effort. The plugin uses Claude AI to analyze selected frames and generate task titles and descriptions, then pushes them to Azure DevOps with user confirmation.

### Problem Statement

Designers create screens in Figma but must manually log tasks in Azure DevOps afterward. Azure DevOps' task creation is click-heavy, form-driven, and disruptive to creative workflow. This results in wasted time, context switching, and poor/delayed task documentation.

### Solution

A Figma plugin that:
1. Reads selected frames (names, text layers, component names)
2. Uses Claude AI to generate task drafts
3. Connects to Azure DevOps via OAuth
4. Pushes tasks to a user-selected story with tags

### Target Users

- UI/UX Designers
- Product Designers
- Design teams working within Azure DevOps environments

---

## Technical Architecture

### System Components

```
┌─────────────────────────────────────────────────────────────────┐
│                         FIGMA PLUGIN                            │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │   UI Layer  │  │ Plugin API  │  │  Figma Plugin Sandbox   │  │
│  │   (React)   │◄─┤  (iframe)   │◄─┤  (main.ts - node-like)  │  │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘  │
└───────────────────────────┬─────────────────────────────────────┘
                            │ HTTPS
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                    VERCEL SERVERLESS                            │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │ /api/       │  │   Claude    │  │   Azure DevOps          │  │
│  │ generate.ts │  │   Service   │  │   Service               │  │
│  │ azure/*.ts  │  │  (_lib/)    │  │  (_lib/)                │  │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘  │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                    Redis (ioredis)                      │    │
│  │              (OAuth token storage)                      │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
                            │
              ┌─────────────┴─────────────┐
              ▼                           ▼
    ┌─────────────────┐         ┌─────────────────┐
    │   Claude API    │         │  Azure DevOps   │
    │   (Anthropic)   │         │      API        │
    └─────────────────┘         └─────────────────┘
```

### Why Vercel?

- **Serverless**: No server management, auto-scaling
- **Edge functions**: Low latency for API calls
- **Easy deployment**: Git push to deploy
- **Free tier**: Sufficient for MVP and small teams

### Tech Stack

| Component | Technology |
|-----------|------------|
| Figma Plugin UI | React + TypeScript |
| Figma Plugin Logic | TypeScript (main.ts) |
| Backend | Vercel Serverless Functions (Node.js) |
| AI | Claude API (claude-sonnet-4-20250514) |
| Database | Redis (ioredis) for token storage |
| Auth | Azure DevOps OAuth 2.0 (polling-based flow) |

---

## Project Structure

```
devops-sync/
├── plugin/                     # Figma plugin
│   ├── src/
│   │   ├── main.ts            # Plugin entry (Figma API access)
│   │   ├── ui/
│   │   │   ├── App.tsx        # Main React app
│   │   │   ├── screens/
│   │   │   │   ├── HomeScreen.tsx
│   │   │   │   ├── ContextScreen.tsx
│   │   │   │   ├── GeneratingScreen.tsx
│   │   │   │   ├── ConnectAzureScreen.tsx
│   │   │   │   ├── SelectStoryScreen.tsx
│   │   │   │   ├── ReviewScreen.tsx
│   │   │   │   ├── SubmittingScreen.tsx
│   │   │   │   ├── SuccessScreen.tsx
│   │   │   │   └── PartialFailureScreen.tsx
│   │   │   ├── components/
│   │   │   │   ├── Button.tsx
│   │   │   │   ├── Input.tsx
│   │   │   │   ├── Select.tsx
│   │   │   │   ├── Tag.tsx
│   │   │   │   ├── TaskCard.tsx
│   │   │   │   ├── FrameChip.tsx
│   │   │   │   └── LoadingSpinner.tsx
│   │   │   ├── hooks/
│   │   │   │   ├── useFrameSelection.ts
│   │   │   │   ├── useAzureAuth.ts
│   │   │   │   └── usePluginStorage.ts
│   │   │   ├── services/
│   │   │   │   ├── api.ts     # Backend API calls
│   │   │   │   └── storage.ts # Plugin clientStorage wrapper
│   │   │   ├── types/
│   │   │   │   └── index.ts
│   │   │   └── styles/
│   │   │       └── globals.css
│   │   └── ui.tsx             # UI entry point
│   ├── manifest.json          # Figma plugin manifest
│   ├── package.json
│   ├── tsconfig.json
│   └── webpack.config.js
│
├── api/                        # Vercel serverless functions
│   ├── generate.ts            # POST /api/generate
│   ├── azure/
│   │   ├── auth.ts            # GET /api/azure/auth
│   │   ├── callback.ts        # GET /api/azure/callback
│   │   ├── poll.ts            # GET /api/azure/poll (polling-based OAuth)
│   │   ├── refresh.ts         # POST /api/azure/refresh
│   │   ├── orgs.ts            # GET /api/azure/orgs
│   │   ├── projects.ts        # GET /api/azure/projects
│   │   ├── stories.ts         # GET /api/azure/stories
│   │   ├── tags.ts            # GET /api/azure/tags
│   │   └── tasks.ts           # POST /api/azure/tasks
│   └── _lib/                  # Shared utilities (not exposed as routes)
│       ├── claude.ts          # Claude API wrapper
│       ├── azure.ts           # Azure DevOps API wrapper
│       ├── auth.ts            # Token validation helpers
│       ├── redis.ts           # Redis client wrapper (ioredis)
│       └── types.ts           # Shared types
│
├── vercel.json                 # Vercel configuration
├── package.json                # Root package.json for API dependencies
├── tsconfig.json
└── README.md
```

---

## Data Models

### Frame Data (Plugin → Backend)

```typescript
interface FrameData {
  id: string;
  name: string;
  textContent: string[];        // Extracted text layers (max 30)
  componentNames: string[];     // Component instances used (max 20)
  nestedFrameNames: string[];   // Named child frames for structure context (max 10)
  width: number;
  height: number;
}

interface GenerateRequest {
  frames: FrameData[];
  context?: string;             // Optional user-provided context
}
```

### Generated Task (Backend → Plugin)

```typescript
interface TaskItem {
  id: string;                  // Unique ID for UI (e.g., "frame123-task1")
  title: string;
  description: string;
  selected: boolean;           // User can deselect tasks before submission
}

interface FrameTasks {
  frameId: string;
  frameName: string;
  tasks: TaskItem[];
}

interface GenerateResponse {
  frameTasks: FrameTasks[];
}
```

### Azure DevOps Task (Plugin → Backend → Azure)

```typescript
interface AzureTask {
  title: string;
  description: string;
  parentStoryId: number;
  tags: string[];
  state: 'New';               // Always 'New' for MVP
}

interface CreateTasksRequest {
  projectId: string;
  tasks: AzureTask[];
}

interface CreateTaskResult {
  frameId: string;
  success: boolean;
  taskId?: number;
  taskUrl?: string;
  error?: string;
}
```

### Plugin Storage (Persisted)

```typescript
interface PluginStorage {
  azureProjectId?: string;
  azureOrg?: string;          // Selected organization
  lastStoryId?: number;
  frequentTags?: string[];    // Top 5 most used
  sessionId?: string;         // Server session ID for token refresh
}
```

> **Note:** Access tokens are stored in memory (React state) for security, not in plugin storage. The `sessionId` is used to refresh tokens via the server.

---

## API Endpoints

### Backend Routes

#### `POST /api/generate`

Generate task drafts from frame data using Claude.

**Request:**
```json
{
  "frames": [
    {
      "id": "123:456",
      "name": "Login Screen",
      "textContent": ["Email", "Password", "Sign In", "Forgot password?"],
      "componentNames": ["Input", "Button", "Link"],
      "width": 375,
      "height": 812
    }
  ],
  "context": "User onboarding flow for mobile app"
}
```

**Response:**
```json
{
  "frameTasks": [
    {
      "frameId": "123:456",
      "frameName": "Login Screen",
      "tasks": [
        {
          "id": "123:456-1",
          "title": "Build login form layout",
          "description": "Create form with email and password input fields, sign-in button, and forgot password link. Ensure proper spacing and alignment.",
          "selected": true
        },
        {
          "id": "123:456-2",
          "title": "Implement form validation",
          "description": "Add client-side validation for email format and required fields. Display inline error messages below each input.",
          "selected": true
        },
        {
          "id": "123:456-3",
          "title": "Add forgot password flow",
          "description": "Implement forgot password link that navigates to password reset screen or opens modal.",
          "selected": true
        }
      ]
    }
  ]
}
```

#### `GET /api/azure/auth`

Initiates Azure DevOps OAuth flow. Redirects to Azure.

#### `GET /api/azure/callback`

OAuth callback. Exchanges code for tokens, stores refresh token in Redis, and stores auth result for polling.

#### `GET /api/azure/poll?state={state}`

Polling endpoint for OAuth completion. The plugin polls this endpoint after opening the OAuth popup.

**Response (pending):**
```json
{
  "status": "pending"
}
```

**Response (complete):**
```json
{
  "status": "complete",
  "sessionId": "uuid",
  "accessToken": "..."
}
```

#### `GET /api/azure/orgs`

Fetch user's Azure DevOps organizations. Auto-fetched on Select Story screen.

**Response:**
```json
{
  "orgs": ["my-org", "another-org"]
}
```

#### `GET /api/azure/projects`

Fetch user's Azure DevOps projects.

**Response:**
```json
{
  "projects": [
    { "id": "proj-123", "name": "Design System" }
  ]
}
```

#### `GET /api/azure/stories?projectId={id}`

Fetch active user stories for a project.

**Response:**
```json
{
  "stories": [
    { "id": 1234, "title": "User Authentication Flow", "state": "Active" }
  ]
}
```

#### `GET /api/azure/tags?projectId={id}`

Fetch existing tags for a project.

**Response:**
```json
{
  "tags": ["UI", "Design", "Frontend", "Bug", "P1"]
}
```

#### `POST /api/azure/tasks`

Create tasks in Azure DevOps.

**Request:**
```json
{
  "projectId": "proj-123",
  "tasks": [
    {
      "title": "Implement login screen UI",
      "description": "Create login form...",
      "parentStoryId": 1234,
      "tags": ["UI", "Design"],
      "state": "New"
    }
  ]
}
```

**Response:**
```json
{
  "results": [
    {
      "frameId": "123:456",
      "success": true,
      "taskId": 5678,
      "taskUrl": "https://dev.azure.com/org/project/_workitems/edit/5678"
    }
  ]
}
```

---

## Vercel Serverless Function Examples

### api/generate.ts

```typescript
import { VercelRequest, VercelResponse } from '@vercel/node';
import Anthropic from '@anthropic-ai/sdk';
import { FrameData, FrameTasks } from './_lib/types';

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const SYSTEM_PROMPT = `You are a technical task generator for UI/UX design work. Given information about a design frame from Figma, analyze the content and generate clear, actionable tasks for developers.

Break down the frame into logical implementation tasks. Generate 1-5 tasks depending on complexity:
- Simple frames (few elements, single purpose): 1-2 tasks
- Medium frames (forms, multiple sections): 2-3 tasks  
- Complex frames (dashboards, multi-feature screens): 3-5 tasks

Guidelines:
- Each task should be independently implementable
- Task titles should be concise and action-oriented (start with a verb)
- Descriptions should be 2-3 sentences covering what to build and key considerations
- Don't create tasks that are too granular (e.g., "Style the submit button" is too small)
- Don't create tasks that are too broad (e.g., "Build the entire screen")
- Group related elements into cohesive tasks
- Focus on implementation details, not design decisions
- Mention specific UI elements, states, and interactions
- Do not include estimates or assignees
- Keep language professional and clear

Output JSON format:
{
  "tasks": [
    { "title": "string", "description": "string" },
    { "title": "string", "description": "string" }
  ]
}`;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { frames, context } = req.body as { frames: FrameData[]; context?: string };

    if (!frames || !Array.isArray(frames) || frames.length === 0) {
      return res.status(400).json({ error: 'No frames provided' });
    }

    const frameTasks: FrameTasks[] = await Promise.all(
      frames.map(async (frame) => {
        const userPrompt = `Frame name: ${frame.name}
Text content found: ${frame.textContent.join(', ') || 'None'}
Components used: ${frame.componentNames.join(', ') || 'None'}
Nested sections: ${frame.nestedFrameNames?.join(', ') || 'None'}
Dimensions: ${frame.width}x${frame.height}

${context ? `Additional context: ${context}` : ''}

Analyze this design frame and generate appropriate development tasks. Consider the complexity and break it down into logical, independently implementable units of work.`;

        const message = await client.messages.create({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1000,
          system: SYSTEM_PROMPT,
          messages: [{ role: 'user', content: userPrompt }],
        });

        const responseText = message.content[0].type === 'text' 
          ? message.content[0].text 
          : '';
        
        const parsed = JSON.parse(responseText);

        return {
          frameId: frame.id,
          frameName: frame.name,
          tasks: parsed.tasks.map((task: { title: string; description: string }, index: number) => ({
            id: `${frame.id}-${index + 1}`,
            title: task.title,
            description: task.description,
            selected: true,
          })),
        };
      })
    );

    return res.status(200).json({ frameTasks });
  } catch (error) {
    console.error('Generate error:', error);
    return res.status(500).json({ error: 'Failed to generate tasks' });
  }
}
```

### api/azure/auth.ts

The plugin generates a unique `state` and passes it as a query parameter. This state is used to correlate the OAuth callback with the polling request.

```typescript
import { VercelRequest, VercelResponse } from '@vercel/node';
import { handleCors } from '../_lib/auth';

export default function handler(req: VercelRequest, res: VercelResponse): void {
  if (handleCors(req, res)) return;

  const state = req.query.state;
  if (!state || typeof state !== 'string') {
    res.status(400).json({ error: 'Missing state parameter' });
    return;
  }

  const tenantId = process.env.AZURE_TENANT_ID || 'common';

  const params = new URLSearchParams({
    client_id: process.env.AZURE_CLIENT_ID!,
    response_type: 'code',
    redirect_uri: process.env.AZURE_REDIRECT_URI!,
    scope: `${process.env.AZURE_DEVOPS_RESOURCE_ID}/.default offline_access`,
    state,
  });

  res.redirect(
    `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize?${params.toString()}`
  );
}
```

### api/azure/callback.ts

The callback stores the auth result in Redis keyed by `state`, which the plugin polls for. This avoids cross-origin issues with `window.postMessage` in Figma's plugin environment.

```typescript
import { VercelRequest, VercelResponse } from '@vercel/node';
import { kvSet } from '../_lib/redis';

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  const { code, state, error, error_description } = req.query;

  if (error) {
    console.error('OAuth error:', error, error_description);
    res.status(400).send(`Authentication failed: ${error_description}`);
    return;
  }

  if (!code || typeof code !== 'string') {
    res.status(400).json({ error: 'No code provided' });
    return;
  }

  if (!state || typeof state !== 'string') {
    res.status(400).json({ error: 'No state provided' });
    return;
  }

  try {
    const tenantId = process.env.AZURE_TENANT_ID || 'common';

    const tokenResponse = await fetch(
      `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: process.env.AZURE_CLIENT_ID!,
          client_secret: process.env.AZURE_CLIENT_SECRET!,
          code,
          redirect_uri: process.env.AZURE_REDIRECT_URI!,
          grant_type: 'authorization_code',
          scope: `${process.env.AZURE_DEVOPS_RESOURCE_ID}/.default offline_access`,
        }),
      }
    );

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.text();
      console.error('Token exchange failed:', errorData);
      res.status(500).send(`Token exchange failed: ${errorData}`);
      return;
    }

    const tokens = (await tokenResponse.json()) as {
      access_token: string;
      refresh_token: string;
      expires_in: number;
    };

    const { randomUUID } = await import('crypto');
    const sessionId = randomUUID();

    // Store refresh token for long-term session (30 days)
    await kvSet(
      `session:${sessionId}`,
      {
        refreshToken: tokens.refresh_token,
        expiresAt: Date.now() + tokens.expires_in * 1000,
      },
      60 * 60 * 24 * 30
    );

    // Store auth result keyed by state so the plugin can poll for it (5 min TTL)
    await kvSet(
      `auth:${state}`,
      {
        sessionId,
        accessToken: tokens.access_token,
      },
      60 * 5
    );

    res.setHeader('Content-Type', 'text/html');
    res.send(`<!DOCTYPE html>
<html>
  <body>
    <p>Authentication successful! You can close this window and return to Figma.</p>
  </body>
</html>`);
  } catch (err) {
    console.error('OAuth callback error:', err);
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).send(`Authentication failed: ${message}`);
  }
}
```

### api/azure/poll.ts

The plugin polls this endpoint to check if OAuth completed.

```typescript
import { VercelRequest, VercelResponse } from '@vercel/node';
import { kvGet, kvDel } from '../_lib/redis';
import { handleCors } from '../_lib/auth';

interface AuthResult {
  sessionId: string;
  accessToken: string;
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  if (handleCors(req, res)) return;

  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const state = req.query.state;
  if (!state || typeof state !== 'string') {
    res.status(400).json({ error: 'Missing state parameter' });
    return;
  }

  try {
    const result = await kvGet<AuthResult>(`auth:${state}`);

    if (!result) {
      res.status(200).json({ status: 'pending' });
      return;
    }

    // Delete the auth result after reading (one-time use)
    await kvDel(`auth:${state}`);

    res.status(200).json({
      status: 'complete',
      sessionId: result.sessionId,
      accessToken: result.accessToken,
    });
  } catch (err) {
    console.error('Poll error:', err);
    res.status(500).json({ error: 'Failed to check auth status' });
  }
}
```

### api/azure/orgs.ts

Fetches user's Azure DevOps organizations.

```typescript
import { VercelRequest, VercelResponse } from '@vercel/node';
import { listOrganizations } from '../_lib/azure';
import { getAccessToken, handleCors } from '../_lib/auth';

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  if (handleCors(req, res)) return;

  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const accessToken = getAccessToken(req);
  if (!accessToken) {
    res.status(401).json({ error: 'Missing or invalid Authorization header' });
    return;
  }

  try {
    const orgs = await listOrganizations(accessToken);
    res.status(200).json({ orgs });
  } catch (error) {
    console.error('Orgs error:', error);
    const message = error instanceof Error ? error.message : 'Failed to fetch organizations';
    res.status(500).json({ error: message });
  }
}
```

### api/azure/refresh.ts

```typescript
import { VercelRequest, VercelResponse } from '@vercel/node';
import { kvGet, kvSet, kvDel } from '../_lib/redis';
import { KVSession } from '../_lib/types';
import { handleCors } from '../_lib/auth';

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  if (handleCors(req, res)) return;

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { sessionId } = req.body as { sessionId?: string };

  if (!sessionId) {
    res.status(400).json({ error: 'No session ID provided' });
    return;
  }

  try {
    const session = await kvGet<KVSession>(`session:${sessionId}`);

    if (!session?.refreshToken) {
      res.status(401).json({ error: 'Session expired, please re-authenticate' });
      return;
    }

    const tenantId = process.env.AZURE_TENANT_ID || 'common';

    const tokenResponse = await fetch(
      `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: process.env.AZURE_CLIENT_ID!,
          client_secret: process.env.AZURE_CLIENT_SECRET!,
          refresh_token: session.refreshToken,
          grant_type: 'refresh_token',
          scope: `${process.env.AZURE_DEVOPS_RESOURCE_ID}/.default offline_access`,
        }),
      }
    );

    if (!tokenResponse.ok) {
      await kvDel(`session:${sessionId}`);
      res.status(401).json({ error: 'Refresh failed, please re-authenticate' });
      return;
    }

    const tokens = (await tokenResponse.json()) as {
      access_token: string;
      refresh_token: string;
      expires_in: number;
    };

    await kvSet(
      `session:${sessionId}`,
      {
        refreshToken: tokens.refresh_token,
        expiresAt: Date.now() + tokens.expires_in * 1000,
      },
      60 * 60 * 24 * 30
    );

    res.status(200).json({ accessToken: tokens.access_token });
  } catch (error) {
    console.error('Refresh error:', error);
    res.status(500).json({ error: 'Failed to refresh token' });
  }
}
```

### api/_lib/redis.ts

Redis client wrapper using ioredis.

```typescript
import Redis from 'ioredis';

let client: Redis | null = null;

function getClient(): Redis {
  if (!client) {
    const url = process.env.REDIS_URL;
    if (!url) {
      throw new Error('Missing REDIS_URL environment variable');
    }
    client = new Redis(url);
  }
  return client;
}

export async function kvGet<T>(key: string): Promise<T | null> {
  const redis = getClient();
  const value = await redis.get(key);
  if (!value) return null;
  return JSON.parse(value) as T;
}

export async function kvSet(
  key: string,
  value: unknown,
  expirySeconds?: number
): Promise<void> {
  const redis = getClient();
  const serialized = JSON.stringify(value);
  if (expirySeconds) {
    await redis.set(key, serialized, 'EX', expirySeconds);
  } else {
    await redis.set(key, serialized);
  }
}

export async function kvDel(key: string): Promise<void> {
  const redis = getClient();
  await redis.del(key);
}
```

### api/_lib/types.ts

```typescript
export interface FrameData {
  id: string;
  name: string;
  textContent: string[];
  componentNames: string[];
  nestedFrameNames: string[];
  width: number;
  height: number;
}

export interface TaskItem {
  id: string;
  title: string;
  description: string;
  selected: boolean;
}

export interface FrameTasks {
  frameId: string;
  frameName: string;
  tasks: TaskItem[];
}

export interface AzureTask {
  title: string;
  description: string;
  parentStoryId: number;
  tags: string[];
  state: 'New';
}

export interface CreateTaskResult {
  taskId: string;
  success: boolean;
  azureTaskId?: number;
  taskUrl?: string;
  error?: string;
}
```

---

## Claude Prompt Engineering

### System Prompt

```
You are a technical task generator for UI/UX design work. Given information about a design frame from Figma, analyze the content and generate clear, actionable tasks for developers.

Break down the frame into logical implementation tasks. Generate 1-5 tasks depending on complexity:
- Simple frames (few elements, single purpose): 1-2 tasks
- Medium frames (forms, multiple sections): 2-3 tasks  
- Complex frames (dashboards, multi-feature screens): 3-5 tasks

Guidelines:
- Each task should be independently implementable
- Task titles should be concise and action-oriented (start with a verb)
- Descriptions should be 2-3 sentences covering what to build and key considerations
- Don't create tasks that are too granular (e.g., "Style the submit button" is too small)
- Don't create tasks that are too broad (e.g., "Build the entire screen")
- Group related elements into cohesive tasks
- Focus on implementation details, not design decisions
- Mention specific UI elements, states, and interactions
- Do not include estimates or assignees
- Keep language professional and clear

Output JSON format:
{
  "tasks": [
    { "title": "string", "description": "string" },
    { "title": "string", "description": "string" }
  ]
}
```

### User Prompt Template

```
Frame name: {frameName}
Text content found: {textContent}
Components used: {componentNames}
Nested sections: {nestedFrameNames}
Dimensions: {width}x{height}

Additional context: {context}

Analyze this design frame and generate appropriate development tasks. Consider the complexity and break it down into logical, independently implementable units of work.
```

### Example Output

**Input:**
```
Frame name: Login Screen
Text content found: ["Sign In", "Email", "Password", "Forgot password?", "Don't have an account?", "Sign Up", "Or continue with", "Google", "Apple"]
Components used: ["Input/Email", "Input/Password", "Button/Primary", "Button/Secondary", "Link", "Divider", "Button/Social"]
Nested sections: ["Form Container", "Social Login Section", "Footer Links"]
Dimensions: 375x812

Additional context: User authentication flow for mobile app
```

**Output:**
```json
{
  "tasks": [
    {
      "title": "Build login form layout",
      "description": "Create the main login form with email and password input fields and primary sign-in button. Ensure proper spacing, alignment, and keyboard handling for mobile."
    },
    {
      "title": "Implement form validation and error states",
      "description": "Add client-side validation for email format and required fields. Display inline error messages and handle authentication errors from the API."
    },
    {
      "title": "Add social sign-in buttons",
      "description": "Implement Google and Apple sign-in buttons with proper OAuth integration. Include the 'Or continue with' divider section."
    },
    {
      "title": "Add secondary navigation links",
      "description": "Implement forgot password link (navigates to reset flow) and sign-up link (navigates to registration). Style as text links per design."
    }
  ]
}
```

**Example 2 - Simple Frame:**

**Input:**
```
Frame name: Empty State - No Results
Text content found: ["No results found", "Try adjusting your search or filters", "Clear filters"]
Components used: ["Illustration/Empty", "Text/Heading", "Text/Body", "Button/Secondary"]
Nested sections: ["Content Block"]
Dimensions: 1440x400

Additional context: Search results page empty state
```

**Output:**
```json
{
  "tasks": [
    {
      "title": "Build empty state component for search results",
      "description": "Create centered empty state with illustration, heading, body text, and clear filters button. Component should be reusable and accept custom messaging props."
    }
  ]
}
```

---

## User Flow

### Screen-by-Screen Specification

#### Screen 1: Home

**State:** Plugin opened, no frames selected

**Elements:**
- Plugin header with logo and name
- Centered icon (frame grid)
- Heading: "Select frames to start"
- Subtext: "Select one or more frames in Figma to generate Azure DevOps tasks"
- Disabled "Continue" button

**Behavior:**
- Listen for `figma.on('selectionchange')` in main.ts
- When frames selected, enable button with text "Continue with X frames"
- On click, navigate to Context screen

#### Screen 2: Add Context

**State:** Frames selected, pre-generation

**Elements:**
- Heading: "Add Context"
- Subtext: "Help AI generate better task descriptions"
- Chips showing selected frame names
- Single textarea: "Context (optional)" with placeholder
- "Generate Tasks" primary button
- "Skip context, generate anyway →" link

**Behavior:**
- Textarea is optional
- Both actions call backend `/api/generate`
- Navigate to Generating screen

#### Screen 3: Generating

**State:** Waiting on Claude API

**Elements:**
- Loading spinner
- "Generating tasks..."
- "Analyzing X frames"
- List of frame names with progress indicators (✓ or ○)

**Behavior:**
- Call `/api/generate` with frame data + context
- On success, navigate to Connect Azure
- On error, show error message with retry option

#### Screen 4: Connect to Azure

**State:** Tasks generated, not authenticated

**Elements:**
- Azure DevOps icon
- Success badge: "X tasks ready"
- Heading: "Connect to Azure DevOps"
- Subtext: "Sign in to push tasks to your Azure DevOps board"
- "Connect Azure DevOps" primary button
- Preview list of generated task titles (read-only)

**Behavior:**
- Check if already authenticated (stored token)
- If authenticated, skip to Select Story
- On connect click, open OAuth flow in browser
- On callback success, navigate to Select Story

#### Screen 5: Select Story & Tags

**State:** Authenticated, need assignment

**Elements:**
- Heading: "Assign to Story"
- Subtext: "All X tasks will be linked to this story"
- Dropdown: Organization (auto-fetched on mount)
- Dropdown: Project (pre-filled if remembered)
- Dropdown: User Story (required, shows active only)
- Multi-select: Tags (fetched from Azure)
- Hint showing last used story
- "Continue to Review" primary button

**Behavior:**
- Auto-fetch organizations on mount via `/api/azure/orgs`
- Auto-select org if only one exists, or use saved org
- Fetch projects, stories, tags from Azure API
- Pre-fill remembered project/org
- Require story selection before proceeding
- Store selections in plugin storage
- Navigate to Review screen

#### Screen 6: Review & Edit

**State:** Everything ready, final check

**Elements:**
- Header: "Review Tasks" with total count
- Subtext: "Edit or remove tasks before pushing to Azure"
- Scrollable list of frame groups, each containing:
  - Frame header (collapsible):
    - Frame name
    - Task count badge (e.g., "3 tasks")
    - Expand/collapse chevron
  - Task cards within each frame group:
    - Checkbox (to select/deselect task)
    - Editable title input
    - Editable description textarea
    - Tag chips (removable per task if needed)
- Sticky footer:
  - Task count: "X of Y tasks selected"
  - "Create X Tasks" primary button
- "Back" link

**Visual Layout:**
```
┌─────────────────────────────────────┐
│ Review Tasks              12 tasks  │
│ Edit or remove tasks before pushing │
├─────────────────────────────────────┤
│ ▼ Login Screen               (4)    │
├─────────────────────────────────────┤
│ ☑ Build login form layout           │
│   [editable title................]  │
│   [editable description..........]  │
│   [UI] [Design] [×]                 │
├─────────────────────────────────────┤
│ ☑ Implement form validation         │
│   [editable title................]  │
│   [editable description..........]  │
│   [UI] [Design] [×]                 │
├─────────────────────────────────────┤
│ ☐ Add social sign-in buttons        │
│   (deselected - won't be created)   │
├─────────────────────────────────────┤
│ ☑ Add secondary navigation          │
│   [editable title................]  │
├─────────────────────────────────────┤
│ ▶ Dashboard                    (2)  │
│   (collapsed)                       │
├─────────────────────────────────────┤
│ ▼ Settings Page                (3)  │
├─────────────────────────────────────┤
│ ...                                 │
└─────────────────────────────────────┘
┌─────────────────────────────────────┐
│ 10 of 12 tasks    [Create 10 Tasks] │
└─────────────────────────────────────┘
```

**Behavior:**
- All fields are editable
- Unchecking a task excludes it from submission
- Frame groups are collapsible to manage long lists
- Removing all tags from a task is allowed
- At least one task must be selected to proceed
- On submit, only selected tasks are sent to Azure
- Navigate to Submitting screen

#### Screen 7a: Submitting

**State:** Pushing to Azure

**Elements:**
- Loading spinner
- "Creating tasks..."
- "Pushing to Azure DevOps"
- List showing checkmarks as each succeeds

**Behavior:**
- Call `/api/azure/tasks` with all tasks
- Update UI as each task completes
- On all success, navigate to Success
- On any failure, navigate to Partial Failure

#### Screen 7b: Success

**State:** All tasks created

**Elements:**
- Success icon (checkmark in circle)
- "X tasks created!"
- Story name and tags displayed
- "View in Azure DevOps ↗" primary button
- "Create More Tasks" secondary button

**Behavior:**
- Update frequent tags in storage
- "View in Azure" opens link in browser
- "Create More" navigates to Home screen

#### Screen 7c: Partial Failure

**State:** Some tasks failed

**Elements:**
- Warning icon
- "X of Y tasks created"
- "Z tasks failed to create"
- List showing success (✓) and failed (✗) per task
- Error message
- "Retry Failed Tasks" primary button
- "View Successful Tasks ↗" secondary button

**Behavior:**
- Retry only re-attempts failed tasks
- On retry success, navigate to Success
- If all retries fail, stay on this screen

---

## Plugin ↔ Main Communication

Figma plugins have two contexts that communicate via messages:

### main.ts (has Figma API access)

```typescript
import { FrameData } from './types';

// Helper: Extract text content from frame (recursive)
function extractTextContent(node: SceneNode): string[] {
  const textContent: string[] = [];
  
  function traverse(n: SceneNode) {
    if (n.type === 'TEXT') {
      const text = n.characters.trim();
      // Skip empty, very short, or duplicate text
      if (text && text.length > 1 && !textContent.includes(text)) {
        textContent.push(text);
      }
    }
    if ('children' in n) {
      n.children.forEach(traverse);
    }
  }
  
  traverse(node);
  return textContent.slice(0, 30); // Cap to avoid huge payloads
}

// Helper: Extract component instance names (recursive)
function extractComponentNames(node: SceneNode): string[] {
  const componentNames: string[] = [];
  
  function traverse(n: SceneNode) {
    if (n.type === 'INSTANCE') {
      const name = n.name;
      // Skip auto-generated names
      if (name && !name.match(/^(Frame|Group|Rectangle|Ellipse)\s*\d*$/i)) {
        if (!componentNames.includes(name)) {
          componentNames.push(name);
        }
      }
    }
    if ('children' in n) {
      n.children.forEach(traverse);
    }
  }
  
  traverse(node);
  return componentNames.slice(0, 20); // Cap to avoid huge payloads
}

// Helper: Extract nested frame names (for structure context)
function extractNestedFrameNames(node: SceneNode): string[] {
  const frameNames: string[] = [];
  
  function traverse(n: SceneNode, depth: number) {
    if (depth > 2) return; // Only go 2 levels deep
    if (n.type === 'FRAME' && n !== node) {
      const name = n.name;
      if (name && !name.match(/^Frame\s*\d*$/i)) {
        frameNames.push(name);
      }
    }
    if ('children' in n) {
      n.children.forEach(child => traverse(child, depth + 1));
    }
  }
  
  traverse(node, 0);
  return frameNames.slice(0, 10);
}

// Build frame data object
function buildFrameData(frame: FrameNode): FrameData {
  return {
    id: frame.id,
    name: frame.name,
    textContent: extractTextContent(frame),
    componentNames: extractComponentNames(frame),
    nestedFrameNames: extractNestedFrameNames(frame),
    width: Math.round(frame.width),
    height: Math.round(frame.height),
  };
}

// Listen for UI requests
figma.ui.onmessage = async (msg) => {
  if (msg.type === 'get-selection') {
    const frames = figma.currentPage.selection
      .filter((node): node is FrameNode => node.type === 'FRAME')
      .map(buildFrameData);
    figma.ui.postMessage({ type: 'selection', frames });
  }
  
  if (msg.type === 'get-storage') {
    const data = await figma.clientStorage.getAsync('devops-sync');
    figma.ui.postMessage({ type: 'storage', data });
  }
  
  if (msg.type === 'set-storage') {
    await figma.clientStorage.setAsync('devops-sync', msg.data);
  }
};

// Notify UI of selection changes
figma.on('selectionchange', () => {
  const count = figma.currentPage.selection
    .filter(node => node.type === 'FRAME').length;
  figma.ui.postMessage({ type: 'selection-count', count });
});

// Show plugin UI
figma.showUI(__html__, { width: 320, height: 520 });
```

### UI (React)

```typescript
// Send messages to main
const getSelection = () => {
  parent.postMessage({ pluginMessage: { type: 'get-selection' } }, '*');
};

// Receive messages from main
window.onmessage = (event) => {
  const msg = event.data.pluginMessage;
  if (msg.type === 'selection') {
    setFrames(msg.frames);
  }
  if (msg.type === 'selection-count') {
    setFrameCount(msg.count);
  }
};
```

---

## Azure DevOps Integration

### Authentication: Microsoft Entra ID OAuth

Azure DevOps OAuth is deprecated (April 2025) and will be removed in 2026. New apps must use **Microsoft Entra ID OAuth**.

> **Note:** Microsoft Entra ID OAuth does not natively support personal Microsoft accounts (MSA) for Azure DevOps. It works with organizational accounts (Azure AD backed). If your team uses personal Microsoft accounts, users may need to be added to your Azure DevOps organization with work accounts.

#### App Registration (Azure Portal)

1. Go to [Azure Portal](https://portal.azure.com) → Microsoft Entra ID → App registrations → New registration
2. Name: "DevOps Sync Figma Plugin"
3. Supported account types: "Accounts in any organizational directory" (for multi-tenant)
4. Redirect URI: Web → `https://your-project.vercel.app/api/azure/callback`
5. Click Register

#### Configure API Permissions

1. Go to your app → API permissions → Add a permission
2. Select "Azure DevOps" (not Microsoft Graph)
3. Select Delegated permissions:
   - `user_impersonation` (Access Azure DevOps resources)
4. Click "Grant admin consent" (if you have admin rights, otherwise users consent on first login)

#### Create Client Secret

1. Go to Certificates & secrets → New client secret
2. Description: "Vercel backend"
3. Expiry: 24 months (set a reminder to rotate)
4. Copy the secret value immediately (shown only once)

#### Key Configuration Values

| Value | Where to find it |
|-------|------------------|
| Client ID | App registration → Overview → Application (client) ID |
| Client Secret | Certificates & secrets → Value (copy when created) |
| Tenant ID | App registration → Overview → Directory (tenant) ID |
| Azure DevOps Resource ID | `499b84ac-1321-427f-aa17-267ca6975798` (constant) |

### OAuth Flow (Polling-Based)

The plugin uses a **polling-based OAuth flow** instead of `window.postMessage` to avoid cross-origin issues in Figma's plugin environment.

**Flow:**
```
1. Plugin generates unique state UUID
2. Plugin opens popup: GET /api/azure/auth?state={state}
3. User authenticates with Azure
4. Azure redirects to: GET /api/azure/callback?code=...&state={state}
5. Callback exchanges code for tokens
6. Callback stores result in Redis: auth:{state} (5 min TTL)
7. Callback shows "Success, close this window" HTML
8. Plugin polls: GET /api/azure/poll?state={state}
9. Poll returns { status: 'pending' } or { status: 'complete', sessionId, accessToken }
10. Plugin stores sessionId for token refresh, accessToken in memory
```

**Authorization URL:**
```
https://login.microsoftonline.com/{tenant_id}/oauth2/v2.0/authorize
?client_id={client_id}
&response_type=code
&redirect_uri={redirect_uri}
&scope=499b84ac-1321-427f-aa17-267ca6975798/.default
&state={state}
```

**Token URL:**
```
POST https://login.microsoftonline.com/{tenant_id}/oauth2/v2.0/token
Content-Type: application/x-www-form-urlencoded

client_id={client_id}
&client_secret={client_secret}
&code={authorization_code}
&redirect_uri={redirect_uri}
&grant_type=authorization_code
```

**Notes:**
- Use `common` as tenant_id to allow any Azure AD account
- Scope `499b84ac-1321-427f-aa17-267ca6975798/.default` grants all configured permissions
- Access tokens expire in ~1 hour; use refresh tokens for long-lived sessions
- Plugin polls every 2 seconds, stops after 5 minutes (timeout)

### API Endpoints Used

| Action | Method | Endpoint |
|--------|--------|----------|
| Get user profile | GET | `https://app.vssps.visualstudio.com/_apis/profile/profiles/me?api-version=7.1` |
| List organizations | GET | `https://app.vssps.visualstudio.com/_apis/accounts?memberId={memberId}&api-version=7.1` |
| List projects | GET | `https://dev.azure.com/{org}/_apis/projects?api-version=7.1` |
| List work items (stories) | POST | `https://dev.azure.com/{org}/{project}/_apis/wit/wiql?api-version=7.1` |
| Get tags | GET | `https://dev.azure.com/{org}/{project}/_apis/wit/tags?api-version=7.1` |
| Create task | POST | `https://dev.azure.com/{org}/{project}/_apis/wit/workitems/$Task?api-version=7.1` |

### Listing User Organizations

```typescript
export async function listOrganizations(accessToken: string): Promise<string[]> {
  // First get the user's profile to get their member ID
  const profileResponse = await azureFetch(
    'https://app.vssps.visualstudio.com/_apis/profile/profiles/me?api-version=7.1',
    accessToken
  );
  const profile = (await profileResponse.json()) as { id: string };

  // Then get their organizations using the member ID
  const accountsResponse = await azureFetch(
    `https://app.vssps.visualstudio.com/_apis/accounts?memberId=${profile.id}&api-version=7.1`,
    accessToken
  );
  const accounts = (await accountsResponse.json()) as {
    value: Array<{ accountName: string }>;
  };
  return accounts.value.map((a) => a.accountName);
}
```

### Creating a Task with Parent Link

```typescript
const createTask = async (task: AzureTask, org: string, projectId: string, accessToken: string) => {
  const response = await fetch(
    `https://dev.azure.com/${org}/${projectId}/_apis/wit/workitems/$Task?api-version=7.1`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json-patch+json',
        'Authorization': `Bearer ${accessToken}`,
      },
      body: JSON.stringify([
        { op: 'add', path: '/fields/System.Title', value: task.title },
        { op: 'add', path: '/fields/System.Description', value: task.description },
        { op: 'add', path: '/fields/System.State', value: 'New' },
        { op: 'add', path: '/fields/System.Tags', value: task.tags.join('; ') },
        {
          op: 'add',
          path: '/relations/-',
          value: {
            rel: 'System.LinkTypes.Hierarchy-Reverse',
            url: `https://dev.azure.com/${org}/_apis/wit/workItems/${task.parentStoryId}`,
          },
        },
      ]),
    }
  );
  return response.json();
};
```

---

## MVP Scope

### In Scope

- [x] Figma plugin UI (9 screens)
- [x] Frame selection and data extraction (text content, component names, nested frames)
- [x] Single context field for all frames
- [x] Claude-powered task generation
- [x] **Multiple tasks per frame** (AI determines 1-5 tasks based on complexity)
- [x] Task selection (users can deselect tasks before submission)
- [x] Azure DevOps OAuth authentication (Microsoft Entra ID, polling-based)
- [x] Fetch organizations, projects, active stories, tags
- [x] All tasks link to same story (batch)
- [x] Task review and editing before submission
- [x] Partial failure handling with retry
- [x] Remember last org, project, story, and frequent tags

### Out of Scope (MVP)

- Different stories per task
- Auto-closing tasks
- Editing existing Azure tasks
- Automated story assignment without confirmation
- Frame thumbnails in UI
- Team-wide shared settings

---

## Development Guidelines

### Code Style

- TypeScript strict mode enabled
- Functional React components with hooks
- Named exports (no default exports except pages)
- Explicit return types on functions
- Use `interface` over `type` for object shapes

### Error Handling

- All API calls wrapped in try/catch
- User-friendly error messages (never expose raw errors)
- Retry logic for network failures (max 3 attempts)
- Graceful degradation when Azure API is slow

### Security

- Access tokens stored in memory (React state), never in plugin storage
- Refresh tokens stored server-side in Redis, never exposed to client
- Session IDs (not tokens) stored in plugin storage for token refresh
- API keys only in backend environment variables
- Validate all inputs on backend before processing
- Rate limit API endpoints

### Testing Priorities

1. Frame data extraction accuracy
2. Claude prompt output quality
3. Azure OAuth flow (happy path + token refresh)
4. Task creation with parent linking
5. Partial failure and retry logic

---

## Environment Variables

### Vercel Environment Variables

Set these in your Vercel project dashboard (Settings → Environment Variables):

```env
# Claude
ANTHROPIC_API_KEY=sk-ant-...

# Microsoft Entra ID OAuth (Azure Portal → App registrations)
AZURE_CLIENT_ID=...                    # Application (client) ID
AZURE_CLIENT_SECRET=...                # Client secret value
AZURE_TENANT_ID=common                 # Use 'common' for multi-tenant, or specific tenant ID
AZURE_REDIRECT_URI=https://your-project.vercel.app/api/azure/callback

# Azure DevOps Resource ID (constant, do not change)
AZURE_DEVOPS_RESOURCE_ID=499b84ac-1321-427f-aa17-267ca6975798

# Redis (for session/token storage)
REDIS_URL=redis://...                  # Redis connection URL
```

### Local Development

Create `.env.local` in the root directory:

```env
ANTHROPIC_API_KEY=sk-ant-...
AZURE_CLIENT_ID=...
AZURE_CLIENT_SECRET=...
AZURE_TENANT_ID=common
AZURE_REDIRECT_URI=http://localhost:3000/api/azure/callback
AZURE_DEVOPS_RESOURCE_ID=499b84ac-1321-427f-aa17-267ca6975798
REDIS_URL=redis://localhost:6379
```

For local development, run Redis locally or use a cloud Redis provider (e.g., Upstash, Redis Cloud).

---

## Getting Started

### Prerequisites

- Node.js 18+
- Figma desktop app
- Azure DevOps account with project access
- Anthropic API key
- Vercel account (free tier works)

### Initial Setup

```bash
# Clone repo
git clone https://github.com/your-org/devops-sync.git
cd devops-sync

# Install API dependencies (root)
npm install

# Install plugin dependencies
cd plugin
npm install
cd ..
```

### Deploy API to Vercel

```bash
# Install Vercel CLI globally
npm install -g vercel

# Login to Vercel
vercel login

# Link to new Vercel project
vercel link

# Set environment variables in Vercel dashboard:
# - ANTHROPIC_API_KEY
# - AZURE_CLIENT_ID
# - AZURE_CLIENT_SECRET
# - AZURE_REDIRECT_URI (https://your-project.vercel.app/api/azure/callback)

# Deploy
vercel --prod
```

### Set Up Redis Storage

You can use any Redis provider:

**Option 1: Upstash (recommended for Vercel)**
1. Go to [Upstash](https://upstash.com)
2. Create a new Redis database
3. Copy the `REDIS_URL` connection string
4. Add to Vercel environment variables

**Option 2: Redis Cloud**
1. Go to [Redis Cloud](https://redis.com/try-free/)
2. Create a free database
3. Get the connection URL
4. Add to Vercel environment variables

**Option 3: Self-hosted**
1. Run Redis locally or on a server
2. Use the connection URL format: `redis://username:password@host:port`

### Local API Development

```bash
# Pull environment variables for local dev
vercel env pull .env.local

# Start local API server
vercel dev
```

### Plugin Development

```bash
# In separate terminal
cd plugin

# Update API_URL in plugin/src/ui/services/api.ts
# For local: http://localhost:3000
# For prod: https://your-project.vercel.app

# Build and watch
npm run dev
```

### Load Plugin in Figma

1. Open Figma desktop app
2. Go to Plugins → Development → Import plugin from manifest
3. Select `plugin/manifest.json`
4. Plugin appears in Plugins menu
5. Run plugin: Plugins → Development → DevOps Sync

### Production Checklist

- [ ] Deploy API to Vercel (`vercel --prod`)
- [ ] Set all environment variables in Vercel dashboard
- [ ] Set up Redis storage (Upstash, Redis Cloud, etc.)
- [ ] Add `REDIS_URL` to Vercel environment variables
- [ ] Register app in Azure Portal (Microsoft Entra ID)
- [ ] Configure API permissions for Azure DevOps
- [ ] Create client secret and store in Vercel env vars
- [ ] Update `AZURE_REDIRECT_URI` to production URL
- [ ] Update `API_URL` in plugin to production Vercel URL
- [ ] Build final plugin (`cd plugin && npm run build`)

### vercel.json Configuration

```json
{
  "functions": {
    "api/**/*.ts": {
      "memory": 1024,
      "maxDuration": 30
    }
  },
  "headers": [
    {
      "source": "/api/(.*)",
      "headers": [
        { "key": "Access-Control-Allow-Origin", "value": "*" },
        { "key": "Access-Control-Allow-Methods", "value": "GET, POST, OPTIONS" },
        { "key": "Access-Control-Allow-Headers", "value": "Content-Type, Authorization" }
      ]
    }
  ]
}
```

> Note: The plugin is built separately and loaded directly into Figma. The Vercel deployment only hosts the API functions.

---

## Future Enhancements (Post-MVP)

- [ ] Frame thumbnails in review screen
- [ ] Smart task templates based on frame type
- [ ] Story-to-screen mapping history
- [ ] Team-wide configuration sharing
- [ ] Analytics on design-to-task efficiency
- [ ] Bulk task grouping options
- [ ] Integration with Figma comments/annotations
- [ ] Different stories per task (within same batch)
- [ ] Drag-and-drop task reordering
