// Parses the rewritten-speech markup produced by the AI coach:
// "|" = pause, "**bold**" = emphasis, "*italic*" = slow down,
// "[[word]]" = new vocabulary or corrected-pronunciation highlight.
// Anything that doesn't match a token (e.g. a stray unmatched "*") is left
// as plain text rather than breaking the render.

export type SpeechMarkupSegment =
  | { type: 'text'; content: string }
  | { type: 'pause' }
  | { type: 'bold'; content: string }
  | { type: 'italic'; content: string }
  | { type: 'highlight'; content: string };

const TOKEN_REGEX = /\[\[(.+?)\]\]|\*\*(.+?)\*\*|\*(.+?)\*|\|/g;

export function parseSpeechMarkup(text: string): SpeechMarkupSegment[] {
  if (!text) return [];

  const segments: SpeechMarkupSegment[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  TOKEN_REGEX.lastIndex = 0;
  while ((match = TOKEN_REGEX.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: 'text', content: text.slice(lastIndex, match.index) });
    }

    const [full, highlight, bold, italic] = match;
    if (highlight !== undefined) {
      segments.push({ type: 'highlight', content: highlight });
    } else if (bold !== undefined) {
      segments.push({ type: 'bold', content: bold });
    } else if (italic !== undefined) {
      segments.push({ type: 'italic', content: italic });
    } else {
      segments.push({ type: 'pause' });
    }

    lastIndex = match.index + full.length;
  }

  if (lastIndex < text.length) {
    segments.push({ type: 'text', content: text.slice(lastIndex) });
  }

  return segments;
}

// Strips all markup down to plain text, e.g. for a text-only preview.
export function stripSpeechMarkup(text: string): string {
  return parseSpeechMarkup(text)
    .map((segment) => (segment.type === 'text' || segment.type === 'bold' || segment.type === 'italic' || segment.type === 'highlight'
      ? segment.content
      : ''))
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
}
