(async () => {
  const r = globalThis.__lunarPerf.runtime;
  if (r?.getSnapshot().phase !== "ready") throw Error("Reader not ready");
  const modules = [...__r.getModules()]
    .filter(([, m]) => m.isInitialized)
    .map(([, m]) => m.publicModule.exports);
  const find = (key) =>
    modules.find((m) => typeof m?.[key] === "function")[key];
  const crypto = modules.find(
    (m) => typeof m?.digest === "function" && m.CryptoDigestAlgorithm,
  );
  const zip = modules.find((m) => typeof m?.strToU8 === "function");
  const hash = async (bytes) =>
    Array.from(
      new Uint8Array(
        await crypto.digest(crypto.CryptoDigestAlgorithm.SHA256, bytes),
      ),
      (x) => x.toString(16).padStart(2, "0"),
    ).join("");
  const stringify = (value) =>
    JSON.stringify(value, (_key, v) => (typeof v === "bigint" ? String(v) : v));
  const base = { ...r.request },
    checkpoint = r.getSnapshot().position;
  const layout = {
    viewport: base.viewport,
    contentInsets: base.contentInsets,
    typography: base.typography,
    fontFaces: base.fontFaces,
    theme: base.theme,
    palette: base.palette,
  };
  const moby = base.bookId.startsWith("81bc0798");
  const expected = moby
    ? "81bc079841a38e91a02a7776d04786a2fc311cfd300064e9fc533ce7c54cf7b4"
    : "5eee439293bd53cb2c284a9b988e8e15013aa433a415d10427fbf7bd1bc62a0d";
  if (base.bookId !== expected) throw Error("Non-public book rejected");
  const backup =
    "file:///data/user/0/com.lunarain_079.lunar.dev/files/perf/baseline-" +
    (moby ? "moby" : "kusa") +
    "-store.epub";
  const hrefs = moby
    ? [
        "cover.xhtml",
        "titlepage.xhtml",
        "chapter_001.xhtml",
        "chapter_002.xhtml",
        "chapter_003.xhtml",
      ]
    : ["xhtml/\u8868\u7d19.xhtml", "xhtml/\u4e00.xhtml", "xhtml/\u4e8c.xhtml"];
  const db = await find("getLunarDatabase")();
  const mark = moby
    ? (
        await new (find("SQLiteHighlightRepository"))(db).listByBookId(
          base.bookId,
        )
      ).find((x) => x.id === "perf-import-preserved-mark")
    : undefined;
  const capture = async (step) => {
    const s = r.getSnapshot(),
      pub = r.publication,
      frame = pub.getFrame(s.spreadIndex),
      slot = pub.slots.get(s.spreadIndex),
      artifact = pub.session.artifacts.get(slot.artifactId);
    if (s.phase !== "ready" || !frame) throw Error("Frame not ready");
    const commands = frame.displayList.resolvedPrimitives.commands;
    const images = [];
    for (const source of [
      ...new Set(
        commands.filter((x) => x.kind === "draw-image").map((x) => x.src),
      ),
    ]) {
      const bytes = r.getCurrentImageBytes(source);
      if (!bytes?.byteLength)
        throw Error("Rendered image bytes missing: " + source);
      images.push({
        source,
        bytes: bytes.byteLength,
        sha256: await hash(bytes),
      });
    }
    return {
      step,
      position: s.position,
      pageTexts: artifact.pages
        .filter((x) => artifact.localPageIndexes.includes(x.pageIndex))
        .map((x) => x.text),
      commandsSha256: await hash(zip.strToU8(stringify(commands))),
      commandCount: commands.length,
      images,
      fonts: artifact.fonts.map((f) => ({ href: f.href, family: f.family })),
    };
  };
  const results = [];
  for (const [kind, fileUri] of [
    ["store", backup],
    ["compressed", base.fileUri],
  ]) {
    const frames = [];
    await r.open({ ...base, fileUri, restorePosition: checkpoint });
    frames.push(await capture("restored"));
    let originalGeometry, reflowedGeometry;
    for (const href of hrefs) {
      await r.goToToc(href);
      frames.push(await capture(href));
      if (mark && href === "chapter_001.xhtml") {
        originalGeometry = await r.resolveExactSourceRange(mark);
        await r.updateLayout({
          ...layout,
          typography: { ...base.typography, fontSize: 20 },
        });
        reflowedGeometry = await r.resolveExactSourceRange(mark);
        frames.push(await capture("reflow-20"));
        for (const geometry of [originalGeometry, reflowedGeometry])
          if (
            geometry.status !== "resolved" ||
            geometry.selectedText !== mark.text ||
            !geometry.rects.length
          )
            throw Error("Highlight lost after archive migration/reflow");
        await r.updateLayout(layout);
      }
    }
    await r.open({ ...base, fileUri, restorePosition: checkpoint });
    frames.push(await capture("reopened"));
    results.push({ kind, frames, originalGeometry, reflowedGeometry });
  }
  if (
    stringify(results[0].frames.map(({ position, ...f }) => f)) !==
    stringify(results[1].frames.map(({ position, ...f }) => f))
  )
    throw Error("Container format changed frame content");
  if (
    stringify(results[0].originalGeometry) !==
      stringify(results[1].originalGeometry) ||
    stringify(results[0].reflowedGeometry) !==
      stringify(results[1].reflowedGeometry)
  )
    throw Error("Container format changed highlight geometry");
  return { bookId: base.bookId, checkpoint, results, matched: true };
})();
