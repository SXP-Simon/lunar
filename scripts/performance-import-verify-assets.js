(async () => {
  const modules = [...__r.getModules()]
    .filter(([, m]) => m.isInitialized)
    .map(([, m]) => m.publicModule.exports);
  const find = (key) =>
    modules.find((m) => typeof m?.[key] === "function")[key];
  const fs = modules.find(
    (m) =>
      typeof m?.File === "function" &&
      typeof m.Directory === "function" &&
      m.Paths,
  );
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
  const db = await find("getLunarDatabase")();
  const books = new (find("SQLiteBookRepository"))(db),
    assets = new (find("SQLiteBookAssetRepository"))(db);
  const result = [];
  for (const bookId of [
    "81bc079841a38e91a02a7776d04786a2fc311cfd300064e9fc533ce7c54cf7b4",
    "5eee439293bd53cb2c284a9b988e8e15013aa433a415d10427fbf7bd1bc62a0d",
  ]) {
    const book = await books.findById(bookId),
      source = new Uint8Array(await new fs.File(book.fileUri).arrayBuffer());
    const entries = [];
    for (const asset of await assets.listByBookId(bookId)) {
      const bytes = new Uint8Array(await new fs.File(asset.uri).arrayBuffer());
      const actualSha256 = await hash(bytes);
      if (actualSha256 !== asset.sha256 || bytes.byteLength !== asset.byteSize)
        throw Error("Asset index mismatch: " + asset.path);
      entries.push({
        path: asset.path,
        byteSize: bytes.byteLength,
        sha256: actualSha256,
      });
    }
    const cover = new Uint8Array(
      await new fs.File(book.coverUri).arrayBuffer(),
    );
    const managedSha256 = await hash(source);
    if (managedSha256 !== bookId)
      throw Error("Managed archive differs from source snapshot");
    result.push({
      bookId,
      managedSha256,
      managedBytes: source.byteLength,
      assets: entries,
      coverSha256: await hash(cover),
    });
  }
  return result;
})();
