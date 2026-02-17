interface FrameData {
  id: string;
  name: string;
  textContent: string[];
  componentNames: string[];
  nestedFrameNames: string[];
  width: number;
  height: number;
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

function getSelectedFrames(): FrameData[] {
  return figma.currentPage.selection
    .filter((node): node is FrameNode => node.type === 'FRAME')
    .map(buildFrameData);
}

figma.showUI(__html__, { width: 400, height: 520 });

figma.ui.onmessage = async (msg: { type: string; data?: unknown }) => {
  if (msg.type === 'get-selection') {
    const frames = getSelectedFrames();
    figma.ui.postMessage({ type: 'selection', frames });
  }

  if (msg.type === 'get-storage') {
    const data = await figma.clientStorage.getAsync('devops-sync');
    figma.ui.postMessage({ type: 'storage', data: data || {} });
  }

  if (msg.type === 'set-storage') {
    await figma.clientStorage.setAsync('devops-sync', msg.data);
  }
};

figma.on('selectionchange', () => {
  const count = figma.currentPage.selection.filter(
    (node) => node.type === 'FRAME'
  ).length;
  figma.ui.postMessage({ type: 'selection-count', count });
});
