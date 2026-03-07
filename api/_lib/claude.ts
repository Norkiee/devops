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

const EPIC_SYSTEM_PROMPT = `You are a design initiative generator for UI/UX designers. Given information about design frames from Figma, generate high-level Epics that represent major design efforts and initiatives.

Context:
- Epics are large bodies of design work that can be broken down into smaller pieces
- They represent significant design initiatives, system overhauls, or comprehensive design projects
- They should be design-outcome focused, not development-focused

Generate 1-2 Epics per frame depending on scope:
- Single-purpose frames: 1 epic
- Complex frames with multiple design concerns: 2 epics

Examples of design-focused Epics:
- "Design System Foundation"
- "Mobile-First Responsive Redesign"
- "Accessibility Compliance Design Audit"
- "Complete Visual Language for Authentication Flow"
- "Dashboard Information Architecture Redesign"

Guidelines:
- Title format: Design initiative phrase (e.g., "Design System Foundation", "Visual Identity Refresh")
- Description should explain the design goals, scope, and expected deliverables
- Include acceptance criteria as design quality metrics and deliverables
- Focus on design outcomes: mockups, prototypes, specs, documentation
- Keep scope large enough to contain multiple design features/stories

Output JSON format:
{
  "epics": [
    {
      "title": "string",
      "description": "string",
      "acceptanceCriteria": "string (bullet points separated by newlines)"
    }
  ]
}`;

const FEATURE_SYSTEM_PROMPT = `You are a design feature generator for UI/UX designers. Given information about a design frame from Figma and optionally the parent Epic context, generate Features that represent distinct design deliverables and capabilities.

Context:
- Features are mid-level design work items between Epics and User Stories
- They represent a specific design deliverable or design capability
- They should be completable within a few sprints by a designer

Generate 1-3 Features per frame depending on complexity:
- Simple frames: 1 feature
- Medium frames: 2 features
- Complex frames with distinct design concerns: 3 features

Examples of design-focused Features:
- "Complete Visual Design System for Authentication"
- "Interactive Prototype for Onboarding Flow"
- "Responsive Design Specifications"
- "Component Library for Form Elements"
- "Motion Design for Page Transitions"

Guidelines:
- Title format: Design deliverable phrase (e.g., "High-Fidelity Dashboard Mockups", "Interactive Checkout Prototype")
- Description should explain what design deliverable is being created and its purpose
- Include acceptance criteria as design quality standards and deliverables
- Focus on design outputs: mockups, prototypes, specs, components, documentation
- Each feature should be independently deliverable by a designer

Output JSON format:
{
  "features": [
    {
      "title": "string",
      "description": "string",
      "acceptanceCriteria": "string (bullet points separated by newlines)"
    }
  ]
}`;

const TASK_SYSTEM_PROMPT = `You are a design task generator for UI/UX designers. Given information about a design frame from Figma and the parent context, generate clear, actionable design tasks.

Context:
- You will receive the parent Epic/Feature/User Story context when available
- Tasks should be completable by a designer in Figma or design tools
- Tasks should produce design deliverables, not code

Generate 1-5 design tasks per frame depending on complexity:
- Simple frames (few elements): 1-2 tasks
- Medium frames (forms, sections): 2-3 tasks
- Complex frames (dashboards): 3-5 tasks

Task types to consider:
- Visual design: mockups, color refinement, typography, spacing, visual polish
- Interaction design: hover states, transitions, animations, micro-interactions
- Prototyping: interactive flows, click-through demos, user flow connections
- Documentation: design specs, handoff notes, component documentation, annotations
- Design system: component creation, pattern library updates, style guide entries
- Iteration: incorporate feedback, refine based on review, explore alternatives

Guidelines:
- Start titles with design verbs: "Design", "Create", "Refine", "Document", "Prototype", "Iterate", "Define", "Specify"
- Focus on design deliverables, not development implementation
- Reference specific UI elements visible in the frame
- Keep tasks actionable and completable by a designer
- Don't create tasks too granular ("Adjust padding") or too broad ("Design entire app")

Output JSON format:
{
  "tasks": [
    { "title": "string", "description": "string" }
  ]
}`;

const USER_STORY_SYSTEM_PROMPT = `You are a design requirements generator for UI/UX designers. Given information about a design frame from Figma and the parent Epic context, generate design-focused User Stories.

Context:
- You will receive the Epic title and description that these stories belong to
- Each story should represent design work that contributes to the Epic's goals
- Stories should be independently deliverable by a designer

Generate 1-3 User Stories per frame depending on complexity:
- Simple frames (single purpose): 1 story
- Medium frames (multiple design concerns): 2 stories
- Complex frames (many interactions/states): 3 stories

Examples of design-focused User Stories:
- "Designer can create responsive layouts so that the design works across breakpoints"
- "Designer can document component states so that developers understand all variations"
- "Designer can prototype the checkout flow so that stakeholders can review the experience"
- "Designer can define interaction patterns so that the UI feels consistent"

Guidelines:
- Title format: "Designer can [design action]" or "[Design outcome] for [screen/component]"
- Description format: "As a designer, I want to [design action] so that [design outcome/benefit]"
- Include acceptance criteria as design deliverables and quality standards
- Each story should be testable and deliverable by a designer
- Focus on design outcomes: mockups, prototypes, specs, documentation
- Keep scope reasonable (not too broad, not too narrow)

Output JSON format:
{
  "stories": [
    {
      "title": "string",
      "description": "string",
      "acceptanceCriteria": "string (bullet points separated by newlines)"
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
Story Description: ${hierarchyContext.userStory.description || 'Not provided'}
Acceptance Criteria: ${hierarchyContext.userStory.acceptanceCriteria || 'Not provided'}

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
  description: string;
  acceptanceCriteria?: string;
}

interface ParsedEpic {
  title: string;
  description: string;
  acceptanceCriteria?: string;
}

interface ParsedFeature {
  title: string;
  description: string;
  acceptanceCriteria?: string;
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
    if (typeof s.description !== 'string' || !s.description) {
      throw new Error(`Story ${index}: Missing or invalid description`);
    }
    return {
      title: s.title,
      description: s.description,
      acceptanceCriteria: typeof s.acceptanceCriteria === 'string' ? s.acceptanceCriteria : undefined,
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
      acceptanceCriteria: typeof e.acceptanceCriteria === 'string' ? e.acceptanceCriteria : undefined,
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
      acceptanceCriteria: typeof f.acceptanceCriteria === 'string' ? f.acceptanceCriteria : undefined,
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
        acceptanceCriteria: epic.acceptanceCriteria,
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
        acceptanceCriteria: feature.acceptanceCriteria,
        selected: true,
      }));
      break;
    }
    case 'UserStory': {
      const parsedStories = parseUserStoryResponse(responseText);
      workItems = parsedStories.map((story, index) => ({
        id: `${frame.id}-${index + 1}`,
        title: story.title,
        description: story.description,
        acceptanceCriteria: story.acceptanceCriteria,
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
