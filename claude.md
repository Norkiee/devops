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
│  │                    Vercel KV (Redis)                    │    │
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
- **Vercel KV**: Built-in Redis for token storage
- **Easy deployment**: Git push to deploy
- **Free tier**: Sufficient for MVP and small teams

### Tech Stack

| Component | Technology |
|-----------|------------|
| Figma Plugin UI | React + TypeScript |
| Figma Plugin Logic | TypeScript (main.ts) |
| Backend | Vercel Serverless Functions (Node.js) |
| AI | Claude API (claude-sonnet-4-20250514) |
| Database | Vercel KV (Redis) for token storage |
| Auth | Azure DevOps OAuth 2.0 |

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
│   │   ├── refresh.ts         # POST /api/azure/refresh
│   │   ├── projects.ts        # GET /api/azure/projects
│   │   ├── stories.ts         # GET /api/azure/stories
│   │   ├── tags.ts            # GET /api/azure/tags
│   │   └── tasks.ts           # POST /api/azure/tasks
│   └── _lib/                  # Shared utilities (not exposed as routes)
│       ├── claude.ts          # Claude API wrapper
│       ├── azure.ts           # Azure DevOps API wrapper
│       ├── auth.ts            # Token validation helpers
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
  textContent: string[];      // Extracted text layers
  componentNames: string[];   // Component instances used
  width: number;
  height: number;
}

interface GenerateRequest {
  frames: FrameData[];
  context?: string;           // Optional user-provided context
}
```

### Generated Task (Backend → Plugin)

```typescript
interface GeneratedTask {
  frameId: string;
  frameName: string;
  title: string;
  description: string;
}

interface GenerateResponse {
  tasks: GeneratedTask[];
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
  azureTeamId?: string;
  lastStoryId?: number;
  frequentTags?: string[];    // Top 5 most used
  accessToken?: string;       // Encrypted
  refreshToken?: string;      // Encrypted
}
```

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
  "tasks": [
    {
      "frameId": "123:456",
      "frameName": "Login Screen",
      "title": "Implement login screen UI",
      "description": "Create login form with email and password input fields, primary sign-in button, and forgot password link. Include form validation states and error messaging."
    }
  ]
}
```

#### `GET /api/azure/auth`

Initiates Azure DevOps OAuth flow. Redirects to Azure.

#### `GET /api/azure/callback`

OAuth callback. Exchanges code for tokens, stores refresh token, returns access token to plugin.

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
import { FrameData, GeneratedTask } from './_lib/types';

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const SYSTEM_PROMPT = `You are a technical task generator for UI/UX design work. Given information about a design frame from Figma, generate a clear, actionable task for developers.

Guidelines:
- Task titles should be concise and action-oriented (start with a verb)
- Descriptions should be 2-3 sentences covering what to build and key considerations
- Focus on implementation details, not design decisions
- Mention specific UI elements, states, and interactions
- Do not include estimates or assignees
- Keep language professional and clear

Output JSON format:
{
  "title": "string",
  "description": "string"
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

    const tasks: GeneratedTask[] = await Promise.all(
      frames.map(async (frame) => {
        const userPrompt = `Frame name: ${frame.name}
Text content found: ${frame.textContent.join(', ') || 'None'}
Components used: ${frame.componentNames.join(', ') || 'None'}
Dimensions: ${frame.width}x${frame.height}

${context ? `Additional context: ${context}` : ''}

Generate a development task for implementing this design.`;

        const message = await client.messages.create({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 500,
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
          title: parsed.title,
          description: parsed.description,
        };
      })
    );

    return res.status(200).json({ tasks });
  } catch (error) {
    console.error('Generate error:', error);
    return res.status(500).json({ error: 'Failed to generate tasks' });
  }
}
```

### api/azure/auth.ts

