import { FrameData, FrameTasks, TaskItem } from './types';

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

function parseResponse(text: string): Array<{ title: string; description: string }> {
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

  // Validate response structure
  if (!data.content || !Array.isArray(data.content) || data.content.length === 0) {
    throw new Error('Empty or invalid response from Claude API');
  }

  const firstContent = data.content[0];
  if (!firstContent || firstContent.type !== 'text' || !firstContent.text) {
    throw new Error('Unexpected response format from Claude API');
  }

  const responseText = firstContent.text;
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
