(async () => {
  const r = globalThis.__lunarImageAudit?.runtime;
  if (r?.publication?.metadata?.title !== "Lunar Vertical Inline Block Probe")
    throw Error("Wrong book");
  const results = [];
  for (const href of ["horizontal.xhtml", "vertical.xhtml", "prefixed.xhtml"]) {
    await r.goToToc(href);
    await new Promise((ok) => setTimeout(ok, 300));
    const frames = [];
    for (let i = 0; i < 12; i++) {
      const s = r.getSnapshot(),
        pub = r.publication,
        f = pub.getFrame(s.spreadIndex),
        a = pub.session.getArtifact(pub.slots.get(s.spreadIndex).artifactId);
      if (!f.manifestHref.endsWith(href)) break;
      frames.push({
        position: s.position,
        href: f.manifestHref,
        pageText: f.text,
        commands: f.displayList.resolvedPrimitives.commands,
        hits: f.hits,
        semantics: f.semantics,
        resources: a.resources,
        ratio: f.displayList.resolvedPrimitives.ratio,
      });
      await r.next();
      await new Promise((ok) => setTimeout(ok, 150));
      if (r.getSnapshot().renderId === s.renderId) break;
    }
    results.push({ href, frames });
  }
  await r.goToToc("vertical.xhtml");
  return JSON.parse(
    JSON.stringify({ request: r.request, results }, (_k, v) =>
      typeof v === "bigint" ? String(v) : v,
    ),
  );
})();