```typescript
import { VercelRequest, VercelResponse } from '@vercel/node';

export default function handler(req: VercelRequest, res: VercelResponse) {
  const state = crypto.randomUUID();
  const tenantId = process.env.AZURE_TENANT_ID || 'common';
  
  const params = new URLSearchParams({
    client_id: process.env.AZURE_CLIENT_ID!,
    response_type: 'code',
    redirect_uri: process.env.AZURE_REDIRECT_URI!,
    scope: `${process.env.AZURE_DEVOPS_RESOURCE_ID}/.default offline_access`,
    state,
  });

  res.redirect(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize?${params.toString()}`);
}
```

### api/azure/callback.ts

```typescript
import { VercelRequest, VercelResponse } from '@vercel/node';
import { kv } from '@vercel/kv';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { code, state, error, error_description } = req.query;

  if (error) {
    console.error('OAuth error:', error, error_description);
    return res.status(400).send(`Authentication failed: ${error_description}`);
  }

  if (!code) {
    return res.status(400).json({ error: 'No code provided' });
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
          code: code as string,
          redirect_uri: process.env.AZURE_REDIRECT_URI!,
          grant_type: 'authorization_code',
          scope: `${process.env.AZURE_DEVOPS_RESOURCE_ID}/.default offline_access`,
        }),
      }
    );

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.text();
      console.error('Token exchange failed:', errorData);
      return res.status(500).send('Token exchange failed');
    }

    const tokens = await tokenResponse.json();

    // Store refresh token in KV (keyed by a session ID)
    const sessionId = crypto.randomUUID();
    await kv.set(`session:${sessionId}`, {
      refreshToken: tokens.refresh_token,
      expiresAt: Date.now() + tokens.expires_in * 1000,
    }, { ex: 60 * 60 * 24 * 30 }); // 30 days

    // Return HTML that posts message back to Figma plugin
    res.setHeader('Content-Type', 'text/html');
    res.send(`
      <html>
        <body>
          <script>
            window.opener.postMessage({
              type: 'azure-auth-success',
              sessionId: '${sessionId}',
              accessToken: '${tokens.access_token}'
            }, '*');
            window.close();
          </script>
          <p>Authentication successful. You can close this window.</p>
        </body>
      </html>
    `);
  } catch (error) {
    console.error('OAuth callback error:', error);
    res.status(500).send('Authentication failed');
  }
}
```

### api/azure/refresh.ts

```typescript
import { VercelRequest, VercelResponse } from '@vercel/node';
import { kv } from '@vercel/kv';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { sessionId } = req.body;

  if (!sessionId) {
    return res.status(400).json({ error: 'No session ID provided' });
  }

  try {
    const session = await kv.get<{ refreshToken: string }>(`session:${sessionId}`);
    
    if (!session?.refreshToken) {
      return res.status(401).json({ error: 'Session expired, please re-authenticate' });
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
      await kv.del(`session:${sessionId}`);
      return res.status(401).json({ error: 'Refresh failed, please re-authenticate' });
    }

    const tokens = await tokenResponse.json();

    // Update stored refresh token
    await kv.set(`session:${sessionId}`, {
      refreshToken: tokens.refresh_token,
      expiresAt: Date.now() + tokens.expires_in * 1000,
    }, { ex: 60 * 60 * 24 * 30 });

    return res.status(200).json({ accessToken: tokens.access_token });
  } catch (error) {
    console.error('Refresh error:', error);
    return res.status(500).json({ error: 'Failed to refresh token' });
  }
}
```

### api/_lib/types.ts

```typescript
export interface FrameData {
  id: string;
  name: string;
  textContent: string[];
  componentNames: string[];
  width: number;
  height: number;
}

export interface GeneratedTask {
  frameId: string;
  frameName: string;
  title: string;
  description: string;
}

export interface AzureTask {
  title: string;
  description: string;
  parentStoryId: number;
  tags: string[];
  state: 'New';
}

export interface CreateTaskResult {
  frameId: string;
  success: boolean;
  taskId?: number;
  taskUrl?: string;
  error?: string;
}
```

---

## Claude Prompt Engineering

### System Prompt

```
You are a technical task generator for UI/UX design work. Given information about a design frame from Figma, generate a clear, actionable task for developers.

Guidelines:
- Task titles should be concise and action-oriented (start with a verb)
- Descriptions should be 2-3 sentences covering what to build and key considerations
- Focus on implementation details, not design decisions
- Mention specific UI elements, states, and interactions
- Do not include estimates or assignees
- Keep language professional and clear

