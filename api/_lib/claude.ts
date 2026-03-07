import { FrameData, FrameWorkItems, WorkItem, WorkItemType, HierarchyContext } from './types';

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

const EPIC_SYSTEM_PROMPT = `You help designers create Azure DevOps Epics from their Figma designs.

You will receive:
- Frame name and section (what the designer named this screen/component)
- Text content (labels, headings, button text visible in the design)
- Components used (UI components like buttons, inputs, cards)
- Nested frames (child sections within the design)
- Optional context from the designer

Your job: Create 1-2 Epics that capture the major design initiative this frame represents.

IMPORTANT:
- Base your output ONLY on the frame data provided - do not invent features not shown
- Use the frame name and text content to understand what this screen is for
- The title should reflect what's actually in the design (e.g., if it's a "Login Screen" frame with email/password fields, the epic is about authentication design)
- Write naturally, as a designer would describe their work to a PM

Output JSON:
{
  "epics": [
    {
      "title": "string - short phrase describing the design initiative",
      "description": "string - what design work this covers and why it matters"
    }
  ]
}`;

const FEATURE_SYSTEM_PROMPT = `You help designers create Azure DevOps Features from their Figma designs.

You will receive:
- Frame name and section (what the designer named this screen/component)
- Text content (labels, headings, button text visible in the design)
- Components used (UI components like buttons, inputs, cards)
- Nested frames (child sections within the design)
- Parent Epic context (if provided)
- Optional context from the designer

Your job: Create 1-3 Features representing specific design deliverables for this frame.

IMPORTANT:
- Base your output ONLY on the frame data provided - do not invent UI that isn't there
- Look at the text content and components to understand what needs to be designed
- If there's a parent Epic, ensure Features contribute to that initiative
- Features should be concrete deliverables: "High-fidelity mockups for [frame name]", "Interactive prototype for [specific flow]", "Design specs for [component]"

Output JSON:
{
  "features": [
    {
      "title": "string - specific design deliverable based on the frame",
      "description": "string - what will be created and how it fits the design"
    }
  ]
}`;

const TASK_SYSTEM_PROMPT = `You help designers create Azure DevOps Tasks from their Figma designs.

You will receive:
- Frame name and section (what the designer named this screen/component)
- Text content (actual labels, headings, button text from the design)
- Components used (specific UI components like "PrimaryButton", "TextInput", "Avatar")
- Nested frames (child sections like "Header", "Form", "Footer")
- Parent context: Epic, Feature, and/or User Story (if provided)
- Optional context from the designer

Your job: Create 1-5 actionable design tasks based on what's actually in the frame.

CRITICAL RULES:
- ONLY create tasks for elements that exist in the frame data
- Use the actual text content and component names in your task titles
- If the frame has "Email", "Password", "Sign In" text, tasks should reference those specific elements
- If components include "TextInput", "Button", create tasks about those specific components
- Do NOT invent generic tasks - every task must trace back to something in the frame

Task ideas based on frame content:
- If frame has form fields → "Design validation states for [field names from text content]"
- If frame has buttons → "Create hover and pressed states for [button text]"
- If frame has nested sections → "Finalize layout for [nested frame names]"

Write naturally, like a designer adding tasks to their sprint board.

Output JSON:
{
  "tasks": [
    {
      "title": "string - specific task referencing actual frame elements",
      "description": "string - what to do and which elements are involved"
    }
  ]
}`;

const USER_STORY_SYSTEM_PROMPT = `You help designers create Azure DevOps User Stories from their Figma designs.

You will receive:
- Frame name and section (what the designer named this screen/component)
- Text content (labels, headings, button text visible in the design)
- Components used (UI components in the frame)
- Nested frames (child sections within the design)
- Parent Epic context (if provided)
- Optional context from the designer

Your job: Create 1-3 User Stories for this specific frame.

IMPORTANT:
- Stories should be about designing what's IN the frame, not generic design work
- Reference actual elements from text content and components
- If there's a parent Epic, stories should clearly contribute to it
- Write naturally and specifically based on the frame content

Story format:
- Title: Must follow the format "As a [user type], I want [what] so that [why]"

Example titles:
- "As a designer, I want to finalize the Login Screen mockups so that development can begin"
- "As a user, I want to see clear error states on the form so that I know what to fix"
- "As a product team, I want an interactive prototype of the checkout flow so that we can test with users"

Output JSON:
{
  "stories": [
    {
      "title": "string - As a [user], I want [what] so that [why]"
    }
  ]
}`;

// Backwards compatibility alias
const SYSTEM_PROMPT = TASK_SYSTEM_PROMPT;

function buildEpicPrompt(
  frame: FrameData,
  context?: string
): string {
  return `Frame name: ${frame.name}
${frame.sectionName ? `Section: ${frame.sectionName}` : ''}
Text content found: ${frame.textContent.join(', ') || 'None'}
Components used: ${frame.componentNames.join(', ') || 'None'}
Nested sections: ${frame.nestedFrameNames?.join(', ') || 'None'}
Dimensions: ${frame.width}x${frame.height}

${context ? `Additional context: ${context}` : ''}

Generate Epics for this design frame that represent major design initiatives.`;
}

