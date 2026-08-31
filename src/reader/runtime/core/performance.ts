declare global {
  // Set from a development console before opening a book when the bundle was
  // built without EXPO_PUBLIC_READER_PERF=1. Keep both spellings for the
  // console commands used by existing development builds.
  var LUNAR_READER_PERF: boolean | undefined;
  var LUNAR_READER_TRACE: boolean | undefined;
  var LUNAR_READER_TRACE_VERBOSE: boolean | undefined;
  var __LUNAR_READER_PERF__: boolean | undefined;
}

const perfConsole = console as Console & { info?: (...data: unknown[]) => void };

const conciseTraceEvents = new Set([
  'toc.begin',
  'toc.commit',
  'runtime.next',
  'runtime.previous',
  'nav.turn.commit',
  'runtime.show.ready',
  'runtime.bg.pause',
  'bg.commit',
  'bg.drop.stale',
]);

const performanceSummaryEvents = new Set([
  'reader.open',
  'reader.backend.open',
  'reader.bookBytesReady',
  'reader.backend.initialHref',
  'reader.backend.firstArtifact',
  'reader.firstReadySnapshot',
  'reader.background.complete',
]);

export function isReaderPerformanceEnabled(): boolean {
  return process.env.EXPO_PUBLIC_READER_PERF === '1'
    || globalThis.LUNAR_READER_PERF === true
    || globalThis.__LUNAR_READER_PERF__ === true;
}

export function isReaderTraceEnabled(): boolean {
  return process.env.EXPO_PUBLIC_READER_TRACE === '1'
    || globalThis.LUNAR_READER_TRACE === true
    || globalThis.__LUNAR_READER_PERF__ === true;
}

export function isReaderVerboseTraceEnabled(): boolean {
  return globalThis.LUNAR_READER_TRACE_VERBOSE === true;
}

export function readerPerformanceMark(name: string, detail?: string): void {
  if (!isReaderPerformanceEnabled() || !performanceSummaryEvents.has(name)) return;
  const suffix = detail ? ` ${detail}` : '';
  // `console.timeStamp` is implemented by the Android debugger bridge and
  // crashes on some Hermes/Android combinations. Plain console output keeps
  // the trace available without crossing that native path.
  try {
    perfConsole.info?.(`[LunarReader][perf] ${name}${suffix}`);
  } catch {
    // Logging must never affect the reader operation.
  }
}

/** Emits navigation and pagination state to the host console when tracing is enabled. */
export function readerDiagnostic(name: string, detail?: string): void {
  if (!isReaderTraceEnabled() || (!isReaderVerboseTraceEnabled() && !isConciseTraceEvent(name))) return;
  const suffix = detail ? ` ${detail}` : '';
  try {
    perfConsole.info?.(`[LunarReader][trace] ${name}${suffix}`);
  } catch {
    // Logging must never affect the reader operation.
  }
}

export function readerPerformanceStart(name: string): number | undefined {
  if (!isReaderPerformanceEnabled()) return undefined;
  return performance.now();
}

export function readerPerformanceEnd(name: string, startedAt: number | undefined): void {
  if (startedAt === undefined || !isReaderPerformanceEnabled()) return;
  if (!performanceSummaryEvents.has(name)) return;
  const duration = performance.now() - startedAt;
  readerPerformanceMark(name, `durationMs=${duration.toFixed(2)}`);
}

function isConciseTraceEvent(name: string): boolean {
  return conciseTraceEvents.has(name)
    || name.startsWith('turn.')
    || name.endsWith('.error')
    || name.endsWith('.reject')
    || name.endsWith('.miss')
    || name.endsWith('.empty')
    || name.endsWith('.range')
    || name === 'slot.drift';
}
