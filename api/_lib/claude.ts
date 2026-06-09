import { FrameData, FrameWorkItems, WorkItem, WorkItemType, HierarchyContext } from './types';
import { GenerationUnit } from './sources/types';
import { FrameContent, frameToUnit } from './sources/frames';

const CLAUDE_MODEL = 'claude-sonnet-4-20250514';

const MAX_RETRIES = 3;
const INITIAL_DELAY_MS = 1000;
const FETCH_TIMEOUT_MS = 45000; // 45 second timeout (Claude can be slow)
const RETRYABLE_STATUS_CODES = [429, 503, 529];

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithRetry(
  url: string,
  options: RequestInit,
  retries = MAX_RETRIES
): Promise<Response> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (response.ok) {
        return response;
      }

      // Check if this is a retryable error
      if (RETRYABLE_STATUS_CODES.includes(response.status) && attempt < retries) {
        const delay = INITIAL_DELAY_MS * Math.pow(2, attempt);
        console.log(
          `Anthropic API returned ${response.status}, retrying in ${delay}ms (attempt ${attempt + 1}/${retries})`
        );
        await sleep(delay);
        continue;
      }

      // Non-retryable error or out of retries
      const errorText = await response.text();
      lastError = new Error(`Anthropic API error (${response.status}): ${errorText}`);
      break;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === 'AbortError') {
        lastError = new Error(`Request timed out after ${FETCH_TIMEOUT_MS}ms`);
        // Timeout is retryable
        if (attempt < retries) {
          const delay = INITIAL_DELAY_MS * Math.pow(2, attempt);
          console.log(`Request timed out, retrying in ${delay}ms (attempt ${attempt + 1}/${retries})`);
          await sleep(delay);
          continue;
        }
      } else {
        lastError = error instanceof Error ? error : new Error(String(error));
      }
      break;
    }
  }

  throw lastError || new Error('Unknown error during fetch');
}

const EPIC_SYSTEM_PROMPT = `You help product designers turn their Figma designs into Azure DevOps Epics.

An Epic is the broadest container on the board — a product area or initiative that many features and screens live under. Real examples from this team's backlog (note how short and product-area-like they are):
- "MS - Merchant Dashboard"
- "Employee Payroll"
- "Bulk Invoicing"

You will receive frame data (screen name, section, visible text, components, nested sections, dimensions, likely platform) and optional designer context.

Guidelines:
- Title: a short product-area name (3-6 words), NOT a sentence. Think "the product suite this screen belongs to."
- Base it only on the design provided — do not invent scope that isn't shown.
- Description: 1-2 sentences on what the initiative covers and why it matters to users.
- Produce 1-2 Epics.

Output JSON:
{
  "epics": [
    {
      "title": "short product-area name",
      "description": "what this initiative covers and why it matters"
    }
  ]
}`;

const FEATURE_SYSTEM_PROMPT = `You help product designers turn their Figma designs into Azure DevOps Features.

A Feature is a concrete design deliverable or capability area that sits under an Epic. Real examples from this team's backlog (note the concise, capability-and-platform style):
- "Employee payroll design for desktop & mobile devices"
- "Creating & Sending bulk invoices"
- "Invoice and bills mobile experience update"

You will receive frame data (screen name, section, visible text, components, nested sections, dimensions, likely platform) and optional parent Epic context.

Guidelines:
- Title: a concise deliverable (4-8 words). Name the capability, and the platform when relevant ("... for desktop & mobile", "... mobile experience update").
- If a parent Epic is provided, the Features must clearly ladder up to it.
- Base it only on the design provided — do not invent UI that isn't shown.
- Description: 1-2 sentences on what will be designed and how it fits the Epic.
- Produce 1-3 Features.

Output JSON:
{
  "features": [
    {
      "title": "concise design deliverable",
      "description": "what will be designed and how it fits the epic"
    }
  ]
}`;

