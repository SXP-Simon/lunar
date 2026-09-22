import {
  Select,
  type SelectItemLabelProps,
  type SelectItemProps as HeroSelectItemProps,
} from 'heroui-native/select';
import { Separator } from 'heroui-native/separator';
import { useCSSVariable } from 'uniwind';

/** Selection context for lists embedded in an existing surface. */
export const SelectRoot = Select;

export type SelectItemProps = Omit<HeroSelectItemProps, 'children' | 'asChild'> & {
  readonly labelProps?: Pick<SelectItemLabelProps, 'style' | 'numberOfLines'>;
  readonly showSeparator?: boolean;
};

export function SelectItem({
  labelProps,
  showSeparator = false,
  ...props
}: SelectItemProps) {
  const activeColor = useCSSVariable('--color-navigation-active') as string;

  return (
    <>
      <Select.Item {...props}>
        {({ isSelected }) => (
          <>
            <Select.ItemLabel
              {...labelProps}
              className={isSelected
                ? 'min-w-0 text-navigation-active'
                : 'min-w-0 text-foreground'}
            />
            <Select.ItemIndicator iconProps={{ color: activeColor }} />
          </>
        )}
      </Select.Item>
      {showSeparator ? <Separator /> : null}
    </>
  );
}

export interface SelectOption<Value extends string = string> {
  readonly value: Value;
  readonly label: string;
}

export interface SelectSheetProps<Value extends string> {
  readonly title: string;
  readonly options: readonly SelectOption<Value>[];
  readonly value: Value;
  readonly isOpen: boolean;
  readonly onValueChange: (value: Value) => void;
  readonly onOpenChange: (isOpen: boolean) => void;
}

/** A short single-choice list presented as a bottom sheet. */
export function SelectSheet<Value extends string>({
  title,
  options,
  value,
  isOpen,
  onValueChange,
  onOpenChange,
}: SelectSheetProps<Value>) {
  return (
    <Select
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      onValueChange={(selected) => {
        const option = options.find((item) => item.value === selected?.value);
        if (option) onValueChange(option.value);
      }}
      presentation="bottom-sheet"
      value={options.find((option) => option.value === value)}>
      <Select.Portal unstable_accessibilityContainerViewIsModal>
        <Select.Overlay />
        <Select.Content
          backgroundClassName="bg-surface"
          contentContainerClassName="px-6 pb-8"
          presentation="bottom-sheet"
          snapPoints={['35%']}>
          <Select.ListLabel className="mb-2 text-xl text-foreground">
            {title}
          </Select.ListLabel>
          {options.map((option, index) => (
            <SelectItem
              key={option.value}
              label={option.label}
              value={option.value}
              showSeparator={index < options.length - 1}
            />
          ))}
        </Select.Content>
      </Select.Portal>
    </Select>
  );
}
