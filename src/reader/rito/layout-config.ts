import {
  createLayoutConfig,
  type DisplayListOptions,
  type LayoutConfig,
} from '@ritojs/core';

import type {
  ReaderLayoutParameters,
  ReaderLayoutRequest,
  ReaderRenderPalette,
} from '../contracts';
import { normalizeReaderTypography } from '../typography';

export function createRitoLayoutConfig(request: ReaderLayoutRequest): LayoutConfig {
  const typography = normalizeReaderTypography(request.typography);
  const { viewport } = request;

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

export function createRitoDisplayListOptions(
  request: ReaderLayoutRequest,
): DisplayListOptions {
  const palette = getReaderRenderPalette(request.theme);
  return {
    backgroundColor: palette.backgroundColor,
    foregroundColor: palette.foregroundColor,
    spreadBodyBg: palette.spreadBodyBackgroundColor,
  };
}

export function toReaderLayoutParameters(
  config: LayoutConfig,
  request: ReaderLayoutRequest,
): ReaderLayoutParameters {
  return {
    viewportWidth: config.viewportWidth,
    viewportHeight: config.viewportHeight,
    pageWidth: config.pageWidth,
    pageHeight: config.pageHeight,
    pixelRatio: request.viewport.pixelRatio,
    marginTop: config.marginTop,
    marginRight: config.marginRight,
    marginBottom: config.marginBottom,
    marginLeft: config.marginLeft,
    spreadMode: config.spreadMode,
    spreadGap: config.spreadGap,
    rootFontSize: config.rootFontSize,
    lineHeight: config.lineHeightOverride,
    fontFamily: config.fontFamilyOverride,
    palette: getReaderRenderPalette(request.theme),
  };
}

function getReaderRenderPalette(theme: ReaderLayoutRequest['theme']): ReaderRenderPalette {
  switch (theme) {
    case 'dark':
      return {
        backgroundColor: '#151515',
        foregroundColor: '#E8E6E1',
        spreadBodyBackgroundColor: '#151515',
      };
    case 'paper':
      return {
        backgroundColor: '#F1E7D0',
        foregroundColor: '#342D24',
        spreadBodyBackgroundColor: '#E8D9BA',
      };
    case 'light':
      return {
        backgroundColor: '#FAF9F6',
        foregroundColor: '#20201E',
        spreadBodyBackgroundColor: '#F0EFEB',
      };
  }
}