const TASK_SYSTEM_PROMPT = `You help product designers turn their Figma designs into Azure DevOps Tasks.

Tasks are concrete design actions at the COMPONENT / SCREEN / FLOW level. Each names the actual thing being designed. Real examples from this team's backlog (match this style and altitude):
- "Create message preview component"
- "Design customer group dropdown component"
- "Update progress stepper"
- "Design an updated add payment experience"
- "Update 'contacts can pay with' card"
- "Update modal to fit send SMS flow"
- "Update step 2 screen designs"

You will receive frame data (screen name, section, visible text, component names, nested sections, dimensions, likely platform), optional parent context, and optional designer context.

Guidelines:
- Start each title with a design verb: Design, Create, Update, Refine, or Audit.
- Reference the ACTUAL components, screens, and elements in the frame using their real names from the component and text lists (e.g. if a component is "ProgressStepper", the task is "Update progress stepper"; if a section is "Add payment", a task is "Design the add payment experience").
- Work at the component / screen / flow level — NOT low-level pixel states. Prefer "Create message preview component" over "Design hover state for the button".
- Only create tasks for things actually present in the frame; never invent generic work.
- If "Likely platform" is Mobile, phrase the task for the mobile experience when relevant.
- Produce 1-5 tasks.

Output JSON:
{
  "tasks": [
    {
      "title": "design verb + the actual component/screen/flow",
      "description": "what to design and which specific elements are involved"
    }
  ]
}`;

const USER_STORY_SYSTEM_PROMPT = `You help product designers turn their Figma designs into Azure DevOps User Stories.

Write END-USER stories about the product capability the design enables — NOT about the designer's own process. Every story uses this exact format:
"As a [persona], I want [capability] so that [benefit]"

Infer [persona] from the design and product context — the real person who uses this screen (e.g. a business user / merchant, a first-time or returning employee, a customer, an admin). Choose the most specific role that fits. NEVER write "As a designer ..." and avoid a vague "As a user ..." when a more specific role is implied.

Real examples from this team's backlog (match this voice and specificity):
- "As a business user, I want to upload an Excel sheet to add multiple employees at once so that I can efficiently onboard a large workforce"
- "As a first-time employee, I want to verify my identity with my Ghana card and face verification so that I can securely access my salary"
- "As a returning employee who has already completed face verification, I want to skip re-verification so that I can access my salary faster"
- "As a business user, I want to view each employee's payment status so that I know who has accessed their salary and can take action where needed"

You will receive frame data (screen name, section, visible text, components, nested sections, dimensions, likely platform) and optional parent Epic/Feature context.

Guidelines:
- [capability] = the concrete action this screen enables, named from its actual text and components.
- [benefit] = the real-world outcome that persona gets.
- If "Likely platform" is Mobile, reflect it naturally ("... on mobile", "... from my phone"), the way this team splits desktop and mobile stories.
- If a parent Epic/Feature is provided, the stories must clearly ladder up to it.
- Base every story ONLY on what's in the frame — do not invent capabilities that aren't shown.
- Produce 1-3 stories.

Output JSON:
{
  "stories": [
    {
      "title": "As a [persona], I want [capability] so that [benefit]"
    }
  ]
}`;

// Backwards compatibility alias
const SYSTEM_PROMPT = TASK_SYSTEM_PROMPT;

// Renders the shared frame description block from a normalized unit. Output is
// byte-identical to the previous FrameData-based prompts.
function frameBlock(unit: GenerationUnit): string {
  const c = unit.content as FrameContent;
  const platform = c.width <= 600 ? 'Mobile' : 'Desktop / Web';
  return `Frame name: ${unit.refName}
${c.sectionName ? `Section: ${c.sectionName}` : ''}
Text content found: ${c.textContent.join(', ') || 'None'}
Components used: ${c.componentNames.join(', ') || 'None'}
Nested sections: ${c.nestedFrameNames?.join(', ') || 'None'}
Dimensions: ${c.width}x${c.height}
Likely platform: ${platform}`;
}

