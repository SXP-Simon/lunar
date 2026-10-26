(async()=>{
  const ui=globalThis.__lunarReflowUI,revision=ui.runtime.getSnapshot().revisionId;
  ui.store.getState().updateTypography({fontSize:20});
  for(let i=0;;i++){
    if(ui.runtime.getSnapshot().phase==='ready'&&ui.runtime.getSnapshot().revisionId>revision&&ui.runtime.request.typography.fontSize===20)break;
    if(i===200)throw Error('UI 20px layout did not settle');
    await new Promise(resolve=>setTimeout(resolve,250));
  }
  return ui.capture('pixel-fast-20');
})();
