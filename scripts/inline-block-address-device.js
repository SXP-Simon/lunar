(async () => {
  const runtime = globalThis.__lunarImageAudit?.runtime;
  if (runtime?.publication?.metadata?.title !== 'Lunar Vertical Inline Block Probe') throw Error('Wrong control book');
  await runtime.goToToc('horizontal.xhtml');
  const snapshot = runtime.getSnapshot();
  const frame = runtime.publication.getFrame(snapshot.spreadIndex);
  if (!frame.manifestHref.endsWith('horizontal.xhtml')) throw Error('Wrong chapter');
  const hit = frame.hits.find(entry => entry.text === '盒内文字');
  if (!hit?.textRange) throw Error('Missing text range');
  const rects = await runtime.resolveTextRangeGeometry({ pageIndex:hit.pageIndex, ...hit.textRange });
  return JSON.parse(JSON.stringify({
    request:runtime.request,
    snapshot,
    href:frame.manifestHref,
    hit,
    relatedHits:frame.hits.filter(entry => ['外前','盒内文字','外后','一级','二级','末尾'].includes(entry.text)),
    paint:frame.displayList.resolvedPrimitives.commands.filter(command => command.kind === 'text' && ['外前','盒内文字','外后'].includes(command.text)),
    rects,
  }, (_key,value) => typeof value === 'bigint' ? String(value) : value));
})();
