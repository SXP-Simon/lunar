(async()=>{
  const find=(key,suffix)=>{const entry=[...__r.getModules()].find(([,m])=>m.verboseName?.endsWith(suffix));return entry?__r(entry[0])[key]:undefined;};
  const Runtime=find('LunarReaderRuntime','native-reader-runtime.ts'),Backend=find('RitoNativePaginationBackend','rito-native-pagination-backend.ts'),read=find('readReaderBook','expo-reader-book-loader.ts');
  const layout=globalThis.__lunarReaderBenchInput;
  const stats={readMs:0,backendMs:0,pictureMs:0};
  const timed=async(key,action)=>{const at=performance.now();const value=await action();stats[key]+=performance.now()-at;return value;};
  const backend=new Backend(),open=backend.open.bind(backend);backend.open=value=>timed('backendMs',()=>open(value));
  const runtime=new Runtime(request=>timed('readMs',()=>read(request.fileUri)),backend);
  const picture=runtime.preparePicture.bind(runtime);runtime.preparePicture=(...args)=>timed('pictureMs',()=>picture(...args));
  const resume=runtime.suspendBackgroundPagination();
  const result={status:'running',supportsReflow:typeof backend.reflow==='function',stats};
  let disposed;
  try{
    const at=performance.now();
    await runtime.open({...layout,bookId:'81bc079841a38e91a02a7776d04786a2fc311cfd300064e9fc533ce7c54cf7b4',
      fileUri:'file:///data/user/0/com.lunarain_079.lunar.dev/files/perf/moby-dick.epub',
      restorePosition:{locator:{manifestHref:'chapter_001.xhtml',chapterProgress:0},progression:0,pageIndex:0,spreadIndex:0,timestamp:Date.now()}});
    stats.totalMs=performance.now()-at;
    stats.otherMs=stats.totalMs-stats.readMs-stats.backendMs-stats.pictureMs;
    const artifact=runtime.publication.session.currentVisibleArtifact;
    result.semanticDigest=Array.from(artifact.displayList.semanticDigest,v=>v.toString(16).padStart(2,'0')).join('');
    result.phase=runtime.getSnapshot().phase;
    const session=runtime.publication.session,dispose=session.dispose;
    let finish;disposed=new Promise(resolve=>{finish=resolve;});
    session.dispose=async function(...args){try{return await dispose.apply(this,args);}finally{finish();}};
    result.status='done';
  } finally {
    resume();await runtime.close();
    if(disposed)await Promise.race([disposed,new Promise((_,reject)=>setTimeout(()=>reject(Error('Disposal timeout')),10000))]);
  }
  return result;
})();
