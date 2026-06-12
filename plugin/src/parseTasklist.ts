// Plugin 1 (team) — tasklist parser.
//
// Runs in the Figma SANDBOX (imported by main.ts), NOT the React UI, because it
// reads `node.characters` off TextNodes — an API only available to plugin code.
// It turns the text of a selected tasklist frame into a flat list of task titles
// and exposes a stable hash per title for the dedup ledger (see main.ts).

export interface ParsedTask {
  title: string;
  hash: string;
}

// A line is a task when it looks like a list item: a leading number marker
// (`1.`, `2)`) or a bullet (`-`, `•`, `*`, `–`, `▪`). Capturing group 1 is the
// marker we strip off.
const LIST_ITEM = /^\s*(?:\d+[.)]|[-•*–▪])\s+/;

// Date-shaped lines to skip: 12/06/2026, 2026-06-12, "June 12, 2026", "12 Jun".
const NUMERIC_DATE = /^\s*\d{1,4}[/-]\d{1,2}[/-]\d{1,4}\s*$/;
const MONTHS =
  '(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
const WORD_DATE = new RegExp(`^\\s*(?:\\d{1,2}\\s+)?${MONTHS}\\b.*$`, 'i');

// Lines that are structural labels, not tasks.
const LABEL = /^\s*tasks?\s*:?\s*$/i;

function isSkippableLine(line: string): boolean {
  if (!line) return true;
  if (LABEL.test(line)) return true;
  if (NUMERIC_DATE.test(line)) return true;
  if (WORD_DATE.test(line)) return true;
  return false;
}

// Normalize for dedup: trim + collapse inner whitespace + lowercase, so trivial
// edits (extra spaces, casing) don't create a "new" task on re-run.
export function normalizeLine(text: string): string {
  return text.trim().replace(/\s+/g, ' ').toLowerCase();
}

// FNV-1a 32-bit, hex. Deterministic and dependency-free — good enough as a
// dedup key for human-authored task lines (exact-match after normalization).
export function hashLine(text: string): string {
  let h = 0x811c9dc5;
  const s = normalizeLine(text);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

// A single line of text and whether Figma's native list formatting marks it as
// a list item. `fromList` is true when the line sits inside an ORDERED or
// UNORDERED list — in that case Figma renders the "1." / "•" itself and it is
// NOT present in `characters`, so we can't rely on a literal marker.
interface RawLine {
  text: string;
  fromList: boolean;
}

// Walk descendant TextNodes of the given nodes in reading order, splitting each
// into lines tagged with their native list state. Skips hidden subtrees (e.g.
// the template's hidden version footer). Reads list formatting per styled
// segment, since a single text node can mix list and non-list ranges.
function collectLines(nodes: readonly SceneNode[]): RawLine[] {
  const out: RawLine[] = [];
  const walk = (n: SceneNode): void => {
    if ('visible' in n && n.visible === false) return;
    if (n.type === 'TEXT') {
      const segments = n.getStyledTextSegments(['listOptions']);
      for (const seg of segments) {
        const fromList = !!seg.listOptions && seg.listOptions.type !== 'NONE';
        for (const line of seg.characters.split(/\r?\n/)) {
          out.push({ text: line, fromList });
        }
      }
    }
    if ('children' in n) {
      for (const child of n.children) walk(child);
    }
  };
  for (const n of nodes) walk(n);
  return out;
}

// Parse the selected nodes into deduped task titles. A line is a task when it
// is inside a Figma native list OR carries a literal list marker (`1.`, `-`).
// The leading marker, if any, is stripped; labels/dates and duplicates (by
// normalized form) are dropped.
export function parseTasklist(nodes: readonly SceneNode[]): ParsedTask[] {
  const seen = new Set<string>();
  const tasks: ParsedTask[] = [];

  for (const { text, fromList } of collectLines(nodes)) {
    const hasMarker = LIST_ITEM.test(text);
    if (!hasMarker && !fromList) continue;

    const title = (hasMarker ? text.replace(LIST_ITEM, '') : text).trim();
    if (isSkippableLine(title)) continue;

    const key = normalizeLine(title);
    if (!key || seen.has(key)) continue;
    seen.add(key);

    tasks.push({ title, hash: hashLine(title) });
  }

  return tasks;
}
