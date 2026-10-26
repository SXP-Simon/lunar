(async () => {
  const p = globalThis.__lunarPerf,
    r = p.runtime;
  if (r?.getSnapshot().phase !== "ready") throw Error("Reader is not ready");
  const find = (key) =>
    [...__r.getModules()].find(
      ([, m]) =>
        m.isInitialized && typeof m.publicModule?.exports?.[key] === "function",
    )?.[1].publicModule.exports[key];
  await r.goToToc("chapter_001.xhtml");
  const search = await r.search({ query: "Ishmael", limit: 10 });
  const result = search.results.find((x) => x.locator?.sourceRange);
  if (!result) throw Error("No exact source range");
  const db = await find("getLunarDatabase")();
  const highlights = new (find("SQLiteHighlightRepository"))(db);
  const mark = {
    id: "perf-import-preserved-mark",
    bookId: r.request.bookId,
    href: result.locator.manifestHref,
    sourceRange: result.locator.sourceRange,
    text: "Ishmael",
    createdAt: Date.now(),
    color: "yellow",
    style: "highlight",
  };
  await highlights.save(mark);
  const geometry = await r.resolveExactSourceRange(mark);
  if (
    geometry.status !== "resolved" ||
    geometry.selectedText !== mark.text ||
    !geometry.rects.length
  )
    throw Error("Baseline highlight mismatch");
  await r.next();
  await r.next();
  const snapshot = r.getSnapshot();
  const states = new (find("SQLiteReadingStateRepository"))(db);
  await states.save({
    bookId: r.request.bookId,
    position: snapshot.position,
    totalSpreads: snapshot.totalSpreads,
    typography: r.request.typography,
    theme: r.request.theme,
    updatedAt: Date.now(),
  });
  return {
    highlight: mark,
    geometry,
    readingState: await states.findByBookId(r.request.bookId),
    request: r.request,
  };
})();
