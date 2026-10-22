import type { ComponentType } from 'react';
import type { IconSpec, PluginComponentSlot } from './manifest';

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export interface Disposable {
  dispose(): void;
}

export type PluginSource = 'official' | 'community' | 'development';

export interface PluginIdentity {
  readonly id: string;
  readonly version: string;
  /** Increases every time the host executes the plugin's entry again. */
  readonly generation: number;
  readonly source: PluginSource;
}

export interface HostInfo {
  readonly sdkVersion: string;
  readonly appVersion: string;
  readonly platform: 'android' | 'ios' | 'web';
  readonly locale: string;
  readonly colorScheme: 'light' | 'dark';
  /** Named capability versions; a missing name means the capability is unavailable. */
  readonly capabilities: Readonly<Record<string, number>>;
}

export interface PluginDefinition {
  activate(ctx: PluginContext): void | Promise<void>;
  deactivate?(): void | Promise<void>;
}

export interface PluginContext {
  readonly plugin: PluginIdentity;
  readonly host: HostInfo;
  /** Disposables released together with the plugin's registrations. */
  readonly subscriptions: Disposable[];
  readonly commands: CommandsAPI;
  readonly ui: UIAPI;
  readonly reader: ReaderAPI;
  readonly settings: SettingsAPI;
  readonly storage: StorageAPI;
  readonly network: NetworkAPI;
  readonly services: HostServicesAPI;
  readonly i18n: I18nAPI;
  readonly log: LogAPI;
}

// Commands

export type CommandSource = 'toolbar' | 'panel' | 'selection' | 'route' | 'plugin';

export interface CommandContext {
  readonly source: CommandSource;
  readonly args?: JsonValue;
  readonly signal: AbortSignal;
}

export type CommandHandler = (context: CommandContext) => void | Promise<void>;

export interface CommandsAPI {
  register(id: string, handler: CommandHandler): Disposable;
  execute(id: string, args?: JsonValue): Promise<void>;
}

// Interface

export interface SlotProps {
  readonly slotId: string;
  /** Present for panels: closes the drawer that hosts the component. */
  readonly close?: () => void;
}

export interface RouteProps {
  readonly pageId: string;
  readonly params: Readonly<Record<string, string>>;
}

export interface ConfirmOptions {
  readonly title: string;
  readonly message?: string;
  readonly confirmLabel?: string;
  readonly cancelLabel?: string;
  readonly destructive?: boolean;
}

export type ToastTone = 'default' | 'success' | 'danger';

export interface UIAPI {
  registerSlot(slot: PluginComponentSlot, id: string, component: ComponentType<SlotProps>): Disposable;
  registerRoute(pageId: string, component: ComponentType<RouteProps>): Disposable;
  openPanel(id: string): void;
  closePanel(id?: string): void;
  openRoute(pageId: string, params?: Readonly<Record<string, string>>): void;
  toast(message: string, tone?: ToastTone): void;
  confirm(options: ConfirmOptions): Promise<boolean>;
}

// Reader

export interface BookInfo {
  readonly ref: string;
  readonly title: string;
  readonly author?: string;
  readonly language?: string;
}

export interface ChapterInfo {
  readonly ref: string;
  readonly title?: string;
}

export interface ReaderLocation {
  /** Opaque position reference accepted by `goTo`. */
  readonly locator?: string;
  readonly chapter?: ChapterInfo;
  /** Whole-book progress from 0 to 1. */
  readonly progress: number;
  readonly page?: number;
  readonly totalPages?: number;
}

export type ReaderInteractionMode = 'loading' | 'modal' | 'panel' | 'selecting' | 'turning' | 'idle';

export interface ReaderSessionInfo {
  readonly book: BookInfo;
  readonly phase: 'opening' | 'open';
  readonly location?: ReaderLocation;
  readonly interaction: ReaderInteractionMode;
  readonly hasSelection: boolean;
}

export interface ReaderEvents {
  open: { readonly book: BookInfo };
  ready: { readonly book: BookInfo; readonly location: ReaderLocation };
  locationChange: { readonly book: BookInfo; readonly location: ReaderLocation };
  chapterChange: { readonly book: BookInfo; readonly previous?: ChapterInfo; readonly chapter?: ChapterInfo };
  selectionChange: { readonly book: BookInfo; readonly hasSelection: boolean };
  layoutChange: { readonly book: BookInfo; readonly location: ReaderLocation };
  paginationChange: { readonly book: BookInfo; readonly totalPages?: number; readonly complete: boolean };
  close: { readonly book: BookInfo; readonly location?: ReaderLocation };
}

export type ReaderEventName = keyof ReaderEvents;

export interface TextSegment {
  readonly text: string;
  /** Opaque range reference accepted by decorations. */
  readonly range: string;
  readonly chapterRef?: string;
}

export interface SelectionSnapshot {
  readonly selectionRef: string;
  readonly text: string;
  readonly range?: string;
  readonly chapterRef?: string;
  readonly chapterTitle?: string;
  readonly capturedAt: number;
}

export interface SearchHit {
  /** Surrounding text reported by the engine. */
  readonly context: string;
  readonly locator?: string;
  readonly chapterRef?: string;
}

export interface TocItem {
  readonly title: string;
  readonly chapterRef: string;
  readonly children: readonly TocItem[];
}

export type NavigationTarget =
  { readonly locator: string } | { readonly chapterRef: string } | { readonly progress: number };

