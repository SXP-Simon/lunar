export const ReaderNoteMaxLength = 20000;
export const ReaderNoteFormats = ['bold', 'italic', 'heading', 'list', 'quote', 'code', 'link'] as const;
export type ReaderNoteFormat = (typeof ReaderNoteFormats)[number];
export interface NoteTextSelection {
  readonly start: number;
  readonly end: number;
}

export function readerNoteLink(href: string): string | undefined {
  try {
    const url = new URL(href);
    return ['https:', 'http:', 'mailto:'].includes(url.protocol) ? url.href : undefined;
  } catch {
    return undefined;
  }
}

export function formatReaderNote(
  value: string,
  selection: NoteTextSelection,
  format: ReaderNoteFormat,
  placeholder: string,
): { text: string; selection: NoteTextSelection } {
  const start = Math.max(0, Math.min(value.length, selection.start));
  const end = Math.max(start, Math.min(value.length, selection.end));
  if (format === 'heading' || format === 'list' || format === 'quote') {
    const lineStart = start === 0 ? 0 : value.lastIndexOf('\n', start - 1) + 1;
    const prefix = format === 'heading' ? '## ' : format === 'list' ? '- ' : '> ';
    const content = value.slice(lineStart, end) || placeholder;
    const replacement = content
      .split('\n')
      .map((line) => prefix + line)
      .join('\n');
    return {
      text: value.slice(0, lineStart) + replacement + value.slice(end),
      selection: { start: lineStart + prefix.length, end: lineStart + replacement.length },
    };
  }
  const content = value.slice(start, end) || placeholder;
  const before = value.slice(0, start);
  const after = value.slice(end);
  const prefix =
    format === 'bold'
      ? '**'
      : format === 'italic'
        ? '*'
        : format === 'link'
          ? '['
          : `${before && !before.endsWith('\n') ? '\n' : ''}\`\`\`\n`;
  const suffix =
    format === 'bold'
      ? '**'
      : format === 'italic'
        ? '*'
        : format === 'link'
          ? '](https://)'
          : `\n\`\`\`${after && !after.startsWith('\n') ? '\n' : ''}`;
  return {
    text: before + prefix + content + suffix + after,
    selection: { start: start + prefix.length, end: start + prefix.length + content.length },
  };
}
