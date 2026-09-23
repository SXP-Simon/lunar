import { Image } from 'expo-image';
import { CloseButton } from 'heroui-native/close-button';
import { useMemo } from 'react';
import { Modal, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { withUniwind } from 'uniwind';

const StyledImage = withUniwind(Image);
const MaximumScale = 5;
const DoubleTapScale = 2.5;

export interface ImageViewerProps {
  readonly uri?: string;
  readonly description: string;
  readonly closeLabel: string;
  readonly onClose: () => void;
  readonly onError: () => void;
}

export function ImageViewer({ uri, description, closeLabel, onClose, onError }: ImageViewerProps) {
  const insets = useSafeAreaInsets();
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const width = useSharedValue(0);
  const height = useSharedValue(0);

  const gesture = useMemo(() => {
    const pinch = Gesture.Pinch()
      .onStart(() => { savedScale.value = scale.value; })
      .onUpdate((event) => {
        scale.value = Math.min(MaximumScale, Math.max(1, savedScale.value * event.scale));
      })
      .onEnd(() => {
        const maxX = width.value * (scale.value - 1) / 2;
        const maxY = height.value * (scale.value - 1) / 2;
        translateX.value = withTiming(Math.max(-maxX, Math.min(maxX, translateX.value)));
        translateY.value = withTiming(Math.max(-maxY, Math.min(maxY, translateY.value)));
      });
    const pan = Gesture.Pan()
      .minDistance(4)
      .onChange((event) => {
        if (scale.value <= 1) return;
        const maxX = width.value * (scale.value - 1) / 2;
        const maxY = height.value * (scale.value - 1) / 2;
        translateX.value = Math.max(-maxX, Math.min(maxX, translateX.value + event.changeX));
        translateY.value = Math.max(-maxY, Math.min(maxY, translateY.value + event.changeY));
      });
    const doubleTap = Gesture.Tap().numberOfTaps(2).onEnd((_, success) => {
      if (!success) return;
      if (scale.value > 1) {
        scale.value = withTiming(1);
        translateX.value = withTiming(0);
        translateY.value = withTiming(0);
      } else {
        scale.value = withTiming(DoubleTapScale);
      }
    });
    return Gesture.Simultaneous(pinch, pan, doubleTap);
  }, [height, savedScale, scale, translateX, translateY, width]);

  const imageStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  const close = () => {
    scale.value = 1;
    savedScale.value = 1;
    translateX.value = 0;
    translateY.value = 0;
    onClose();
  };

  return (
    <Modal visible={Boolean(uri)} animationType="fade" onRequestClose={close}>
      <View
        className="flex-1 bg-black"
        onLayout={(event) => {
          width.value = event.nativeEvent.layout.width;
          height.value = event.nativeEvent.layout.height;
        }}>
        <GestureDetector gesture={gesture}>
          <Animated.View collapsable={false} className="absolute inset-0 items-center justify-center" style={imageStyle}>
            {uri && (
              <StyledImage
                source={{ uri }}
                className="h-full w-full"
                contentFit="contain"
                accessible
                accessibilityLabel={description}
                onError={onError}
              />
            )}
          </Animated.View>
        </GestureDetector>
        <View
          pointerEvents="box-none"
          className="absolute top-0 right-0 left-0 items-end px-4"
          style={{ paddingTop: insets.top + 12 }}>
          <CloseButton accessibilityLabel={closeLabel} onPress={close} />
        </View>
      </View>
    </Modal>
  );
}