export interface SearchOptions {
  readonly limit?: number;
  readonly caseSensitive?: boolean;
  readonly signal?: AbortSignal;
}

export interface ReaderSessionAPI {
  current(): ReaderSessionInfo | undefined;
  subscribe(listener: () => void): Disposable;
  getToc(): Promise<readonly TocItem[]>;
  getVisibleText(): Promise<readonly TextSegment[]>;
  /** Requires the `reader.chapterText` capability. */
  getChapterText(chapterRef?: string): Promise<readonly TextSegment[]>;
  readSelection(selectionRef: string): Promise<SelectionSnapshot>;
  search(query: string, options?: SearchOptions): Promise<readonly SearchHit[]>;
  /** Resolves to `false` when the reader's current interaction does not allow navigation. */
  goTo(target: NavigationTarget): Promise<boolean>;
  next(): Promise<boolean>;
  previous(): Promise<boolean>;
}

export type DecorationStyle = 'background' | 'outline' | 'underline' | 'wavy';
export type DecorationColor = 'yellow' | 'pink' | 'purple' | 'blue' | 'green' | 'accent';

export interface Decoration {
  readonly range: string;
  readonly style: DecorationStyle;
  readonly color: DecorationColor;
}

export interface DecorationLayer extends Disposable {
  set(decorations: readonly Decoration[]): void;
  clear(): void;
}

export interface DecorationsAPI {
  create(layerId: string): DecorationLayer;
}

export interface SelectionMenuItem {
  readonly id: string;
  readonly title: string;
  readonly icon?: IconSpec;
  /** Host items can be hidden or reordered; they cannot be replaced. */
  readonly builtin?: boolean;
  readonly onPress?: (selection: SelectionSnapshot) => void;
}

export interface ToolbarItem {
  readonly id: string;
  readonly title: string;
  readonly icon?: IconSpec;
  readonly pluginId: string;
}

export interface ReaderInterceptors {
  selectionMenu(
    items: readonly SelectionMenuItem[],
    context: { readonly book: BookInfo },
  ): readonly SelectionMenuItem[];
  toolbarItems(items: readonly ToolbarItem[], context: { readonly book: BookInfo }): readonly ToolbarItem[];
}

export interface ReaderAPI {
  on<E extends ReaderEventName>(event: E, listener: (payload: ReaderEvents[E]) => void): Disposable;
  intercept<P extends keyof ReaderInterceptors>(point: P, handler: ReaderInterceptors[P]): Disposable;
  readonly session: ReaderSessionAPI;
  readonly decorations: DecorationsAPI;
}

// Settings and storage

export interface SettingsAPI {
  get<T extends JsonValue = JsonValue>(key: string): T;
  set(key: string, value: JsonValue): Promise<void>;
  onChange(key: string, listener: (value: JsonValue) => void): Disposable;
}

export interface StorageAPI {
  get<T extends JsonValue = JsonValue>(key: string): Promise<T | undefined>;
  set(key: string, value: JsonValue): Promise<void>;
  delete(key: string): Promise<void>;
  keys(prefix?: string): Promise<readonly string[]>;
}

// Network and host services

export interface NetworkRequest {
  readonly url: string;
  readonly method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  readonly headers?: Readonly<Record<string, string>>;
  readonly body?: string;
  readonly timeoutMs?: number;
  readonly signal?: AbortSignal;
}

export interface NetworkResponse {
  readonly status: number;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: string;
  json<T = JsonValue>(): T;
}

export interface NetworkAPI {
  request(request: NetworkRequest): Promise<NetworkResponse>;
}

export interface HostServicesAPI {
  readonly clipboard: { setText(text: string): Promise<void> };
}

export interface I18nAPI {
  readonly locale: string;
  t(key: string, params?: Readonly<Record<string, string | number>>): string;
}

export interface LogAPI {
  info(message: string, ...details: unknown[]): void;
  warn(message: string, ...details: unknown[]): void;
  error(message: string, ...details: unknown[]): void;
}

// Errors

export type PluginErrorCode =
  | 'PERMISSION_DENIED'
  | 'CAPABILITY_UNAVAILABLE'
  | 'INVALID_ARGUMENT'
  | 'INCOMPATIBLE_SDK'
  | 'MODULE_NOT_FOUND'
  | 'NO_ACTIVE_SESSION'
  | 'ANCHOR_UNAVAILABLE'
  | 'GRANT_EXPIRED'
  | 'QUOTA_EXCEEDED'
  | 'NETWORK_DENIED'
  | 'CANCELLED'
  | 'TIMEOUT'
  | 'GENERATION_ENDED'
  | 'INTEGRITY_FAILED';

export interface PluginError extends Error {
  readonly code: PluginErrorCode;
  readonly retryable: boolean;
}

// Theme

export interface Theme {
  readonly colorScheme: 'light' | 'dark';
  readonly colors: {
    readonly foreground: string;
    readonly background: string;
    readonly surface: string;
    readonly surfaceSecondary: string;
    readonly muted: string;
    readonly accent: string;
    readonly border: string;
    readonly danger: string;
    readonly success: string;
  };
  readonly spacing: Readonly<Record<'none' | 'xs' | 'sm' | 'md' | 'lg' | 'xl', number>>;
}

export type Translate = (key: string, params?: Readonly<Record<string, string | number>>) => string;
