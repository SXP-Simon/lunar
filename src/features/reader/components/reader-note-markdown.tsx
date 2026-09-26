import { Linking } from 'react-native';
import Markdown, { MarkdownIt } from 'react-native-markdown-renderer';
import { useMemo } from 'react';
import { useResolveClassNames } from 'uniwind';
import { useToast } from 'heroui-native/toast';
import { useTranslation } from '@/i18n';
import { readerNoteLink } from '../domain/note-markdown';

const parser = new MarkdownIt({ html: false, linkify: true, breaks: true });
const ImageHandlers = ['https://', 'http://'];

/** Theme adapter; parsing and rendering are owned by the Markdown library. */
export function ReaderNoteMarkdown({ value }: { readonly value: string }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const body = useResolveClassNames('text-base leading-6 text-foreground');
  const foreground = useResolveClassNames('text-foreground');
  const code = useResolveClassNames('rounded-lg bg-default p-2 font-mono text-sm text-foreground');
  const quote = useResolveClassNames('border-l-2 border-navigation-active bg-default/40 py-2 pl-3');
  const link = useResolveClassNames('text-navigation-active underline');
  const border = useResolveClassNames('border-border');
  const rule = useResolveClassNames('bg-border');
  const tableHeader = useResolveClassNames('bg-default');
  const styles = useMemo(
    () => ({
      text: body,
      codeInline: code,
      codeBlock: code,
      inlineCode: code,
      heading: foreground,
      listUnorderedItemIcon: foreground,
      listOrderedItemIcon: foreground,
      blockquote: quote,
      link,
      blocklink: border,
      table: border,
      tableRow: border,
      tableRowCell: border,
      tableHeaderCell: border,
      tableHeader,
      heading1Container: border,
      heading2Container: border,
      hr: rule,
    }),
    [body, border, code, foreground, link, quote, rule, tableHeader],
  );

  return (
    <Markdown
      markdownit={parser}
      style={styles}
      allowedImageHandlers={ImageHandlers}
      defaultImageHandler={null}
      onLinkPress={(href) => {
        const url = readerNoteLink(href);
        if (url)
          void Linking.openURL(url).catch(() => toast.show({ variant: 'danger', label: t('reader.linkOpenFailed') }));
        return false;
      }}>
      {value}
    </Markdown>
  );
}
