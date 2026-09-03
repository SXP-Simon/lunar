import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { Button } from 'heroui-native/button';
import { useThemeColor } from 'heroui-native/hooks';
import { StyleSheet, View } from 'react-native';

import { Spacing, useTheme } from '@/hooks/use-theme';

const MAX_ACTIONS_PER_ROW = 5;

export interface FloatingToolbarAction {
  readonly key: string;
  readonly label: string;
  readonly icon: SymbolViewProps['name'];
  readonly isDisabled?: boolean;
  readonly isDestructive?: boolean;
  readonly onPress: () => void;
}

interface FloatingActionToolbarProps {
  readonly accessibilityLabel: string;
  readonly actions: readonly FloatingToolbarAction[];
  readonly bottom: number;
}

export function FloatingActionToolbar({
  accessibilityLabel,
  actions,
  bottom,
}: FloatingActionToolbarProps) {
  const theme = useTheme();
  const [foreground, danger] = useThemeColor(['foreground', 'danger']);
  const rows = chunkActions(actions);

  return (
    <View pointerEvents="box-none" style={[styles.positioner, { bottom }]}>
      <View
        accessibilityLabel={accessibilityLabel}
        accessibilityRole="toolbar"
        style={[
          styles.toolbar,
          {
            backgroundColor: theme.surface,
            borderColor: theme.border,
            shadowColor: theme.text,
          },
        ]}>
        {rows.map((row, rowIndex) => (
          <View key={rowIndex} style={styles.row}>
            {row.map((action) => {
              const color = action.isDestructive ? danger : foreground;
              return (
                <Button
                  key={action.key}
                  accessibilityLabel={action.label}
                  className="h-14 min-w-0 flex-1 rounded-full px-1"
                  isDisabled={action.isDisabled}
                  onPress={action.onPress}
                  size="sm"
                  variant="ghost">
                  <View style={styles.actionContent}>
                    <SymbolView name={action.icon} size={21} tintColor={color} />
                    <Button.Label
                      adjustsFontSizeToFit
                      className="text-[11px] leading-4"
                      minimumFontScale={0.75}
                      numberOfLines={1}
                      style={{ color }}>
                      {action.label}
                    </Button.Label>
                  </View>
                </Button>
              );
            })}
          </View>
        ))}
      </View>
    </View>
  );
}

function chunkActions(
  actions: readonly FloatingToolbarAction[],
): readonly (readonly FloatingToolbarAction[])[] {
  const rows: FloatingToolbarAction[][] = [];
  for (let index = 0; index < actions.length; index += MAX_ACTIONS_PER_ROW) {
    rows.push(actions.slice(index, index + MAX_ACTIONS_PER_ROW));
  }
  return rows;
}

const styles = StyleSheet.create({
  positioner: {
    position: 'absolute',
    left: Spacing.three,
    right: Spacing.three,
    zIndex: 20,
    alignItems: 'center',
  },
  toolbar: {
    width: '100%',
    maxWidth: 440,
    padding: Spacing.one,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 32,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 18,
    elevation: 10,
  },
  row: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionContent: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1,
  },
});
