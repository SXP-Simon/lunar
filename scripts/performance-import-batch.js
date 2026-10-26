(async () => {
  const p = globalThis.__lunarPerf,
    out = [];
  for (const [file, run] of [
    ["moby-dick.epub", "moby-reimport-2"],
    ["moby-dick.epub", "moby-reimport-3"],
    ["kusamakura-vertical-only.epub", "kusa-fresh-1"],
    ["kusamakura-vertical-only.epub", "kusa-reimport-2"],
    ["kusamakura-vertical-only.epub", "kusa-reimport-3"],
  ]) {
    await new Promise((ok) => setTimeout(ok, 2000));
    out.push(await p.runImport(file, run));
  }
  return out;
})();
