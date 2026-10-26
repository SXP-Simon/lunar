(async () => {
  if (globalThis.__lunarImageAudit)
    throw Error("Image audit already installed");
  const modules = [...__r.getModules()]
    .filter(([, m]) => m.isInitialized)
    .map(([, m]) => m.publicModule.exports);
  const Runtime = modules.find(
    (m) => typeof m?.LunarReaderRuntime === "function",
  ).LunarReaderRuntime;
  const router = modules.find((m) => m?.router?.replace).router;
  const original = Runtime.prototype.open;
  const audit = { runtime: undefined, originalOpen: original, restored: false };
  globalThis.__lunarImageAudit = audit;
  Runtime.prototype.open = function (...args) {
    audit.runtime = this;
    return original.apply(this, args);
  };
  router.replace("/library");
  await new Promise((ok) => setTimeout(ok, 500));
  router.push({
    pathname: "/reader/[bookId]",
    params: {
      bookId:
        "5eee439293bd53cb2c284a9b988e8e15013aa433a415d10427fbf7bd1bc62a0d",
    },
  });
  for (let i = 0; i < 150; i++) {
    const r = audit.runtime,
      s = r?.getSnapshot();
    if (s?.phase === "error") throw Error(s.errorMessage);
    if (
      s?.phase === "ready" &&
      r.publication?.metadata?.title === "\u8349\u6795"
    ) {
      Runtime.prototype.open = original;
      audit.restored = true;
      return {
        snapshot: s,
        metadata: r.publication.metadata,
        request: r.request,
      };
    }
    await new Promise((ok) => setTimeout(ok, 100));
  }
  throw Error("Reader did not become ready");
})();