function buildEpicPrompt(
  unit: GenerationUnit,
  context?: string
): string {
  return `${frameBlock(unit)}

${context ? `Additional context: ${context}` : ''}

Generate 1-2 Epics naming the product area this design belongs to.`;
}

function buildFeaturePrompt(
  unit: GenerationUnit,
  context?: string,
  hierarchyContext?: HierarchyContext
): string {
  const epicSection = hierarchyContext?.epic
    ? `Epic: ${hierarchyContext.epic.title}
Epic Description: ${hierarchyContext.epic.description || 'Not provided'}

`
    : '';

  return `${epicSection}${frameBlock(unit)}

${context ? `Additional context: ${context}` : ''}

Generate 1-3 Features for the design deliverables this frame implies.`;
}

function buildTaskPrompt(
  unit: GenerationUnit,
  context?: string,
  hierarchyContext?: HierarchyContext
): string {
  const epicSection = hierarchyContext?.epic
    ? `Epic: ${hierarchyContext.epic.title}
Epic Description: ${hierarchyContext.epic.description || 'Not provided'}

`
    : '';

  const featureSection = hierarchyContext?.feature
    ? `Feature: ${hierarchyContext.feature.title}
Feature Description: ${hierarchyContext.feature.description || 'Not provided'}

`
    : '';

  const storySection = hierarchyContext?.userStory
    ? `User Story: ${hierarchyContext.userStory.title}

`
    : '';

  return `${epicSection}${featureSection}${storySection}${frameBlock(unit)}

${context ? `Additional context: ${context}` : ''}

Generate component/screen-level design Tasks for what's actually in this frame.`;
}

function buildUserStoryPrompt(
  unit: GenerationUnit,
  context?: string,
  hierarchyContext?: HierarchyContext
): string {
  const epicSection = hierarchyContext?.epic
    ? `Epic: ${hierarchyContext.epic.title}
Epic Description: ${hierarchyContext.epic.description || 'Not provided'}

`
    : '';

  return `${epicSection}${frameBlock(unit)}

${context ? `Additional context: ${context}` : ''}

Generate end-user User Stories ("As a [persona], I want ... so that ...") for the capability this screen enables.`;
}

