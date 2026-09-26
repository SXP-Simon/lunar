import React, { type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReaderNoteEditorDrawer } from '../../src/features/reader/components/reader-note-editor-drawer';
import { ReaderNotesOverlay } from '../../src/features/reader/components/reader-notes-overlay';
import type { ReaderNote } from '../../src/features/reader/domain/reader-highlight';

const ui = vi.hoisted(() => ({
  cells: [] as unknown[], cursor: 0,
  buttons: new Map<string, { onPress: () => void; isDisabled?: boolean }>(),
  input: undefined as undefined | { value: string; onChangeText: (value: string) => void },
  confirm: undefined as undefined | { isOpen: boolean; onConfirm: () => void; onOpenChange: (open: boolean) => void },
  toast: vi.fn(),
}));

vi.mock('react', async (importOriginal) => {
  const original = await importOriginal<typeof import('react')>();
  return { ...original,
    useState: (initial: unknown) => {
      const index = ui.cursor++;
      if (!(index in ui.cells)) ui.cells[index] = initial;
      return [ui.cells[index], (next: unknown) => { ui.cells[index] = typeof next === 'function' ? next(ui.cells[index]) : next; }];
    },
    useRef: (initial: unknown) => {
      const index = ui.cursor++;
      if (!(index in ui.cells)) ui.cells[index] = { current: initial };
      return ui.cells[index];
    },
    useEffect: () => {},
    useCallback: (callback: unknown) => callback,
  };
});
vi.mock('react-native', () => ({
  Text: ({ children }: { children: ReactNode }) => <span>{children}</span>,
  View: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  ScrollView: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Keyboard: { dismiss: vi.fn() }, BackHandler: {}, useWindowDimensions: () => ({ height: 844 }),
}));
vi.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 24, bottom: 24 }) }));
vi.mock('expo-symbols', () => ({ SymbolView: () => null }));
vi.mock('heroui-native/hooks', () => ({ useThemeColor: () => '#fff', useBottomSheetAwareHandlers: () => ({ onFocus: vi.fn(), onBlur: vi.fn() }) }));
vi.mock('expo-blur', () => ({ BlurView: () => null }));
vi.mock('expo-clipboard', () => ({ setStringAsync: vi.fn().mockResolvedValue(undefined) }));
vi.mock('uniwind', () => ({ useUniwind: () => ({ theme: 'dark' }), withUniwind: (component: unknown) => component }));
vi.mock('react-native-reanimated', () => ({
  default: { View: ({ children }: { children: ReactNode }) => <div>{children}</div> },
  FadeIn: { duration: () => ({}) }, FadeOut: { duration: () => ({}) },
}));
vi.mock('@/i18n', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('heroui-native/toast', () => ({ useToast: () => ({ toast: { show: ui.toast } }) }));
vi.mock('heroui-native/text-area', () => ({ TextArea: (props: typeof ui.input) => { ui.input = props; return null; } }));
vi.mock('@/components/ui/confirm-modal', () => ({ ConfirmModal: (props: typeof ui.confirm) => { ui.confirm = props; return null; } }));
vi.mock('../../src/features/reader/components/reader-note-markdown', () => ({ ReaderNoteMarkdown: ({ value }: { value: string }) => <span>{value}</span> }));
vi.mock('heroui-native/bottom-sheet', () => {
  const Container = ({ children }: { children: ReactNode }) => children;
  return { BottomSheet: Object.assign(Container, { Portal: Container, Content: Container, Title: Container, Overlay: () => null }) };
});
vi.mock('heroui-native/button', () => ({ Button: Object.assign((props: {
  children: ReactNode; accessibilityLabel?: string; onPress: () => void; isDisabled?: boolean;
}) => {
  const labelChild = Array.isArray(props.children) ? props.children.at(-1) : props.children;
  const label = props.accessibilityLabel ?? (typeof labelChild === 'string' ? labelChild
    : (labelChild as React.ReactElement<{ children: string }>).props.children);
  ui.buttons.set(label, props);
  return props.children;
}, { Label: ({ children }: { children: ReactNode }) => children }) }));

beforeEach(() => {
  vi.stubGlobal('React', React);
  ui.cells = []; ui.cursor = 0; ui.buttons.clear(); ui.toast.mockClear(); ui.input = undefined;
});
afterEach(() => vi.unstubAllGlobals());

function setup(initialNote = '', onSave = vi.fn().mockResolvedValue(undefined)) {
  const onClose = vi.fn();
  const render = () => {
    ui.cursor = 0;
    ui.input = undefined;
    renderToStaticMarkup(<ReaderNoteEditorDrawer isOpen initialNote={initialNote} onClose={onClose} onSave={onSave} />);
  };
  render();
  return { render, onClose, onSave };
}

describe('reader note editor interactions', () => {
  it('retains the draft after a save failure and allows retrying', async () => {
    const onSave = vi.fn().mockRejectedValueOnce(new Error('disk full')).mockResolvedValue(undefined);
    const app = setup('', onSave);
    ui.input!.onChangeText('**我的笔记**'); app.render();
    ui.buttons.get('reader.noteSave')!.onPress();
    await vi.waitFor(() => expect(ui.toast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'danger' })));
    app.render();
    expect(ui.input!.value).toBe('**我的笔记**');
    expect(app.onClose).not.toHaveBeenCalled();
    ui.buttons.get('reader.noteSave')!.onPress();
    await vi.waitFor(() => expect(app.onClose).toHaveBeenCalledOnce());
    expect(onSave).toHaveBeenLastCalledWith('**我的笔记**');
  });
  it('requires confirmation before discarding an edited draft', () => {
    const app = setup();
    ui.input!.onChangeText('draft'); app.render();
    ui.buttons.get('action.cancel')!.onPress(); app.render();
    expect(ui.confirm!.isOpen).toBe(true);
    expect(app.onClose).not.toHaveBeenCalled();
    ui.confirm!.onOpenChange(false); app.render();
    expect(ui.input!.value).toBe('draft');
    ui.buttons.get('action.cancel')!.onPress(); app.render();
    ui.confirm!.onConfirm();
    expect(app.onClose).toHaveBeenCalledOnce();
    expect(app.onSave).not.toHaveBeenCalled();
  });
  it('loads the selected note for editing', async () => {
    const app = setup('# Saved');
    expect(ui.input!.value).toBe('# Saved');
    ui.input!.onChangeText('# Edited'); app.render();
    ui.buttons.get('reader.noteSave')!.onPress();
    await vi.waitFor(() => expect(app.onClose).toHaveBeenCalledOnce());
    expect(app.onSave).toHaveBeenCalledWith('# Edited');
  });
  it('submits once and prevents closing while the save is pending', async () => {
    let finish!: () => void;
    const app = setup('', vi.fn(() => new Promise<void>((resolve) => { finish = resolve; })));
    ui.input!.onChangeText('draft'); app.render();
    const save = ui.buttons.get('reader.noteSave')!.onPress;
    save(); save();
    ui.buttons.get('action.cancel')!.onPress();
    expect(app.onSave).toHaveBeenCalledOnce();
    expect(app.onClose).not.toHaveBeenCalled();
    finish();
    await vi.waitFor(() => expect(app.onClose).toHaveBeenCalledOnce());
  });
});

