import { createLayoutConfig, type LayoutConfig } from '@ritojs/core';

import type { ReaderLayoutRequest } from '../contracts';

export function createRitoLayoutConfig(request: ReaderLayoutRequest): LayoutConfig {
  const { typography, viewport } = request;

  return createLayoutConfig({
    width: viewport.width,
    height: viewport.height,
    margin: {
      x: typography.marginHorizontal,
      y: typography.marginVertical,
    },
    spread: typography.spreadMode,
    rootFontSize: typography.fontSize,
    lineHeightOverride: typography.lineHeight,
    lineHeightForce: true,
    fontFamilyOverride: typography.fontFamily,
    fontFamilyForce: Boolean(typography.fontFamily),
  });
}
