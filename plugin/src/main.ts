interface FrameData {
  id: string;
  name: string;
  sectionName?: string;
  textContent: string[];
  componentNames: string[];
  nestedFrameNames: string[];
  width: number;
  height: number;
}

interface SectionData {
  id: string;
  name: string;
  frameCount: number;
}

interface SelectionResult {
  frames: FrameData[];
  sections: SectionData[];
}

function extractTextContent(node: SceneNode): string[] {
  const textContent: string[] = [];

  function traverse(n: SceneNode) {
    if (n.type === 'TEXT') {
      const text = n.characters.trim();
      if (text && text.length > 1 && !textContent.includes(text)) {
        textContent.push(text);
      }
    }
    if ('children' in n) {
      n.children.forEach(traverse);
    }
  }

  traverse(node);
  return textContent.slice(0, 30);
}

function extractComponentNames(node: SceneNode): string[] {
  const componentNames: string[] = [];

  function traverse(n: SceneNode) {
    if (n.type === 'INSTANCE') {
      const name = n.name;
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
  return componentNames.slice(0, 20);
}

function extractNestedFrameNames(node: SceneNode): string[] {
  const frameNames: string[] = [];

  function traverse(n: SceneNode, depth: number) {
    if (depth > 2) return;
    if (n.type === 'FRAME' && n !== node) {
      const name = n.name;
      if (name && !name.match(/^Frame\s*\d*$/i)) {
        if (!frameNames.includes(name)) {
          frameNames.push(name);
        }
      }
    }
    if ('children' in n) {
      n.children.forEach((child) => traverse(child, depth + 1));
    }
  }

  traverse(node, 0);
  return frameNames.slice(0, 10);
}

function buildFrameData(frame: FrameNode, sectionName?: string): FrameData {
  return {
    id: frame.id,
    name: frame.name,
    sectionName,
    textContent: extractTextContent(frame),
    componentNames: extractComponentNames(frame),
    nestedFrameNames: extractNestedFrameNames(frame),
    width: Math.round(frame.width),
    height: Math.round(frame.height),
  };
}

function getSelectedFrames(): SelectionResult {
  const frames: FrameData[] = [];
  const sections: SectionData[] = [];

  for (const node of figma.currentPage.selection) {
    if (node.type === 'FRAME') {
      // Direct frame selection
      frames.push(buildFrameData(node));
    } else if (node.type === 'SECTION') {
      // Section selected - get all child frames
      const sectionFrames = node.children
        .filter((child): child is FrameNode => child.type === 'FRAME');

      sections.push({
        id: node.id,
        name: node.name,
        frameCount: sectionFrames.length,
      });

      // Add frames with section name
      for (const frame of sectionFrames) {
        frames.push(buildFrameData(frame, node.name));
      }
    }
  }

  return { frames, sections };
}

figma.showUI(__html__, { width: 700, height: 520 });

figma.ui.onmessage = async (msg: { type: string; data?: unknown; height?: number }) => {
  if (msg.type === 'get-selection') {
    const { frames, sections } = getSelectedFrames();
    figma.ui.postMessage({ type: 'selection', frames, sections });
  }

  if (msg.type === 'get-storage') {
    const data = await figma.clientStorage.getAsync('devops-sync');
    figma.ui.postMessage({ type: 'storage', data: data || {} });
  }

  if (msg.type === 'set-storage') {
    await figma.clientStorage.setAsync('devops-sync', msg.data);
  }

  if (msg.type === 'resize') {
    const height = Math.min(Math.max(msg.height || 200, 200), 800);
    figma.ui.resize(700, height);
  }
};

figma.on('selectionchange', () => {
  const { frames, sections } = getSelectedFrames();
  figma.ui.postMessage({
    type: 'selection-changed',
    frameCount: frames.length,
    sectionCount: sections.length,
    sections,
  });
});
