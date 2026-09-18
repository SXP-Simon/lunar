import { BottomSheet } from 'heroui-native/bottom-sheet';
import { Button } from 'heroui-native/button';
import { SearchField } from 'heroui-native/search-field';
import { useMemo, useState } from 'react';
import { FlatList, Text, View } from 'react-native';

import { useTranslation } from '@/i18n';
import { LUNAR_READER_BUILTIN_FONT_REF, type ReaderFontRef, type ReaderFontRole } from '@/reader';
import { listSystemReaderFontFamilies } from '@/reader/native';
import { type ImportedReaderFont, useFontStore, useReaderStore } from '@/stores';

interface FontPickerSheetProps {
  readonly isOpen: boolean;
  readonly role: ReaderFontRole;
  readonly onOpenChange: (isOpen: boolean) => void;
}

type FontPickerItem =
  | { readonly kind: 'header'; readonly key: string; readonly title: string }
  | { readonly kind: 'note'; readonly key: string; readonly text: string }
  | {
      readonly kind: 'option';
      readonly key: string;
      readonly ref: ReaderFontRef;
      readonly title: string;
      /**
       * Renders the row's own name in the candidate face. Only system families
       * can do this — React Native cannot reach a file this app owns — and the
       * name is what the user is judging, so it doubles as the preview.
       */
      readonly previewFamily?: string;
    };

/** The selectable half of the list; a section is built from these alone. */
type FontOption = Extract<FontPickerItem, { kind: 'option' }>;

const BODY_SNAP_POINTS = ['55%'];
const CHROME_SNAP_POINTS = ['80%'];

/**
 * Picks the font for one reader role.
 *
 * The offered sources differ per role: body text is measured by the kernel, which
 * only accepts font bytes, so a system family could never be laid out and is not
 * offered there. Chrome is drawn by this app and can use anything the platform
 * font manager resolves.
 */
