import React, { type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { formatReaderNote, readerNoteLink } from '../../src/features/reader/domain/note-markdown';
import { ReaderNoteMarkdown } from '../../src/features/reader/components/reader-note-markdown';
import { Linking } from 'react-native';

const renderer = vi.hoisted(() => ({ props: undefined as any }));
vi.mock('react-native-markdown-renderer', async () => {
  const { createRequire } = await import('node:module');
  const require = createRequire(import.meta.url);
  const libraryRequire = createRequire(require.resolve('react-native-markdown-renderer'));
  return { MarkdownIt: libraryRequire('markdown-it'), default: (props: any) => {
    renderer.props = props;
    return null;
  } };
});
vi.mock('uniwind', () => ({ useResolveClassNames: () => ({ color: '#ffffff' }) }));

vi.mock('react-native', () => ({
  View: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  ScrollView: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Text: ({ children, className, accessibilityRole }: { children: ReactNode; className?: string; accessibilityRole?: string }) =>
    <span className={className} role={accessibilityRole}>{children}</span>,
  Image: ({ source, accessibilityLabel }: { source: { uri: string }; accessibilityLabel?: string }) => <img src={source.uri} alt={accessibilityLabel} />,
  Linking: { openURL: vi.fn().mockResolvedValue(undefined) },
}));
vi.mock('@/i18n', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('heroui-native/toast', () => ({ useToast: () => ({ toast: { show: vi.fn() } }) }));
beforeEach(() => { vi.stubGlobal('React', React); vi.clearAllMocks(); });
afterEach(() => vi.unstubAllGlobals());

describe('reader Markdown notes', () => {
  it('formats a Chinese selection without modifying neighboring text', () => {
    expect(formatReaderNote('这是一段原文', { start: 2, end: 4 }, 'bold', '文字')).toEqual({
      text: '这是**一段**原文', selection: { start: 4, end: 6 },
    });
  });
  it('prefixes complete selected lines and inserts a placeholder at an empty cursor', () => {
    expect(formatReaderNote('第一行\n第二行', { start: 1, end: 7 }, 'list', '文字').text).toBe('- 第一行\n- 第二行');
    expect(formatReaderNote('', { start: 0, end: 0 }, 'heading', '文字').text).toBe('## 文字');
    expect(formatReaderNote('\n原文', { start: 0, end: 0 }, 'quote', '文字').text).toBe('> 文字\n原文');
  });
  it('creates a parseable fenced code block in the middle of a paragraph', () => {
    const formatted = formatReaderNote('beforecodeafter', { start: 6, end: 10 }, 'code', 'code');
    renderToStaticMarkup(<ReaderNoteMarkdown value={formatted.text} />);
    expect(renderer.props.markdownit.parse(formatted.text, {}).filter((token: any) => token.type === 'fence')).toHaveLength(1);
    expect(formatted.text.slice(formatted.selection.start, formatted.selection.end)).toBe('code');
  });
  it('delegates CommonMark content to the library parser and renderer', () => {
    const value = '# 标题\n\n**重要 *想法***\n\n> 引用\n\n- 完成\n- 待办\n\n```ts\nconst x = 1;\n```\n\n| 列名 |\n| --- |\n| 内容 |';
    renderToStaticMarkup(<ReaderNoteMarkdown value={value} />);
    expect(renderer.props.children).toBe(value);
    const markup = renderer.props.markdownit.render(value);
    expect(markup).toContain('<h1>');
    expect(markup).toContain('<strong>');
    expect(markup).toContain('<em>');
    expect(markup).toContain('<table>');
    expect(markup).toContain('引用');
    expect(markup).toContain('const x = 1;');
    expect(markup).toContain('列名');
    expect(markup).toContain('内容');
  });
  it('treats HTML as text and permits only supported external link schemes', () => {
    renderToStaticMarkup(<ReaderNoteMarkdown value={'<script>alert(1)</script>\n\n[unsafe](javascript:alert)\n\n[safe](https://example.com)'} />);
    const markup = renderer.props.markdownit.render(renderer.props.children);
    expect(markup).not.toContain('<script>');
    expect(markup.match(/<a /g)).toHaveLength(1);
    renderer.props.onLinkPress('file:///private/file');
    expect(Linking.openURL).not.toHaveBeenCalled();
    renderer.props.onLinkPress('https://example.com');
    expect(Linking.openURL).toHaveBeenCalledWith('https://example.com/');
    expect(readerNoteLink('https://example.com/path')).toBe('https://example.com/path');
    expect(readerNoteLink('mailto:test@example.com')).toBe('mailto:test@example.com');
    for (const url of ['javascript:alert(1)', 'file:///private/file', 'data:text/html,a', '../book.xhtml']) {
      expect(readerNoteLink(url)).toBeUndefined();
    }
  });
});