describe('reader notes viewing overlay', () => {
  function setupViewer(notes: readonly ReaderNote[] = []) {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const onRemove = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();
    const render = () => {
      ui.cursor = 0; ui.input = undefined;
      return renderToStaticMarkup(<ReaderNotesOverlay quote="引用原文" notes={notes} blurTarget={{ current: null }}
        onSave={onSave} onRemove={onRemove} onClose={onClose} />);
    };
    return { render, onSave, onRemove, onClose };
  }

  const notes = [
    { id: 'first', content: '**第一条**', createdAt: 1, updatedAt: 1 },
    { id: 'second', content: '*第二条*', createdAt: 2, updatedAt: 2 },
  ];

  it('shows the quote and independent notes before mounting an editor', () => {
    const app = setupViewer(notes);
    const markup = app.render();
    expect(markup).toContain('引用原文');
    expect(markup).toContain('**第一条**');
    expect(markup).toContain('*第二条*');
    expect(ui.input).toBeUndefined();
  });
  it('opens an empty drawer only after Add note and keeps the viewer open after saving', async () => {
    const app = setupViewer();
    expect(app.render()).toContain('reader.noteNone');
    ui.buttons.get('reader.noteAdd')!.onPress(); app.render();
    expect(ui.input!.value).toBe('');
    ui.input!.onChangeText('新笔记'); app.render();
    ui.buttons.get('reader.noteSave')!.onPress();
    await vi.waitFor(() => expect(app.onSave).toHaveBeenCalledWith('新笔记', undefined));
    expect(app.onClose).not.toHaveBeenCalled();
  });
  it('edits and deletes a note by ID, leaving other note cards in the viewer', async () => {
    const app = setupViewer(notes); app.render();
    ui.buttons.get('reader.noteEdit')!.onPress(); app.render();
    expect(ui.input!.value).toBe('*第二条*');
    ui.input!.onChangeText('修改第二条'); app.render();
    ui.buttons.get('reader.noteSave')!.onPress();
    await vi.waitFor(() => expect(app.onSave).toHaveBeenCalledWith('修改第二条', 'second'));
    app.render();
    ui.buttons.get('reader.noteDelete')!.onPress(); app.render();
    expect(ui.confirm!.isOpen).toBe(true);
    ui.confirm!.onConfirm();
    await vi.waitFor(() => expect(app.onRemove).toHaveBeenCalledWith('second'));
    expect(app.onClose).not.toHaveBeenCalled();
  });
});
