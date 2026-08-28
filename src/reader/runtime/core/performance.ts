declare global {
  // Set from a development console before opening a book when the bundle was
  // built without EXPO_PUBLIC_READER_PERF=1. Keep both spellings for the
  // console commands used by existing development builds.
  var LUNAR_READER_PERF: boolean | undefined;
  var LUNAR_READER_TRACE: boolean | undefined;
  var __LUNAR_READER_PERF__: boolean | undefined;
}

const perfConsole = console as Console & { info?: (...data: unknown[]) => void };

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

export function readerPerformanceMark(name: string, detail?: string): void {
  if (!isReaderPerformanceEnabled()) return;
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
  if (!isReaderTraceEnabled()) return;
  const suffix = detail ? ` ${detail}` : '';
  try {
    perfConsole.info?.(`[LunarReader][trace] ${name}${suffix}`);
  } catch {
    // Logging must never affect the reader operation.
  }
}

export function readerPerformanceStart(name: string): number | undefined {
  if (!isReaderPerformanceEnabled()) return undefined;
  const startedAt = performance.now();
  readerPerformanceMark(`${name}.start`);
  return startedAt;
}

export function readerPerformanceEnd(name: string, startedAt: number | undefined): void {
  if (startedAt === undefined || !isReaderPerformanceEnabled()) return;
  const duration = performance.now() - startedAt;
  readerPerformanceMark(`${name}.end`, `durationMs=${duration.toFixed(2)}`);
}
