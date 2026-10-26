(async()=>{
  const ui=globalThis.__lunarReflowUI;
  await ui.runtime.goToLocator({manifestHref:ui.mark.href,sourcePoint:ui.mark.sourceRange.start});
  const frame=await ui.capture('before-at-mark');
  if(frame.geometry.status!=='resolved'||!frame.geometry.rects.length)throw Error('The mark is not visible');
  return frame;
})();
