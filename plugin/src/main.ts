interface FrameData {
  id: string;
  name: string;
  textContent: string[];
  componentNames: string[];
  width: number;
  height: number;
}

function extractTextContent(node: SceneNode): string[] {
  const texts: string[] = [];

  if (node.type === 'TEXT') {
    texts.push(node.characters);
  }

  if ('children' in node) {
    for (const child of node.children) {
      texts.push(...extractTextContent(child));
    }
  }

  return texts;
}

function extractComponentNames(node: SceneNode): string[] {
  const names: string[] = [];

  if (node.type === 'INSTANCE') {
    const mainComponent = node.mainComponent;
    if (mainComponent) {
      names.push(mainComponent.name);
    }
  }

  if ('children' in node) {
    for (const child of node.children) {
      names.push(...extractComponentNames(child));
    }
  }

  return names;
}

function getSelectedFrames(): FrameData[] {
  return figma.currentPage.selection
    .filter((node): node is FrameNode => node.type === 'FRAME')
    .map((frame) => ({
      id: frame.id,
      name: frame.name,
      textContent: extractTextContent(frame),
      componentNames: extractComponentNames(frame),
      width: Math.round(frame.width),
      height: Math.round(frame.height),
    }));
}

figma.showUI(__html__, { width: 400, height: 600 });

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
