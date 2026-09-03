import { Button } from 'heroui-native/button';
import { Dialog } from 'heroui-native/dialog';
import { type ReactNode } from 'react';
import { View } from 'react-native';

export interface ConfirmModalProps {
  readonly isOpen: boolean;
  readonly title: string;
  readonly description?: ReactNode;
  readonly confirmLabel: string;
  readonly confirmingLabel?: string;
  readonly cancelLabel?: string;
  readonly isConfirming?: boolean;
  readonly isDestructive?: boolean;
  readonly onConfirm: () => void;
  readonly onOpenChange: (isOpen: boolean) => void;
}

export function ConfirmModal({
  isOpen,
  title,
  description,
  confirmLabel,
  confirmingLabel,
  cancelLabel = '取消',
  isConfirming = false,
  isDestructive = false,
  onConfirm,
  onOpenChange,
}: ConfirmModalProps) {
  const handleOpenChange = (nextIsOpen: boolean) => {
    if (!isConfirming) {
      onOpenChange(nextIsOpen);
    }
  };

  return (
    <Dialog isOpen={isOpen} onOpenChange={handleOpenChange}>
      <Dialog.Portal unstable_accessibilityContainerViewIsModal>
        <Dialog.Overlay />
        <Dialog.Content className="mx-5 max-w-md gap-4 rounded-2xl p-5">
          <Dialog.Title>{title}</Dialog.Title>
          {description && <Dialog.Description>{description}</Dialog.Description>}
          <View className="flex-row gap-3">
            <Button
              className="flex-1"
              isDisabled={isConfirming}
              onPress={() => onOpenChange(false)}
              variant="tertiary">
              {cancelLabel}
            </Button>
            <Button
              className="flex-1"
              isDisabled={isConfirming}
              onPress={onConfirm}
              variant={isDestructive ? 'danger' : 'primary'}>
              {isConfirming ? (confirmingLabel ?? confirmLabel) : confirmLabel}
            </Button>
          </View>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog>
  );
}
