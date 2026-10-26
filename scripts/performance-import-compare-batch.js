(async () => {
  const results = [];
  for (const [file, prefix] of [
    ["moby-dick.epub", "moby"],
    ["kusamakura-vertical-only.epub", "kusa"],
  ])
    for (let i = 1; i <= 3; i++) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      results.push(
        await globalThis.__lunarPerf.runImport(file, prefix + "-" + i),
      );
    }
  return {
    results,
    records: globalThis.__lunarPerf.records,
    environment: globalThis.__lunarPerf.environment,
  };
})();
