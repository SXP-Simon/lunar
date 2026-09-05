import { useCallback, useEffect, useRef, useState } from 'react';

interface DrawerNavigationOptions {
  readonly isOpen: boolean;
  readonly onOpenChange: (isOpen: boolean) => void;
  readonly onFailure: () => void;
  readonly onNavigated?: () => void;
}

interface PendingNavigation {
  readonly navigate: () => Promise<unknown>;
  phase: 'closing' | 'navigating';
}

export function useDrawerNavigation({
  isOpen, onOpenChange, onFailure, onNavigated,
}: DrawerNavigationOptions) {
  const pending = useRef<PendingNavigation | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  useEffect(() => () => { pending.current = undefined; }, []);

  useEffect(() => {
    // Reopening before the close finishes cancels the queued jump.
    if (isOpen && pending.current?.phase === 'closing') {
      pending.current = undefined;
      setBusy(false);
    }
  }, [isOpen]);

  const isPending = useCallback(() => pending.current !== undefined, []);

  const requestNavigation = useCallback((navigate: () => Promise<unknown>) => {
    if (pending.current) return;
    pending.current = { navigate, phase: 'closing' };
    setBusy(true);
    onOpenChange(false);
  }, [onOpenChange]);

  const onSheetChange = useCallback(async (index: number) => {
    const operation = pending.current;
    // The close request alone does not mean the native animation has finished.
    if (index !== -1 || operation?.phase !== 'closing') return;
    operation.phase = 'navigating';
    try {
      await operation.navigate();
      if (pending.current === operation) onNavigated?.();
    } catch {
      if (pending.current === operation) {
        onOpenChange(true);
        onFailure();
      }
    } finally {
      if (pending.current === operation) {
        pending.current = undefined;
        setBusy(false);
      }
    }
  }, [onFailure, onNavigated, onOpenChange]);

  return { busy, isPending, requestNavigation, onSheetChange };
}
