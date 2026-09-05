import React, { type ComponentProps, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MarksDrawer } from '../../src/features/reader/components/bottom-tabs/marks-drawer';
import { TocDrawer } from '../../src/features/reader/components/bottom-tabs/toc-drawer';

const { buttons, showToast } = vi.hoisted(() => ({
  buttons: new Map<string, () => void>(),
  showToast: vi.fn(),
}));

vi.mock('react-native', () => ({
  Text: ({ children }: { children: ReactNode }) => React.createElement('span', null, children),
  View: ({ children }: { children: ReactNode }) => React.createElement('div', null, children),
}));
vi.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ bottom: 0 }) }));
vi.mock('uniwind', () => ({ useCSSVariable: () => '#000000' }));
vi.mock('@/i18n', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('../../src/features/reader/components/bottom-tabs/constants', () => ({
  getReaderBottomTabBarInset: () => 48,
}));
vi.mock('heroui-native/toast', () => ({ useToast: () => ({ toast: { show: showToast } }) }));
vi.mock('heroui-native/bottom-sheet', () => {
  // Closing sheets retain their children while the native exit animation runs.
  const Container = ({ children }: { children: ReactNode }) => children;
  return { BottomSheet: Object.assign(Container, {
    Portal: Container, Content: Container, Overlay: () => null,
    Title: Container, Description: Container,
  }) };
});
vi.mock('heroui-native/button', () => ({
  Button: Object.assign((props: { accessibilityLabel: string; onPress: () => void; children: ReactNode }) => {
    buttons.set(props.accessibilityLabel, props.onPress);
    return props.children;
  }, { Label: ({ children }: { children: ReactNode }) => children }),
}));
vi.mock('@gorhom/bottom-sheet', () => ({
  BottomSheetFlatList: ({ data, renderItem, ListEmptyComponent }: {
    data: unknown[];
    renderItem: (value: { item: unknown }) => ReactNode;
    ListEmptyComponent: ReactNode;
  }) => data.length ? data.map((item, index) =>
    React.createElement(React.Fragment, { key: index }, renderItem({ item }))) : ListEmptyComponent,
}));

beforeEach(() => {
  vi.stubGlobal('React', React);
  buttons.clear();
  showToast.mockClear();
});
afterEach(() => vi.unstubAllGlobals());

function marksProps(): ComponentProps<typeof MarksDrawer> {
  return {
    isOpen: true,
    onOpenChange: vi.fn(),
    onNavigated: vi.fn(),
    runtime: { goToLocator: vi.fn().mockResolvedValue({}) } as unknown as ComponentProps<typeof MarksDrawer>['runtime'],
    toc: [],
    bookmarks: [{ id: 'bookmark', bookId: 'book', label: 'Saved chapter', text: 'Saved passage',
      locator: { spineIdref: 'chapter', manifestHref: 'chapter.xhtml', chapterProgress: 0 }, createdAt: 1 }],
    highlights: [],
    bookmarksLoaded: true,
    highlightsLoaded: true,
    onRemoveBookmark: vi.fn(),
  };
}

function tocProps(): ComponentProps<typeof TocDrawer> {
  return {
    isOpen: true,
    onOpenChange: vi.fn(),
    runtime: { goToToc: vi.fn().mockResolvedValue({}) } as unknown as ComponentProps<typeof TocDrawer>['runtime'],
    snapshot: { phase: 'ready' } as ComponentProps<typeof TocDrawer>['snapshot'],
    toc: [{ href: 'chapter.xhtml', label: 'Chapter title', children: [] }],
  };
}

describe('reader drawer navigation', () => {
  it('retains bookmarks throughout the closing render', () => {
    const props = marksProps();
    const open = renderToStaticMarkup(React.createElement(MarksDrawer, props));
    const closing = renderToStaticMarkup(React.createElement(MarksDrawer, { ...props, isOpen: false }));
    expect(closing).toBe(open);
    expect(closing).toContain('Saved passage');
    expect(closing).not.toContain('reader.noBookmarks');
  });

  it('retains the chapter list and count throughout the closing render', () => {
    const props = tocProps();
    const open = renderToStaticMarkup(React.createElement(TocDrawer, props));
    const closing = renderToStaticMarkup(React.createElement(TocDrawer, { ...props, isOpen: false }));
    expect(closing).toBe(open);
    expect(closing).toContain('Chapter title');
    expect(closing).not.toContain('reader.noToc');
  });

  it.each(['marks', 'toc'] as const)('waits for %s navigation and ignores duplicate presses', async (kind) => {
    let complete!: () => void;
    const navigation = vi.fn(() => new Promise<void>((resolve) => { complete = resolve; }));
    const props = kind === 'marks' ? marksProps() : tocProps();
    if (kind === 'marks') {
      props.runtime.goToLocator = navigation as typeof props.runtime.goToLocator;
      renderToStaticMarkup(React.createElement(MarksDrawer, props as ComponentProps<typeof MarksDrawer>));
    } else {
      props.runtime.goToToc = navigation as typeof props.runtime.goToToc;
      renderToStaticMarkup(React.createElement(TocDrawer, props as ComponentProps<typeof TocDrawer>));
    }
    const press = buttons.get(kind === 'marks' ? 'reader.goToMark' : 'reader.goToToc')!;
    press();
    press();
    expect(navigation).toHaveBeenCalledTimes(1);
    expect(props.onOpenChange).not.toHaveBeenCalled();
    complete();
    await vi.waitFor(() => expect(props.onOpenChange).toHaveBeenCalledWith(false));
  });

  it.each(['marks', 'toc'] as const)('keeps %s open and reports a failed jump', async (kind) => {
    const navigation = vi.fn().mockRejectedValue(new Error('Missing target'));
    const props = kind === 'marks' ? marksProps() : tocProps();
    if (kind === 'marks') {
      props.runtime.goToLocator = navigation;
      renderToStaticMarkup(React.createElement(MarksDrawer, props as ComponentProps<typeof MarksDrawer>));
    } else {
      props.runtime.goToToc = navigation;
      renderToStaticMarkup(React.createElement(TocDrawer, props as ComponentProps<typeof TocDrawer>));
    }
    buttons.get(kind === 'marks' ? 'reader.goToMark' : 'reader.goToToc')!();
    await vi.waitFor(() => expect(showToast).toHaveBeenCalledWith({
      variant: 'danger', label: kind === 'marks' ? 'reader.markNavigationFailed' : 'reader.tocNavigationFailed',
    }));
    expect(props.onOpenChange).not.toHaveBeenCalled();
  });
});
