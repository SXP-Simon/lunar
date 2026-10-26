(async () => {
  const p = globalThis.__lunarPerf,
    r = p.runtime;
  if (r?.publication?.metadata.title !== "Moby-Dick")
    throw new Error("wrong book");
  const request = { ...r.request, restorePosition: undefined };
  const managed = request.fileUri,
    original =
      "file:///data/user/0/com.lunarain_079.lunar.dev/files/perf/moby-dick.epub";
  const results = [];
  for (let i = 1; i <= 3; i++) {
    for (const [kind, fileUri] of [
      ["store", managed],
      ["original", original],
    ]) {
      await new Promise((ok) => setTimeout(ok, 1500));
      p.activeRun = "moby-open-" + kind + "-" + i;
      const start = performance.now();
      await r.open({ ...request, fileUri });
      const s = r.getSnapshot(),
        f = r.publication.getFrame(s.spreadIndex),
        slot = r.publication.slots.get(s.spreadIndex),
        a = r.publication.session.artifacts.get(slot.artifactId);
      results.push({
        kind,
        round: i,
        durationMs: performance.now() - start,
        snapshot: s,
        pageTexts: a.pages.map((x) => x.text),
        commands: JSON.stringify(f.displayList.resolvedPrimitives.commands),
      });
      p.activeRun = undefined;
    }
  }
  await r.open(request);
  return results;
})();
