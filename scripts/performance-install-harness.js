(() => {
  if (globalThis.__lunarPerf)
    throw new Error("Performance harness already installed");
  const modules = [...globalThis.__r.getModules()]
    .filter(([, m]) => m.isInitialized)
    .map(([id, m]) => ({ id, exports: m.publicModule?.exports }));
  const find = (key) =>
    modules.find((m) => m.exports && typeof m.exports[key] === "function")
      ?.exports;
  const perf = {
    records: [],
    restores: [],
    runtime: undefined,
    activeRun: undefined,
    books: [],
  };
  globalThis.__lunarPerf = perf;
  const record = (name, start, detail = {}) =>
    perf.records.push({
      name,
      durationMs: performance.now() - start,
      atMs: Date.now(),
      run: perf.activeRun,
      ...detail,
    });
  function wrap(object, key, name, detail = () => ({})) {
    const original = object[key];
    object[key] = function (...args) {
      const start = performance.now();
      let info = detail(args);
      let result;
      try {
        result = original.apply(this, args);
      } catch (e) {
        record(name, start, { ...info, status: "error" });
        throw e;
      }
      if (result && typeof result.then === "function")
        return result.then(
          (v) => {
            record(name, start, { ...info, status: "ok" });
            return v;
          },
          (e) => {
            record(name, start, { ...info, status: "error" });
            throw e;
          },
        );
      record(name, start, { ...info, status: "ok" });
      return result;
    };
    perf.restores.push(() => {
      object[key] = original;
    });
  }
  const Files = find("ExpoBookFileService").ExpoBookFileService,
    Import = find("BookImportService").BookImportService,
    Runtime = find("LunarReaderRuntime").LunarReaderRuntime;
  for (const key of ["importEpub", "readBook", "saveCover"])
    wrap(Files.prototype, key, "files." + key);
  const originalImport = Import.prototype.import;
  Import.prototype.import = async function (...args) {
    const originalInspect = this.inspectEpub;
    this.inspectEpub = (...input) => {
      const start = performance.now();
      try {
        return originalInspect(...input);
      } finally {
        record("metadata.inspect", start, { inputBytes: input[0]?.byteLength });
      }
    };
    try {
      return await originalImport.apply(this, args);
    } finally {
      this.inspectEpub = originalInspect;
    }
  };
  perf.restores.push(() => {
    Import.prototype.import = originalImport;
  });
  const zip = modules.find(
    (m) =>
      m.exports &&
      typeof m.exports.unzipSync === "function" &&
      typeof m.exports.zipSync === "function",
  ).exports;
  for (const key of ["unzipSync", "zipSync"])
    wrap(zip, key, "zip." + key, (args) => ({
      inputBytes: args[0]?.byteLength,
    }));
  const assets = find("SQLiteBookAssetRepository");
  if (assets)
    wrap(
      assets.SQLiteBookAssetRepository.prototype,
      "saveMany",
      "assets.saveMany",
      (args) => ({ entries: args[1]?.length }),
    );
  const originalOpen = Runtime.prototype.open;
  Runtime.prototype.open = function (...args) {
    perf.runtime = this;
    return originalOpen.apply(this, args);
  };
  perf.restores.push(() => {
    Runtime.prototype.open = originalOpen;
  });
  for (const key of ["open", "next", "previous", "goToToc", "updateLayout"])
    wrap(Runtime.prototype, key, "runtime." + key);
  const library = find("importEpubFile");
  perf.runImport = async function (name, run) {
    if (!["moby-dick.epub", "kusamakura-vertical-only.epub"].includes(name))
      throw new Error("Non-public file rejected");
    perf.activeRun = run;
    const start = performance.now(),
      startedAtMs = Date.now();
    const progress = [];
    const book = await library.importEpubFile(
      {
        uri:
          "file:///data/user/0/com.lunarain_079.lunar.dev/files/perf/" + name,
        fileName: name,
      },
      (value) => {
        progress.push({ value, elapsedMs: performance.now() - start });
      },
    );
    record("import.total", start, {
      startedAtMs,
      fileName: name,
      bookId: book.id,
      sourceBytes: book.fileSize,
      progress,
    });
    perf.books.push({
      id: book.id,
      title: book.title,
      fileName: book.fileName,
    });
    perf.activeRun = undefined;
    return {
      bookId: book.id,
      title: book.title,
      elapsedMs: performance.now() - start,
    };
  };
  perf.finish = () => {
    for (const restore of perf.restores.reverse()) restore();
    return { records: perf.records, books: perf.books };
  };
  return {
    installed: true,
    guestNowMs: Date.now(),
    moduleIds: modules
      .filter(
        (m) =>
          m.exports &&
          [
            "BookImportService",
            "ExpoBookFileService",
            "SQLiteBookAssetRepository",
            "LunarReaderRuntime",
          ].some((k) => m.exports[k]),
      )
      .map((m) => ({
        id: m.id,
        keys: Object.keys(m.exports).filter((k) =>
          [
            "BookImportService",
            "ExpoBookFileService",
            "SQLiteBookAssetRepository",
            "LunarReaderRuntime",
          ].includes(k),
        ),
      })),
  };
})();
