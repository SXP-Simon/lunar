import { BottomSheet } from 'heroui-native/bottom-sheet';
import { Button } from 'heroui-native/button';
import { TextArea } from 'heroui-native/text-area';
import { useBottomSheetAwareHandlers } from 'heroui-native/hooks';
import { useToast } from 'heroui-native/toast';
import { useCallback, useEffect, useRef, useState, type ComponentProps } from 'react';
import { BackHandler, Keyboard, ScrollView, Text, View, type TextInput } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ConfirmModal } from '@/components/ui/confirm-modal';
import { useTranslation } from '@/i18n';
import {
  formatReaderNote,
  ReaderNoteFormats,
  ReaderNoteMaxLength,
  type NoteTextSelection,
  type ReaderNoteFormat,
} from '../domain/note-markdown';

const FormatGlyphs: Record<ReaderNoteFormat, string> = {
  bold: 'B',
  italic: 'I',
  heading: 'H',
  list: '≡',
  quote: '❝',
  code: '</>',
  link: '↗',
};

interface ReaderNoteEditorDrawerProps {
  readonly isOpen: boolean;
  readonly initialNote: string;
  readonly onClose: () => void;
  readonly onSave: (content: string) => Promise<void>;
}

export function ReaderNoteEditorDrawer({ isOpen, initialNote, onClose, onSave }: ReaderNoteEditorDrawerProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const insets = useSafeAreaInsets();
  const [value, setValue] = useState(initialNote);
  const [saving, setSaving] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const pending = useRef(false);
  const input = useRef<TextInput>(null);
  const cursor = useRef<NoteTextSelection>({ start: 0, end: 0 });
  const [selection, setSelection] = useState<NoteTextSelection>();
  const dirty = value !== initialNote;

  const close = useCallback(() => {
    if (pending.current) return;
    if (dirty) {
      setDiscarding(true);
      return;
    }
    Keyboard.dismiss();
    onClose();
  }, [dirty, onClose]);

  useEffect(() => {
    if (!isOpen || discarding) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      close();
      return true;
    });
    return () => subscription.remove();
  }, [close, discarding, isOpen]);

  function format(kind: ReaderNoteFormat) {
    const result = formatReaderNote(value, cursor.current, kind, t('reader.noteFormatPlaceholder'));
    if (result.text.length > ReaderNoteMaxLength) return;
    setValue(result.text);
    setSelection(result.selection);
    cursor.current = result.selection;
    input.current?.focus();
  }

  async function save() {
    if (pending.current || !value.trim()) return;
    pending.current = true;
    setSaving(true);
    try {
      await onSave(value);
      Keyboard.dismiss();
      onClose();
      toast.show({ variant: 'success', label: t('reader.noteSaved') });
    } catch (error) {
      toast.show({
        variant: 'danger',
        label: t('reader.noteSaveFailed'),
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      pending.current = false;
      setSaving(false);
    }
  }

  return (
    <>
      <BottomSheet
        isOpen={isOpen}
        onOpenChange={(next) => {
          if (!next) close();
        }}>
        <BottomSheet.Portal unstable_accessibilityContainerViewIsModal>
          <BottomSheet.Overlay isCloseOnPress={!saving} />
          <BottomSheet.Content
            snapPoints={['72%', '92%']}
            enableDynamicSizing={false}
            enableOverDrag={false}
            enablePanDownToClose={!dirty && !saving}
            enableContentPanningGesture={false}
            topInset={insets.top}
            keyboardBehavior="interactive"
            keyboardBlurBehavior="restore"
            android_keyboardInputMode="adjustResize"
            backgroundClassName="rounded-t-3xl bg-background dark:bg-overlay"
            contentContainerClassName="h-full flex-1 gap-3 px-5 pt-2"
            contentContainerProps={{ style: { paddingBottom: insets.bottom + 16 } }}>
            <View className="flex-row items-center justify-between">
              <Button size="sm" variant="ghost" isDisabled={saving} onPress={close}>
                {t('action.cancel')}
              </Button>
              <BottomSheet.Title>{t(initialNote ? 'reader.noteEdit' : 'reader.noteAdd')}</BottomSheet.Title>
              <Button
                size="sm"
                variant="primary"
                isDisabled={saving || !dirty || !value.trim()}
                onPress={() => void save()}>
                {t(saving ? 'reader.noteSaving' : 'reader.noteSave')}
              </Button>
            </View>
            <View className="min-h-0 flex-1 rounded-2xl bg-surface p-3">
              <ScrollView
                horizontal
                keyboardShouldPersistTaps="always"
                showsHorizontalScrollIndicator={false}
                className="max-h-11 grow-0">
                {ReaderNoteFormats.map((kind) => (
                  <Button
                    key={kind}
                    isIconOnly
                    size="sm"
                    variant="ghost"
                    className="size-10 rounded-lg"
                    accessibilityLabel={t(`reader.noteFormat.${kind}`)}
                    isDisabled={saving}
                    onPress={() => format(kind)}>
                    <Button.Label className={kind === 'italic' ? 'text-base italic' : 'text-base font-semibold'}>
                      {FormatGlyphs[kind]}
                    </Button.Label>
                  </Button>
                ))}
              </ScrollView>
              <NoteEditorInput
                ref={input}
                value={value}
                selection={selection}
                isDisabled={saving}
                accessibilityLabel={t('reader.noteMine')}
                placeholder={t('reader.notePlaceholder')}
                className="min-h-0 flex-1 bg-transparent px-0 py-3 text-base leading-6"
                maxLength={ReaderNoteMaxLength}
                onChangeText={(text) => {
                  setValue(text);
                  setSelection(undefined);
                }}
                onSelectionChange={(event) => {
                  cursor.current = event.nativeEvent.selection;
                }}
              />
              <Text className="text-xs text-muted">
                {t('reader.noteMarkdownHint')} · {value.length}/{ReaderNoteMaxLength}
              </Text>
            </View>
          </BottomSheet.Content>
        </BottomSheet.Portal>
      </BottomSheet>
      <ConfirmModal
        isOpen={discarding}
        title={t('reader.noteDiscardTitle')}
        description={t('reader.noteDiscardDescription')}
        confirmLabel={t('reader.noteDiscard')}
        isDestructive
        isConfirming={saving}
        onOpenChange={(open) => {
          if (!open && !pending.current) setDiscarding(false);
        }}
        onConfirm={() => {
          setDiscarding(false);
          Keyboard.dismiss();
          onClose();
        }}
      />
    </>
  );
}

function NoteEditorInput(props: ComponentProps<typeof TextArea>) {
  const { onFocus, onBlur } = useBottomSheetAwareHandlers();
  return <TextArea {...props} onFocus={onFocus} onBlur={onBlur} />;
}
