import { describe, expect, it, vi } from 'vitest';

import { computeReaderSelectionControlsLayout } from '../../src/features/reader/components/reader-selection-controls';

// Layout calculations use plain rectangles; native components are not rendered.
vi.mock('react-native', () => ({ View: 'View' }));
vi.mock('react-native-gesture-handler', () => ({ Gesture: {}, GestureDetector: 'GestureDetector' }));
vi.mock('expo-symbols', () => ({ SymbolView: 'SymbolView' }));
vi.mock('heroui-native/button', () => ({ Button: 'Button' }));
vi.mock('heroui-native/hooks', () => ({ useThemeColor: vi.fn() }));
vi.mock('uniwind', () => ({ useCSSVariable: vi.fn() }));

const insets = { top: 40, right: 0, bottom: 24, left: 0 };

describe('reader selection controls layout', () => {
  it('places the toolbar above a selection with enough space', () => {
    const layout = computeReaderSelectionControlsLayout(
      [{ x: 100, y: 300, width: 120, height: 24 }],
      390,
      844,
      insets,
    );
    expect(layout?.toolbar).toEqual({ left: 34, top: 180 });
    expect(layout?.startHandle).toEqual({ x: 100, y: 324 });
    expect(layout?.endHandle).toEqual({ x: 220, y: 324 });
  });

  it('places the toolbar below a selection near the top edge', () => {
    const layout = computeReaderSelectionControlsLayout(
      [{ x: 8, y: 54, width: 50, height: 24 }],
      320,
      640,
      insets,
    );
    expect(layout?.toolbar).toEqual({ left: 12, top: 90 });
  });

  it('keeps the toolbar inside horizontal viewport padding', () => {
    const layout = computeReaderSelectionControlsLayout(
      [{ x: 300, y: 300, width: 18, height: 20 }],
      320,
      640,
      insets,
    );
    expect(layout?.toolbar.left).toBe(56);
  });
});