export function FontPickerSheet({ isOpen, role, onOpenChange }: FontPickerSheetProps) {
  const { t } = useTranslation();
  const typography = useReaderStore((state) => state.typography);
  const updateTypography = useReaderStore((state) => state.updateTypography);
  const fonts = useFontStore((state) => state.fonts);
  const [query, setQuery] = useState('');
  const allowsSystem = role === 'chrome';

  const items = useMemo<readonly FontPickerItem[]>(() => {
    // Enumerating the platform's families crosses the JSI boundary once per
    // family, so it only happens for a role that can actually offer them.
    const systemFamilies = allowsSystem && isOpen ? listSystemReaderFontFamilies() : [];
    const trimmedQuery = query.trim().toLocaleLowerCase();
    const sections: readonly {
      readonly id: string;
      readonly title: string;
      readonly options: readonly FontOption[];
      /** Shown in place of the options when the catalog itself is empty. */
      readonly emptyNote?: string;
    }[] = [
      {
        id: 'builtin',
        title: t('reader.fontSourceBuiltin'),
        options: [builtinOption(t('reader.builtinFont'))],
      },
      {
        id: 'imported',
        title: t('reader.importedFonts'),
        options: importedOptions(fonts),
        emptyNote: t('reader.noImportedFonts'),
      },
      {
        id: 'system',
        title: t('reader.systemFonts'),
        options: systemFamilies.map((family) => systemOption(family)),
      },
    ];

    const resolved: FontPickerItem[] = [];
    for (const section of sections) {
      const options = section.options.filter(
        (option) =>
          trimmedQuery === '' || option.title.toLocaleLowerCase().includes(trimmedQuery),
      );
      if (options.length === 0 && !(section.emptyNote && trimmedQuery === '')) {
        continue;
      }
      resolved.push({ kind: 'header', key: `h:${section.id}`, title: section.title });
      if (options.length > 0) {
        resolved.push(...options);
      } else {
        resolved.push({ kind: 'note', key: `n:${section.id}`, text: section.emptyNote ?? '' });
      }
    }
    return resolved;
  }, [allowsSystem, fonts, isOpen, query, t]);

  const selected = typography.fonts[role];
  const handleOpenChange = (nextIsOpen: boolean) => {
    if (!nextIsOpen) {
      // The sheet stays mounted between openings, so a stale filter would come
      // back as a list that looks empty for no visible reason.
      setQuery('');
    }
    onOpenChange(nextIsOpen);
  };

  return (
    <BottomSheet isOpen={isOpen} onOpenChange={handleOpenChange}>
      <BottomSheet.Portal
        disableFullWindowOverlay
        unstable_accessibilityContainerViewIsModal>
        <BottomSheet.Overlay variant="blur" blurViewProps={{ intensity: 28 }} />
        <BottomSheet.Content
          backgroundClassName="rounded-t-3xl bg-surface"
          contentContainerClassName="h-full"
          contentContainerProps={{ style: { flex: 1, padding: 0 } }}
          enableDynamicSizing={false}
          enableOverDrag={false}
          snapPoints={allowsSystem ? CHROME_SNAP_POINTS : BODY_SNAP_POINTS}>
          <View className="flex-1 gap-3 px-6 pb-8 pt-3">
            <BottomSheet.Title className="text-xl text-foreground">
              {t('reader.chooseFont')}
            </BottomSheet.Title>
            {allowsSystem ? (
              <SearchField value={query} onChange={setQuery}>
                <SearchField.Group>
                  <SearchField.SearchIcon />
                  <SearchField.Input placeholder={t('reader.searchFonts')} />
                  <SearchField.ClearButton />
                </SearchField.Group>
              </SearchField>
            ) : null}
            <FlatList
              className="flex-1"
              contentContainerClassName="gap-2 pb-4"
              data={items}
              keyExtractor={(item) => item.key}
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={
                <Text className="py-8 text-center text-sm text-muted">
                  {t('reader.noMatchingFonts')}
                </Text>
              }
              renderItem={({ item }) => {
                if (item.kind === 'header') {
                  return (
                    <Text className="px-1 pt-2 text-sm font-medium text-muted">{item.title}</Text>
                  );
                }
                if (item.kind === 'note') {
                  return <Text className="px-1 text-sm text-muted">{item.text}</Text>;
                }
                const isSelected = isSameFontRef(selected, item.ref);
                return (
                  <Button
                    accessibilityState={{ selected: isSelected }}
                    className="justify-start rounded-2xl"
                    onPress={() => {
                      updateTypography({ fonts: { ...typography.fonts, [role]: item.ref } });
                      handleOpenChange(false);
                    }}
                    variant={isSelected ? 'primary' : 'secondary'}>
                    <Button.Label
                      numberOfLines={1}
                      style={item.previewFamily ? { fontFamily: item.previewFamily } : undefined}>
                      {item.title}
                    </Button.Label>
                  </Button>
                );
              }}
              showsVerticalScrollIndicator={false}
            />
          </View>
        </BottomSheet.Content>
      </BottomSheet.Portal>
    </BottomSheet>
  );
}

function builtinOption(title: string): FontOption {
  return {
    kind: 'option',
    key: `builtin:${LUNAR_READER_BUILTIN_FONT_REF.family}`,
    ref: LUNAR_READER_BUILTIN_FONT_REF,
    title,
  };
}

function importedOptions(fonts: readonly ImportedReaderFont[]): readonly FontOption[] {
  // The catalog id is the file's digest, so selecting a font whose bytes changed
  // selects different bytes — and Rito's pinned set is rebuilt to match.
  return fonts.map((font) => ({
    kind: 'option',
    key: `imported:${font.id}`,
    ref: { source: 'imported', family: font.family, importedFontId: font.id },
    title: font.family,
  }));
}

function systemOption(family: string): FontOption {
  return {
    kind: 'option',
    key: `system:${family}`,
    ref: { source: 'system', family },
    title: family,
    previewFamily: family,
  };
}

function isSameFontRef(left: ReaderFontRef, right: ReaderFontRef): boolean {
  return (
    left.source === right.source
    && left.family === right.family
    && (left.importedFontId ?? '') === (right.importedFontId ?? '')
  );
}