Output JSON format:
{
  "title": "string",
  "description": "string"
}
```

### User Prompt Template

```
Frame name: {frameName}
Text content found: {textContent}
Components used: {componentNames}
Dimensions: {width}x{height}

Additional context: {context}

Generate a development task for implementing this design.
```

### Example Output

**Input:**
```
Frame name: Dashboard - Empty State
Text content found: ["No projects yet", "Create your first project", "Get Started"]
Components used: ["Illustration", "Button/Primary", "Text/Heading", "Text/Body"]
Dimensions: 1440x900

Additional context: This is the main dashboard users see after signup
```

**Output:**
```json
{
  "title": "Build empty state view for dashboard",
  "description": "Implement the empty state displayed when users have no projects. Include illustration, heading, body text, and primary CTA button. Ensure proper vertical centering and responsive behavior for the content block."
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
- Dropdown: Project/Team (pre-filled if remembered)
- Dropdown: User Story (required, shows active only)
- Multi-select: Tags (fetched from Azure)
- Hint showing last used story
- "Continue to Review" primary button

**Behavior:**
- Fetch projects, stories, tags from Azure API
- Pre-fill remembered project/team
- Require story selection before proceeding
- Store selections in plugin storage
- Navigate to Review screen

#### Screen 6: Review & Edit

**State:** Everything ready, final check

**Elements:**
- Header: "Review Tasks" with count
- Subtext: "Edit before pushing to Azure"
- Scrollable list of task cards, each with:
  - Frame thumbnail
  - Frame name label
  - Editable title input
  - Editable description textarea
  - Tag chips (removable)
  - Linked story (display only)
- Sticky footer: "Create X Tasks" primary button
- "Back" link

**Behavior:**
- All fields are editable
- Removing all tags from a task is allowed
- On submit, navigate to Submitting screen

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
// Listen for UI requests
figma.ui.onmessage = async (msg) => {
  if (msg.type === 'get-selection') {
    const frames = figma.currentPage.selection
      .filter(node => node.type === 'FRAME')
      .map(frame => ({
        id: frame.id,
        name: frame.name,
        textContent: extractTextContent(frame),
        componentNames: extractComponentNames(frame),
        width: frame.width,
        height: frame.height,
      }));
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

### OAuth Flow

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

### API Endpoints Used

| Action | Method | Endpoint |
|--------|--------|----------|
| List projects | GET | `https://dev.azure.com/{org}/_apis/projects?api-version=7.1` |
| List work items (stories) | POST | `https://dev.azure.com/{org}/{project}/_apis/wit/wiql?api-version=7.1` |
| Get tags | GET | `https://dev.azure.com/{org}/{project}/_apis/wit/tags?api-version=7.1` |
| Create task | POST | `https://dev.azure.com/{org}/{project}/_apis/wit/workitems/$Task?api-version=7.1` |

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
- [x] Frame selection and data extraction
- [x] Single context field for all frames
- [x] Claude-powered task generation
- [x] Azure DevOps OAuth authentication
- [x] Fetch projects, active stories, tags
- [x] All tasks link to same story (batch)
- [x] Task review and editing before submission
- [x] Partial failure handling with retry
- [x] Remember last project, team, story, and frequent tags

### Out of Scope (MVP)

- Multiple tasks per frame
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

- Never store Azure access tokens in plugin storage unencrypted
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

# Vercel KV (auto-populated when you add KV storage)
KV_URL=...
KV_REST_API_URL=...
KV_REST_API_TOKEN=...
KV_REST_API_READ_ONLY_TOKEN=...
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
```

For local KV, use Vercel CLI: `vercel env pull` to sync environment variables.

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

### Add Vercel KV Storage

1. Go to Vercel dashboard → Storage
2. Create new KV database
3. Connect to your project
4. Environment variables auto-populate

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
- [ ] Add Vercel KV storage
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

- [ ] Multiple tasks per frame (user specifies count)
- [ ] Frame thumbnails in review screen
- [ ] Smart task templates based on frame type
- [ ] Story-to-screen mapping history
- [ ] Team-wide configuration sharing
- [ ] Analytics on design-to-task efficiency
- [ ] Bulk task grouping options
- [ ] Integration with Figma comments/annotations
