(async () => {
  const p = globalThis.__lunarPerf,
    r = p.runtime;
  if (r.publication?.metadata.title !== "Moby-Dick")
    throw new Error("wrong book");
  const out = [];
  let previousLayout = {
    viewport: r.request.viewport,
    contentInsets: r.request.contentInsets,
    typography: r.request.typography,
    fontFaces: r.request.fontFaces,
    theme: r.request.theme,
    palette: r.request.palette,
  };
  for (const href of [
    "chapter_001.xhtml",
    "chapter_002.xhtml",
    "chapter_003.xhtml",
    "chapter_001.xhtml",
  ]) {
    p.activeRun = "moby-toc-" + href;
    const start = performance.now();
    await r.goToToc(href);
    out.push({
      operation: "toc",
      href,
      durationMs: performance.now() - start,
      snapshot: r.getSnapshot(),
    });
    await new Promise((ok) => setTimeout(ok, 1500));
  }
  await r.next();
  await r.next();
  const before = r.getSnapshot();
  for (const size of [20, 22, 18]) {
    p.activeRun = "moby-reflow-font-" + size;
    const start = performance.now();
    await r.updateLayout({
      ...previousLayout,
      typography: { ...previousLayout.typography, fontSize: size },
    });
    const s = r.getSnapshot(),
      a = r.publication.session.artifacts.get(
        r.publication.slots.get(s.spreadIndex).artifactId,
      );
    out.push({
      operation: "reflow",
      fontSize: size,
      durationMs: performance.now() - start,
      snapshot: s,
      pageTexts: a.pages.map((x) => x.text),
    });
    await new Promise((ok) => setTimeout(ok, 1500));
  }
  p.activeRun = undefined;
  return { beforeReflow: before, operations: out };
})();
