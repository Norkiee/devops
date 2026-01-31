import Anthropic from '@anthropic-ai/sdk';
import { FrameData, GeneratedTask } from './types';

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

function buildUserPrompt(frame: FrameData, context?: string): string {
  return `Frame name: ${frame.name}
Text content found: ${frame.textContent.join(', ') || 'None'}
Components used: ${frame.componentNames.join(', ') || 'None'}
Dimensions: ${frame.width}x${frame.height}

${context ? `Additional context: ${context}` : ''}

Generate a development task for implementing this design.`;
}

function parseResponse(text: string): { title: string; description: string } {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('No JSON found in Claude response');
  }
  const parsed = JSON.parse(jsonMatch[0]);
  if (!parsed.title || !parsed.description) {
    throw new Error('Missing title or description in Claude response');
  }
  return { title: parsed.title, description: parsed.description };
}

export async function generateTaskForFrame(
  frame: FrameData,
  context?: string
): Promise<GeneratedTask> {
  const message = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 500,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: buildUserPrompt(frame, context) }],
  });

  const responseText =
    message.content[0].type === 'text' ? message.content[0].text : '';
  const parsed = parseResponse(responseText);

  return {
    frameId: frame.id,
    frameName: frame.name,
    title: parsed.title,
    description: parsed.description,
  };
}
