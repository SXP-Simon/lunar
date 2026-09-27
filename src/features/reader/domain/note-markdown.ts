import ExpensiMark from 'expensify-common/ExpensiMark';
import htmlToMarkdown from 'html-to-md';

export const ReaderNoteMaxLength = 20000;

/** Use the editor's dialect for display, then let the renderer handle native layout. */
export function readerNoteDisplayMarkdown(value: string): string {
  const parser = new ExpensiMark();
  // Extend the library at its heading stage, after code has been protected.
  // The renderer can then preserve the actual heading level in saved notes.
  parser.rules.splice(
    parser.rules.findIndex((rule) => rule.name === 'heading1'),
    0,
    {
      name: 'note-headings',
      regex: /<(pre|code)\b[^>]*>[\s\S]*?<\/\1>|^(#{2,6})[ \t]+(?=\S)([^\r\n]+)/gm,
      replacement: (_extras, match, code, hashes, content) =>
        code ? match : `<h${hashes.length}>${content}</h${hashes.length}>`,
    },
  );
  return htmlToMarkdown(parser.replace(value));
}

export function readerNoteLink(href: string): string | undefined {
  try {
    const url = new URL(href);
    return ['https:', 'http:', 'mailto:'].includes(url.protocol) ? url.href : undefined;
  } catch {
    return undefined;
  }
}
