(async () => {
  const ui=globalThis.__lunarReflowUI;
  if(!ui?.runtime)throw Error('UI reader is not initialized');
  const before=ui.runtime.getSnapshot().revisionId;
  const fontSize=ui.runtime.request.typography.fontSize===24?20:24;
  ui.store.getState().updateTypography({fontSize});
  for(let i=0;;i++){
    const snapshot=ui.runtime.getSnapshot();
    if(snapshot.phase==='ready'&&snapshot.revisionId>before&&ui.runtime.request.typography.fontSize===fontSize)break;
    if(i===200)throw Error('UI layout did not settle: '+snapshot.phase);
    await new Promise(resolve=>setTimeout(resolve,250));
  }
  const captured=await ui.capture('font-'+fontSize);
  if(!captured.sameSession||captured.geometry.status!=='resolved'||captured.geometry.selectedText!=='Ishmael'||!captured.geometry.rects.length)throw Error('UI reflow lost its session or source highlight');
  return captured;
})();
