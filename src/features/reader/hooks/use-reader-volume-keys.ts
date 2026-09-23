import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';

import { subscribeToReaderVolumeKeys } from '../infrastructure/reader-volume-keys';

export function useReaderVolumeKeys(
  enabled: boolean,
  onPress: (direction: 'next' | 'previous') => void,
): void {
  useFocusEffect(useCallback(() => {
    if (!enabled) return;
    return subscribeToReaderVolumeKeys(onPress);
  }, [enabled, onPress]));
}
