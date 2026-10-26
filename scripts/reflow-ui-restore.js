(async()=>{
  const ui=globalThis.__lunarReflowUI;
  const before=ui.runtime.getSnapshot().revisionId;
  ui.store.getState().setTypography(ui.previousTypography);
  for(let i=0;;i++){
    if(ui.runtime.getSnapshot().phase==='ready'&&ui.runtime.getSnapshot().revisionId>before&&ui.runtime.request.typography.fontSize===ui.previousTypography.fontSize)break;
    if(i===200)throw Error('Original typography did not settle');
    await new Promise(resolve=>setTimeout(resolve,250));
  }
  const restored=await ui.capture('restored');
  ui.router.replace('/library');
  for(let i=0;;i++){
    if(ui.runtime.getSnapshot().phase==='idle')break;
    if(i===200)throw Error('UI reader did not close');
    await new Promise(resolve=>setTimeout(resolve,250));
  }
  ui.restoreWrapper();
  const result={restored,typography:ui.store.getState().typography,phaseAfterExit:ui.runtime.getSnapshot().phase};
  delete globalThis.__lunarReflowUI;
  delete globalThis.__lunarReflowRuntimeCheck;
  return result;
})();
