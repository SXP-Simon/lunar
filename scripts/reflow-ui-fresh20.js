(async()=>{
  const ui=globalThis.__lunarReflowUI;
  const request={...ui.runtime.request,restorePosition:ui.runtime.getSnapshot().position};
  await ui.runtime.open(request);
  const captured=await ui.capture('pixel-fresh-20');
  if(captured.sameSession||captured.geometry.status!=='resolved'||!captured.geometry.rects.length)throw Error('Fresh UI control did not open a new session');
  return captured;
})();
