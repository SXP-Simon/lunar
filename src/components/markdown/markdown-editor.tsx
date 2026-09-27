import { MarkdownTextInput, type MarkdownStyle } from '@expensify/react-native-live-markdown';
import { useThemeColor } from 'heroui-native/hooks';
import { useCallback, useMemo, type ComponentProps } from 'react';
import { twMerge } from 'tailwind-merge';
import { useCSSVariable, withUniwind } from 'uniwind';
import { parseLiveMarkdown } from './live-markdown-parser';

const LiveMarkdownInput = withUniwind(MarkdownTextInput);

export type MarkdownEditorProps = Omit<ComponentProps<typeof LiveMarkdownInput>, 'parser' | 'markdownStyle'>;

/** Controlled Markdown input; the caller owns the draft, persistence and container. */
export function MarkdownEditor({ className, maxLength, ...props }: MarkdownEditorProps) {
  const [foreground, muted, background, border] = useThemeColor(['foreground', 'muted', 'default', 'border']);
  const link = useCSSVariable('--color-navigation-active') as string;
  const parser = useCallback(
    (input: string) => {
      'worklet';
      return parseLiveMarkdown(input, maxLength);
    },
    [maxLength],
  );
  const markdownStyle = useMemo<MarkdownStyle>(
    () => ({
      syntax: { color: muted },
      link: { color: link },
      blockquote: { borderColor: border },
      code: { color: foreground, backgroundColor: background, borderColor: border },
      pre: { color: foreground, backgroundColor: background, borderColor: border },
    }),
    [background, border, foreground, link, muted],
  );
  return (
    <LiveMarkdownInput
      multiline
      textAlignVertical="top"
      placeholderTextColorClassName="accent-muted"
      selectionColorClassName="accent-navigation-active"
      {...props}
      className={twMerge('bg-transparent text-base leading-6 text-foreground', className)}
      maxLength={maxLength}
      parser={parser}
      markdownStyle={markdownStyle}
    />
  );
}