function buildFeaturePrompt(
  frame: FrameData,
  context?: string,
  hierarchyContext?: HierarchyContext
): string {
  const epicSection = hierarchyContext?.epic
    ? `Epic: ${hierarchyContext.epic.title}
Epic Description: ${hierarchyContext.epic.description || 'Not provided'}

`
    : '';

  return `${epicSection}Frame name: ${frame.name}
${frame.sectionName ? `Section: ${frame.sectionName}` : ''}
Text content found: ${frame.textContent.join(', ') || 'None'}
Components used: ${frame.componentNames.join(', ') || 'None'}
Nested sections: ${frame.nestedFrameNames?.join(', ') || 'None'}
Dimensions: ${frame.width}x${frame.height}

${context ? `Additional context: ${context}` : ''}

Generate Features for this design frame that represent distinct design deliverables.`;
}

function buildTaskPrompt(
  frame: FrameData,
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

  return `${epicSection}${featureSection}${storySection}Frame name: ${frame.name}
${frame.sectionName ? `Section: ${frame.sectionName}` : ''}
Text content found: ${frame.textContent.join(', ') || 'None'}
Components used: ${frame.componentNames.join(', ') || 'None'}
Nested sections: ${frame.nestedFrameNames?.join(', ') || 'None'}
Dimensions: ${frame.width}x${frame.height}

${context ? `Additional context: ${context}` : ''}

Generate design tasks for this frame that a designer can complete in Figma.`;
}

function buildUserStoryPrompt(
  frame: FrameData,
  context?: string,
  hierarchyContext?: HierarchyContext
): string {
  const epicSection = hierarchyContext?.epic
    ? `Epic: ${hierarchyContext.epic.title}
Epic Description: ${hierarchyContext.epic.description || 'Not provided'}

`
    : '';

  return `${epicSection}Frame name: ${frame.name}
${frame.sectionName ? `Section: ${frame.sectionName}` : ''}
Text content found: ${frame.textContent.join(', ') || 'None'}
Components used: ${frame.componentNames.join(', ') || 'None'}
Nested sections: ${frame.nestedFrameNames?.join(', ') || 'None'}
Dimensions: ${frame.width}x${frame.height}

${context ? `Additional context: ${context}` : ''}

Generate design-focused User Stories for this frame that a designer can deliver.`;
}

// Backwards compatibility
function buildUserPrompt(frame: FrameData, context?: string): string {
  return buildTaskPrompt(frame, context);
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

export async function generateWorkItemsForFrame(
  frame: FrameData,
  workItemType: WorkItemType = 'Task',
  context?: string,
  hierarchyContext?: HierarchyContext
): Promise<FrameWorkItems> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY environment variable is not set');
  }

  // Select system prompt and user prompt based on work item type
  let systemPrompt: string;
  let userPrompt: string;

  switch (workItemType) {
    case 'Epic':
      systemPrompt = EPIC_SYSTEM_PROMPT;
      userPrompt = buildEpicPrompt(frame, context);
      break;
    case 'Feature':
      systemPrompt = FEATURE_SYSTEM_PROMPT;
      userPrompt = buildFeaturePrompt(frame, context, hierarchyContext);
      break;
    case 'UserStory':
      systemPrompt = USER_STORY_SYSTEM_PROMPT;
      userPrompt = buildUserStoryPrompt(frame, context, hierarchyContext);
      break;
    case 'Task':
    default:
      systemPrompt = TASK_SYSTEM_PROMPT;
      userPrompt = buildTaskPrompt(frame, context, hierarchyContext);
      break;
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
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1500, // Slightly more for acceptance criteria
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
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

  const responseText = firstContent.text;

  let workItems: WorkItem[];

  switch (workItemType) {
    case 'Epic': {
      const parsedEpics = parseEpicResponse(responseText);
      workItems = parsedEpics.map((epic, index) => ({
        id: `${frame.id}-${index + 1}`,
        title: epic.title,
        description: epic.description,
        selected: true,
      }));
      break;
    }
    case 'Feature': {
      const parsedFeatures = parseFeatureResponse(responseText);
      workItems = parsedFeatures.map((feature, index) => ({
        id: `${frame.id}-${index + 1}`,
        title: feature.title,
        description: feature.description,
        selected: true,
      }));
      break;
    }
    case 'UserStory': {
      const parsedStories = parseUserStoryResponse(responseText);
      workItems = parsedStories.map((story, index) => ({
        id: `${frame.id}-${index + 1}`,
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
        id: `${frame.id}-${index + 1}`,
        title: task.title,
        description: task.description,
        selected: true,
      }));
      break;
    }
  }

  return {
    frameId: frame.id,
    frameName: frame.name,
    sectionName: frame.sectionName,
    workItems,
  };
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
