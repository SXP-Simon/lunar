import { MarkdownTextInput, type MarkdownStyle } from '@expensify/react-native-live-markdown';
import { useThemeColor } from 'heroui-native/hooks';
import {
  useCallback,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  type ComponentProps,
  type ComponentRef,
} from 'react';
import { View } from 'react-native';
import { twMerge } from 'tailwind-merge';
import { useCSSVariable, withUniwind } from 'uniwind';
import { parseLiveMarkdown } from './live-markdown-parser';
import { formatMarkdown, type MarkdownEdit, type MarkdownFormat, type MarkdownSelection } from './markdown-edit';
import { MarkdownToolbar, type MarkdownToolbarLabels } from './markdown-toolbar';

const LiveMarkdownInput = withUniwind(MarkdownTextInput);

export type MarkdownEditorProps = Omit<ComponentProps<typeof LiveMarkdownInput>, 'parser' | 'markdownStyle'> & {
  readonly toolbarLabels?: MarkdownToolbarLabels;
};

/** Controlled Markdown input; the caller owns the draft, persistence and container. */
export function MarkdownEditor({
  className,
  maxLength,
  toolbarLabels,
  ref,
  onChangeText,
  onSelectionChange,
  ...props
}: MarkdownEditorProps) {
  const inputRef = useRef<ComponentRef<typeof LiveMarkdownInput>>(null);
  const selectionRef = useRef<MarkdownSelection>({ start: 0, end: 0 });
  const pendingEdit = useRef<MarkdownEdit | null>(null);
  useImperativeHandle(ref, () => inputRef.current!, []);
  // Apply a toolbar selection only after React has committed the new text. Normal
  // typing leaves selection entirely native, avoiding stale JS selection echoes.
  useLayoutEffect(() => {
    const edit = pendingEdit.current;
    if (!edit) return;
    pendingEdit.current = null;
    if (props.value === edit.value) {
      inputRef.current?.setSelection(edit.selection.start, edit.selection.end);
      inputRef.current?.focus();
    }
  }, [props.value]);
  function applyFormat(format: MarkdownFormat) {
    if (props.editable === false || typeof props.value !== 'string' || !onChangeText) return;
    const edit = formatMarkdown(props.value, selectionRef.current, format, maxLength);
    if (edit.value === props.value) return;
    pendingEdit.current = edit;
    selectionRef.current = edit.selection;
    onChangeText(edit.value);
  }
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
  const input = (
    <LiveMarkdownInput
      multiline
      textAlignVertical="top"
      placeholderTextColorClassName="accent-muted"
      selectionColorClassName="accent-navigation-active"
      {...props}
      ref={inputRef}
      onChangeText={(value) => {
        pendingEdit.current = null;
        onChangeText?.(value);
      }}
      onSelectionChange={(event) => {
        selectionRef.current = event.nativeEvent.selection;
        onSelectionChange?.(event);
      }}
      className={twMerge('bg-transparent text-base leading-6 text-foreground', className)}
      maxLength={maxLength}
      parser={parser}
      markdownStyle={markdownStyle}
    />
  );
  return toolbarLabels ? (
    <View className="min-h-0 flex-1">
      <MarkdownToolbar
        labels={toolbarLabels}
        disabled={props.editable === false || typeof props.value !== 'string' || !onChangeText}
        onFormat={applyFormat}
      />
      {input}
    </View>
  ) : (
    input
  );
}
