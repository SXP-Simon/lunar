(async () => {
  const r = globalThis.__lunarImageAudit?.runtime;
  if (r?.publication?.metadata?.title !== "\u8349\u6795")
    throw Error("Wrong book");
  const modules = [...__r.getModules()]
    .filter(([, m]) => m.isInitialized)
    .map(([, m]) => m.publicModule.exports);
  const crypto = modules.find(
    (m) => typeof m?.digest === "function" && m.CryptoDigestAlgorithm,
  );
  const hash = async (bytes) =>
    Array.from(
      new Uint8Array(
        await crypto.digest(crypto.CryptoDigestAlgorithm.SHA256, bytes),
      ),
      (x) => x.toString(16).padStart(2, "0"),
    ).join("");
  const href = "xhtml/\u8868\u7d19.xhtml";
  const frames = [];
  const capture = async () => {
    const snapshot = r.getSnapshot(),
      pub = r.publication,
      frame = pub.getFrame(snapshot.spreadIndex),
      slot = pub.slots.get(snapshot.spreadIndex);
    if (snapshot.phase !== "ready" || !frame || !slot)
      throw Error("Frame unavailable");
    const artifact = pub.session.getArtifact(slot.artifactId);
    const images = [];
    for (const source of frame.imageSources) {
      const bytes = r.getCurrentImageBytes(source);
      images.push({
        source,
        bytes: bytes?.byteLength,
        sha256: bytes ? await hash(bytes) : undefined,
      });
    }
    return {
      snapshot,
      href: frame.manifestHref,
      artifactId: String(artifact.artifactId),
      localPageIndexes: artifact.localPageIndexes,
      pages: artifact.pages
        .filter((p) => artifact.localPageIndexes.includes(p.pageIndex))
        .map((p) => ({
          pageIndex: p.pageIndex,
          text: p.text,
          hits: p.hits,
          semantics: p.semantics,
        })),
      ratio: frame.displayList.resolvedPrimitives.ratio,
      commands: frame.displayList.resolvedPrimitives.commands,
      resources: artifact.resources,
      fonts: artifact.fonts,
      images,
    };
  };
  await r.goToToc(href);
  await new Promise((ok) => setTimeout(ok, 500));
  for (let i = 0; i < 32; i++) {
    const frame = await capture();
    frames.push(frame);
    if (!frame.href?.endsWith(href)) break;
    const previous = r.getSnapshot();
    await r.next();
    await new Promise((ok) => setTimeout(ok, 400));
    if (r.getSnapshot().renderId === previous.renderId)
      throw Error("Navigation did not advance");
  }
  const result = {
    request: r.request,
    frames,
    coverEnded: !frames.at(-1).href?.endsWith(href),
  };
  await r.goToToc(href);
  return JSON.parse(
    JSON.stringify(result, (_key, value) =>
      typeof value === "bigint" ? String(value) : value,
    ),
  );
})();
