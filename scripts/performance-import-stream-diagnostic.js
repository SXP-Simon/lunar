(() => {
  const p = globalThis.__lunarPerf;
  const zip = [...__r.getModules()].find(
    ([, m]) =>
      m.isInitialized && typeof m.publicModule?.exports?.Unzip === "function",
  )[1].publicModule.exports;
  const stats = {
    calls: 0,
    cpuMs: 0,
    maxPushMs: 0,
    inputBytes: 0,
    zeroTimers: 0,
    timerWaitMs: 0,
    maxTimerWaitMs: 0,
  };
  p.streamDiagnostic = stats;
  const push = zip.Unzip.prototype.push;
  let depth = 0;
  zip.Unzip.prototype.push = function (...args) {
    const outer = depth++ === 0,
      start = performance.now();
    try {
      return push.apply(this, args);
    } finally {
      --depth;
      const ms = performance.now() - start;
      if (outer) {
        stats.calls++;
        stats.cpuMs += ms;
        stats.maxPushMs = Math.max(stats.maxPushMs, ms);
        stats.inputBytes += args[0].byteLength;
      }
    }
  };
  const timeout = globalThis.setTimeout;
  globalThis.setTimeout = function (callback, delay, ...args) {
    if (delay !== 0) return timeout(callback, delay, ...args);
    const start = performance.now();
    return timeout(() => {
      const ms = performance.now() - start;
      stats.zeroTimers++;
      stats.timerWaitMs += ms;
      stats.maxTimerWaitMs = Math.max(stats.maxTimerWaitMs, ms);
      callback(...args);
    }, delay);
  };
  p.restores.push(() => {
    zip.Unzip.prototype.push = push;
    globalThis.setTimeout = timeout;
  });
  return { diagnosticInstalled: true };
})();
