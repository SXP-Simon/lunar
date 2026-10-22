import * as React from 'react';
import * as JsxRuntime from 'react/jsx-runtime';
import * as ReactNative from 'react-native';

import { sdkModule } from './sdk-module';
import { uiModule } from './ui-module';

/**
 * Modules a plugin's `require` can resolve. Every entry is a public contract
 * versioned with the SDK; adding one needs the same review as an SDK API.
 */
export function createHostModules(): Readonly<Record<string, unknown>> {
  return Object.freeze({
    react: React,
    'react/jsx-runtime': JsxRuntime,
    'react-native': ReactNative,
    '@lunar/plugin-sdk': sdkModule,
    '@lunar/plugin-sdk/ui': uiModule,
  });
}
