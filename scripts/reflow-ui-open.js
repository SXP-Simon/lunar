(async () => {
  const find=(key,suffix)=>{const entry=[...__r.getModules()].find(([,m])=>m.verboseName?.endsWith(suffix));return entry?__r(entry[0])[key]:undefined;};
  const Runtime=find('LunarReaderRuntime','native-reader-runtime.ts');
  const modules=[...__r.getModules()].filter(([,m])=>m.isInitialized).map(([,m])=>m.publicModule.exports);
  const store=modules.find(m=>m?.useReaderStore)?.useReaderStore;
  const router=modules.find(m=>m?.router?.push)?.router;
  if(!Runtime||!store||!router)throw Error('UI entry points unavailable');
  const ui={previousTypography:JSON.parse(JSON.stringify(store.getState().typography)),store,router,originalOpen:Runtime.prototype.open};
  globalThis.__lunarReflowUI=ui;
  Runtime.prototype.open=function(...args){ui.runtime=this;return ui.originalOpen.apply(this,args);};
  ui.restoreWrapper=()=>{Runtime.prototype.open=ui.originalOpen;};
  router.push('/reader/81bc079841a38e91a02a7776d04786a2fc311cfd300064e9fc533ce7c54cf7b4');
  for(let i=0;;i++){
    if(ui.runtime?.getSnapshot().phase==='ready')break;
    if(i===200)throw Error('UI reader did not become ready: '+ui.runtime?.getSnapshot().phase);
    await new Promise(resolve=>setTimeout(resolve,250));
  }
  const runtime=ui.runtime;
  await runtime.goToToc('chapter_001.xhtml');
  const results=await runtime.search({query:'Ishmael',limit:10});
  const locator=results.results.find(result=>result.locator?.sourceRange)?.locator;
  if(!locator)throw Error('UI has no source range');
  ui.mark={href:locator.manifestHref,sourceRange:locator.sourceRange,text:'Ishmael'};
  ui.session=runtime.publication.session;
  ui.capture=async(step)=>({step,snapshot:runtime.getSnapshot(),sessionId:String(runtime.publication.session.sessionId),
    sameSession:runtime.publication.session===ui.session,geometry:await runtime.resolveExactSourceRange(ui.mark),
    fontSize:runtime.request.typography.fontSize});
  return {previousTypography:ui.previousTypography,frame:await ui.capture('before')};
})();
