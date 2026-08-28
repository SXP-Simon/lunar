declare global {
  // Set from a development console before opening a book when the bundle was
  // built without EXPO_PUBLIC_READER_PERF=1.
  var __LUNAR_READER_PERF__: boolean | undefined;
}

const perfConsole = console as Console & {
  timeStamp?: (label?: string) => void;
};

export function isReaderPerformanceEnabled(): boolean {
  return process.env.EXPO_PUBLIC_READER_PERF === '1' || globalThis.__LUNAR_READER_PERF__ === true;
}

export function readerPerformanceMark(name: string, detail?: string): void {
  if (!isReaderPerformanceEnabled()) return;
  const suffix = detail ? ` ${detail}` : '';
  perfConsole.timeStamp?.(`[LunarReader] ${name}${suffix}`);
}

/** Emits navigation and pagination state to the host console when tracing is enabled. */
export function readerDiagnostic(name: string, detail?: string): void {
  if (!isReaderPerformanceEnabled()) return;
  const suffix = detail ? ` ${detail}` : '';
  console.info(`[LunarReader][trace] ${name}${suffix}`);
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
