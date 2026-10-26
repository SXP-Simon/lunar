(async()=>{
  const find=(key,suffix)=>{const entry=[...__r.getModules()].find(([,m])=>m.verboseName?.endsWith(suffix));return entry?__r(entry[0])[key]:undefined;};
  const Runtime=find('LunarReaderRuntime','native-reader-runtime.ts'),Backend=find('RitoNativePaginationBackend','rito-native-pagination-backend.ts'),read=find('readReaderBook','expo-reader-book-loader.ts');
  const layout=globalThis.__lunarReaderBenchInput,backend=new Backend(),runtime=new Runtime(request=>read(request.fileUri),backend);
  const resume=runtime.suspendBackgroundPagination();
  const base={...layout,bookId:'81bc079841a38e91a02a7776d04786a2fc311cfd300064e9fc533ce7c54cf7b4',fileUri:'file:///data/user/0/com.lunarain_079.lunar.dev/files/perf/moby-dick.epub',
    restorePosition:{locator:{manifestHref:'chapter_001.xhtml',chapterProgress:0},progression:0,pageIndex:0,spreadIndex:0,timestamp:Date.now()}};
  let disposed;
  const watch=()=>{const session=runtime.publication.session,original=session.dispose;let finish;disposed=new Promise(resolve=>{finish=resolve;});session.dispose=async function(...args){try{return await original.apply(this,args);}finally{finish();}};};
  const close=async()=>{await runtime.close();if(disposed)await disposed;};
  const result={cases:[]};
  try{
    await runtime.open(base);watch();
    const found=await runtime.search({query:'phantom',limit:20});
    const locator=found.results.find(item=>item.locator?.manifestHref==='chapter_001.xhtml'&&item.locator.sourceRange)?.locator;
    if(!locator)throw Error('No source range');
    const mark={href:locator.manifestHref,sourceRange:locator.sourceRange,text:'phantom'};
    const capture=async()=>{const artifact=runtime.publication.session.currentVisibleArtifact,frame=runtime.getCurrentFrame();return {
      position:runtime.getSnapshot().position,sessionId:String(artifact.sessionId),pageIndices:frame.pageIndices,text:frame.text,
      semanticDigest:Array.from(artifact.displayList.semanticDigest,v=>v.toString(16).padStart(2,'0')).join(''),geometry:await runtime.resolveExactSourceRange(mark)};};
    for(const [name,requested] of [
      ['double',{...layout,typography:{...layout.typography,spreadMode:'double'}}],
      ['viewport',{...layout,viewport:{width:600,height:700,pixelRatio:2}}],
      ['spacing',{...layout,typography:{...layout.typography,lineHeight:2,marginHorizontal:32,marginVertical:40}}],
    ]){
      await runtime.goToLocator(locator);
      const session=runtime.publication.session;
      await runtime.updateLayout(requested);
      const reflowed=await capture();
      if(runtime.publication.session!==session)throw Error('Layout unexpectedly reopened: '+name);
      if(reflowed.geometry.status!=='resolved'||!reflowed.geometry.rects.length)throw Error('Layout lost mark: '+name);
      await close();
      await runtime.open({...base,...requested,restorePosition:reflowed.position});watch();
      const fresh=await capture();
      const matched=reflowed.semanticDigest===fresh.semanticDigest&&reflowed.text===fresh.text&&JSON.stringify(reflowed.geometry)===JSON.stringify(fresh.geometry);
      if(!matched)throw Error('Layout differs from fresh: '+name);
      result.cases.push({name,matched,reflowed,fresh});
      await close();await runtime.open(base);watch();
    }
    result.status='done';
  }finally{resume();await close();}
  return result;
})();
