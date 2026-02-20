import { FrameData, FrameTasks, TaskItem } from './types';

const MAX_RETRIES = 3;
const INITIAL_DELAY_MS = 1000;
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
    const response = await fetch(url, options);

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
  }

  throw lastError || new Error('Unknown error during fetch');
}

const SYSTEM_PROMPT = `You are a design task generator for UI/UX work. Given information about a design frame from Figma, analyze the content and generate clear, actionable design tasks.

Break down the frame into logical design tasks. Generate 1-5 tasks depending on complexity:
- Simple frames (few elements, single purpose): 1-2 tasks
- Medium frames (forms, multiple sections): 2-3 tasks
- Complex frames (dashboards, multi-feature screens): 3-5 tasks

Guidelines:
- Each task should represent a meaningful design deliverable
- Task titles should be concise and action-oriented (start with a verb like "Design", "Create", "Define", "Refine", "Specify")
- Descriptions should be 2-3 sentences covering the design work needed and key considerations
- Don't create tasks that are too granular (e.g., "Choose button color" is too small)
- Don't create tasks that are too broad (e.g., "Design the entire screen")
- Group related design elements into cohesive tasks
- Focus on design deliverables: layouts, components, states, interactions, specifications
- Consider visual design, interaction patterns, responsive behavior, and accessibility
- Do not include estimates or assignees
- Keep language professional and clear

Output JSON format:
{
  "tasks": [
    { "title": "string", "description": "string" },
    { "title": "string", "description": "string" }
  ]
}`;

function buildUserPrompt(frame: FrameData, context?: string): string {
  return `Frame name: ${frame.name}
Text content found: ${frame.textContent.join(', ') || 'None'}
Components used: ${frame.componentNames.join(', ') || 'None'}
Nested sections: ${frame.nestedFrameNames?.join(', ') || 'None'}
Dimensions: ${frame.width}x${frame.height}

${context ? `Additional context: ${context}` : ''}

Analyze this design frame and generate appropriate design tasks. Consider the complexity and break it down into logical, independently deliverable units of design work.`;
}

function parseResponse(text: string): Array<{ title: string; description: string }> {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('No JSON found in Claude response');
  }
  const parsed = JSON.parse(jsonMatch[0]);
  if (!parsed.tasks || !Array.isArray(parsed.tasks)) {
    throw new Error('Missing tasks array in Claude response');
  }
  return parsed.tasks.map((task: { title?: string; description?: string }) => {
    if (!task.title || !task.description) {
      throw new Error('Missing title or description in task');
    }
    return { title: task.title, description: task.description };
  });
}

export async function generateTasksForFrame(
  frame: FrameData,
  context?: string
): Promise<FrameTasks> {
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
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: buildUserPrompt(frame, context) }],
    }),
  });

  const data = (await response.json()) as {
    content: Array<{ type: string; text?: string }>;
  };
  const responseText =
    data.content[0].type === 'text' ? data.content[0].text || '' : '';
  const parsedTasks = parseResponse(responseText);

  const tasks: TaskItem[] = parsedTasks.map((task, index) => ({
    id: `${frame.id}-${index + 1}`,
    title: task.title,
    description: task.description,
    selected: true,
  }));

  return {
    frameId: frame.id,
    frameName: frame.name,
    tasks,
  };
}
