import { usePathname, useRootNavigationState, useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';

import { useApplicationSettingsStore } from '@/stores';
import { findMostRecentlyReadBookId } from '../services/reading-state-service';

export function useLaunchReadingRestoration(): void {
  const router = useRouter();
  const pathname = usePathname();
  const rootNavigationState = useRootNavigationState();
  const resumeReadingOnLaunch = useApplicationSettingsStore(
    (state) => state.resumeReadingOnLaunch,
  );
  const hasCheckedLaunch = useRef(false);

  useEffect(() => {
    if (!rootNavigationState?.key || hasCheckedLaunch.current) {
      return;
    }

    hasCheckedLaunch.current = true;
    if (!resumeReadingOnLaunch || pathname !== '/') {
      return;
    }

    let isActive = true;
    void findMostRecentlyReadBookId()
      .then((bookId) => {
        if (isActive && bookId) {
          router.push({
            pathname: '/reader/[bookId]',
            params: { bookId },
          });
        }
      })
      .catch(() => undefined);

    return () => {
      isActive = false;
    };
  }, [pathname, resumeReadingOnLaunch, rootNavigationState?.key, router]);
}