function extractJson(text: string): string {
  // Find the first { and count brackets to find matching }
  const startIndex = text.indexOf('{');
  if (startIndex === -1) {
    throw new Error('No JSON object found in Claude response');
  }

  let depth = 0;
  let inString = false;
  let escapeNext = false;

  for (let i = startIndex; i < text.length; i++) {
    const char = text[i];

    if (escapeNext) {
      escapeNext = false;
      continue;
    }

    if (char === '\\' && inString) {
      escapeNext = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (inString) continue;

    if (char === '{') {
      depth++;
    } else if (char === '}') {
      depth--;
      if (depth === 0) {
        return text.slice(startIndex, i + 1);
      }
    }
  }

  throw new Error('Unbalanced JSON braces in Claude response');
}

interface ParsedTask {
  title: string;
  description: string;
}

interface ParsedUserStory {
  title: string;
  description?: string;
}

interface ParsedEpic {
  title: string;
  description: string;
}

interface ParsedFeature {
  title: string;
  description: string;
}

function parseTaskResponse(text: string): ParsedTask[] {
  const jsonStr = extractJson(text);
  let parsed: unknown;

  try {
    parsed = JSON.parse(jsonStr);
  } catch (err) {
    throw new Error(`Invalid JSON in Claude response: ${err instanceof Error ? err.message : 'parse error'}`);
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Claude response is not a JSON object');
  }

  const obj = parsed as Record<string, unknown>;
  if (!obj.tasks || !Array.isArray(obj.tasks)) {
    throw new Error('Missing tasks array in Claude response');
  }

  return obj.tasks.map((task: unknown, index: number) => {
    if (!task || typeof task !== 'object') {
      throw new Error(`Task ${index}: Invalid task object`);
    }
    const t = task as Record<string, unknown>;
    if (typeof t.title !== 'string' || !t.title) {
      throw new Error(`Task ${index}: Missing or invalid title`);
    }
    if (typeof t.description !== 'string' || !t.description) {
      throw new Error(`Task ${index}: Missing or invalid description`);
    }
    return { title: t.title, description: t.description };
  });
}

function parseUserStoryResponse(text: string): ParsedUserStory[] {
  const jsonStr = extractJson(text);
  let parsed: unknown;

  try {
    parsed = JSON.parse(jsonStr);
  } catch (err) {
    throw new Error(`Invalid JSON in Claude response: ${err instanceof Error ? err.message : 'parse error'}`);
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Claude response is not a JSON object');
  }

  const obj = parsed as Record<string, unknown>;
  if (!obj.stories || !Array.isArray(obj.stories)) {
    throw new Error('Missing stories array in Claude response');
  }

  return obj.stories.map((story: unknown, index: number) => {
    if (!story || typeof story !== 'object') {
      throw new Error(`Story ${index}: Invalid story object`);
    }
    const s = story as Record<string, unknown>;
    if (typeof s.title !== 'string' || !s.title) {
      throw new Error(`Story ${index}: Missing or invalid title`);
    }
    return {
      title: s.title,
      description: typeof s.description === 'string' ? s.description : undefined,
    };
  });
}

function parseEpicResponse(text: string): ParsedEpic[] {
  const jsonStr = extractJson(text);
  let parsed: unknown;

  try {
    parsed = JSON.parse(jsonStr);
  } catch (err) {
    throw new Error(`Invalid JSON in Claude response: ${err instanceof Error ? err.message : 'parse error'}`);
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Claude response is not a JSON object');
  }

  const obj = parsed as Record<string, unknown>;
  if (!obj.epics || !Array.isArray(obj.epics)) {
    throw new Error('Missing epics array in Claude response');
  }

  return obj.epics.map((epic: unknown, index: number) => {
    if (!epic || typeof epic !== 'object') {
      throw new Error(`Epic ${index}: Invalid epic object`);
    }
    const e = epic as Record<string, unknown>;
    if (typeof e.title !== 'string' || !e.title) {
      throw new Error(`Epic ${index}: Missing or invalid title`);
    }
    if (typeof e.description !== 'string' || !e.description) {
      throw new Error(`Epic ${index}: Missing or invalid description`);
    }
    return {
      title: e.title,
      description: e.description,
    };
  });
}

function parseFeatureResponse(text: string): ParsedFeature[] {
  const jsonStr = extractJson(text);
  let parsed: unknown;

  try {
    parsed = JSON.parse(jsonStr);
  } catch (err) {
    throw new Error(`Invalid JSON in Claude response: ${err instanceof Error ? err.message : 'parse error'}`);
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Claude response is not a JSON object');
  }

  const obj = parsed as Record<string, unknown>;
  if (!obj.features || !Array.isArray(obj.features)) {
    throw new Error('Missing features array in Claude response');
  }

  return obj.features.map((feature: unknown, index: number) => {
    if (!feature || typeof feature !== 'object') {
      throw new Error(`Feature ${index}: Invalid feature object`);
    }
    const f = feature as Record<string, unknown>;
    if (typeof f.title !== 'string' || !f.title) {
      throw new Error(`Feature ${index}: Missing or invalid title`);
    }
    if (typeof f.description !== 'string' || !f.description) {
      throw new Error(`Feature ${index}: Missing or invalid description`);
    }
    return {
      title: f.title,
      description: f.description,
    };
  });
}

// Backwards compatibility alias
function parseResponse(text: string): ParsedTask[] {
  return parseTaskResponse(text);
}

// Shared raw Claude call: retry + response-shape validation, returns the text.
// Every adapter funnels through this so retry and extraction logic live in one place.
export async function callClaudeJSON(
  system: string,
  user: string,
  maxTokens = 1500
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY environment variable is not set');
  }

  // Use fetch with retry logic for transient errors (429, 503, 529)
  const response = await fetchWithRetry('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: user }],
    }),
  });

  const data = (await response.json()) as {
    content: Array<{ type: string; text?: string }>;
  };

  // Validate response structure
  if (!data.content || !Array.isArray(data.content) || data.content.length === 0) {
    throw new Error('Empty or invalid response from Claude API');
  }

  const firstContent = data.content[0];
  if (!firstContent || firstContent.type !== 'text' || !firstContent.text) {
    throw new Error('Unexpected response format from Claude API');
  }

  return firstContent.text;
}

