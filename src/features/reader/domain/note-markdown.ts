import ExpensiMark from 'expensify-common/ExpensiMark';
import htmlToMarkdown from 'html-to-md';

export const ReaderNoteMaxLength = 20000;

/** Use the editor's dialect for display, then let the renderer handle native layout. */
export function readerNoteDisplayMarkdown(value: string): string {
  return htmlToMarkdown(new ExpensiMark().replace(value));
}

export function readerNoteLink(href: string): string | undefined {
  try {
    const url = new URL(href);
    return ['https:', 'http:', 'mailto:'].includes(url.protocol) ? url.href : undefined;
  } catch {
    return undefined;
  }
}