// Core generator: turns one normalized unit into work items via Claude.
// Used by every source adapter; the figma-frames path is just one caller.
export async function generateWorkItemsForUnit(
  unit: GenerationUnit,
  workItemType: WorkItemType = 'Task',
  context?: string,
  hierarchyContext?: HierarchyContext
): Promise<FrameWorkItems> {
  // Select system prompt and user prompt based on work item type
  let systemPrompt: string;
  let userPrompt: string;

  switch (workItemType) {
    case 'Epic':
      systemPrompt = EPIC_SYSTEM_PROMPT;
      userPrompt = buildEpicPrompt(unit, context);
      break;
    case 'Feature':
      systemPrompt = FEATURE_SYSTEM_PROMPT;
      userPrompt = buildFeaturePrompt(unit, context, hierarchyContext);
      break;
    case 'UserStory':
      systemPrompt = USER_STORY_SYSTEM_PROMPT;
      userPrompt = buildUserStoryPrompt(unit, context, hierarchyContext);
      break;
    case 'Task':
    default:
      systemPrompt = TASK_SYSTEM_PROMPT;
      userPrompt = buildTaskPrompt(unit, context, hierarchyContext);
      break;
  }

  const responseText = await callClaudeJSON(systemPrompt, userPrompt, 1500);

  let workItems: WorkItem[];

  switch (workItemType) {
    case 'Epic': {
      const parsedEpics = parseEpicResponse(responseText);
      workItems = parsedEpics.map((epic, index) => ({
        id: `${unit.refId}-${index + 1}`,
        title: epic.title,
        description: epic.description,
        selected: true,
      }));
      break;
    }
    case 'Feature': {
      const parsedFeatures = parseFeatureResponse(responseText);
      workItems = parsedFeatures.map((feature, index) => ({
        id: `${unit.refId}-${index + 1}`,
        title: feature.title,
        description: feature.description,
        selected: true,
      }));
      break;
    }
    case 'UserStory': {
      const parsedStories = parseUserStoryResponse(responseText);
      workItems = parsedStories.map((story, index) => ({
        id: `${unit.refId}-${index + 1}`,
        title: story.title,
        // User Stories don't have description - title uses "As a user..." format
        selected: true,
      }));
      break;
    }
    case 'Task':
    default: {
      const parsedTasks = parseTaskResponse(responseText);
      workItems = parsedTasks.map((task, index) => ({
        id: `${unit.refId}-${index + 1}`,
        title: task.title,
        description: task.description,
        selected: true,
      }));
      break;
    }
  }

  return {
    frameId: unit.refId,
    frameName: unit.refName,
    sectionName: (unit.content as FrameContent).sectionName,
    workItems,
  };
}

// Backwards compatibility - frame-shaped entry point. Normalizes through Adapter A.
export async function generateWorkItemsForFrame(
  frame: FrameData,
  workItemType: WorkItemType = 'Task',
  context?: string,
  hierarchyContext?: HierarchyContext
): Promise<FrameWorkItems> {
  return generateWorkItemsForUnit(
    frameToUnit(frame),
    workItemType,
    context,
    hierarchyContext
  );
}

// Backwards compatibility - generates tasks only
export async function generateTasksForFrame(
  frame: FrameData,
  context?: string
): Promise<FrameWorkItems & { tasks: WorkItem[] }> {
  const result = await generateWorkItemsForFrame(frame, 'Task', context);
  return {
    ...result,
    tasks: result.workItems, // Alias for backwards compatibility
  };
}
