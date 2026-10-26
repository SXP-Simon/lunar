(async () => {
  const modules=[...__r.getModules()].filter(([,m])=>m.isInitialized).map(([,m])=>m.publicModule.exports);
  const find=(key,suffix)=>{
    const entry=[...__r.getModules()].find(([,module])=>module.verboseName?.endsWith(suffix));
    return entry?__r(entry[0])[key]:undefined;
  };
  const Runtime=find('LunarReaderRuntime','native-reader-runtime.ts'), Backend=find('RitoNativePaginationBackend','rito-native-pagination-backend.ts'), read=find('readReaderBook','expo-reader-book-loader.ts');
  const layout=globalThis.__lunarReaderBenchInput;
  if (!layout || !Runtime || !Backend || !read) throw Error('Controlled reader factory unavailable');
  const backend=new Backend();
  const runtime=new Runtime(request=>read(request.fileUri),backend);
  const suspend=runtime.suspendBackgroundPagination();
  let session, originalDispose;
  const result={startedAtMs:Date.now(),events:[]};
  let finish;
  const nativeDisposed=new Promise(resolve=>{finish=resolve;});
  let completed=false;
  try {
    await runtime.open({...layout,bookId:'81bc079841a38e91a02a7776d04786a2fc311cfd300064e9fc533ce7c54cf7b4',
      fileUri:'file:///data/user/0/com.lunarain_079.lunar.dev/files/perf/moby-dick.epub'});
    session=runtime.publication.session;
    originalDispose=session.dispose;
    session.dispose=async function(...args) {
      result.events.push({name:'native.dispose.start',atMs:performance.now()});
      try {const value=await originalDispose.apply(this,args);result.disposeStatus='ok';return value;}
      catch(error){result.disposeStatus='error';result.disposeError=String(error);throw error;}
      finally {completed=true;result.events.push({name:'native.dispose.end',atMs:performance.now()});finish();}
    };
    result.events.push({name:'runtime.close.start',atMs:performance.now()});
    const closing=runtime.close();
    result.tracksPendingClose=typeof backend.pendingClose?.then==='function';
    await closing;
    result.events.push({name:'runtime.close.resolved',atMs:performance.now()});
    result.nativeDisposedWhenCloseResolved=completed;
    result.phaseWhenCloseResolved=runtime.getSnapshot().phase;
    await Promise.race([nativeDisposed,new Promise((_,reject)=>setTimeout(()=>reject(Error('Native disposal did not settle')),10000))]);
    return result;
  } finally {
    suspend();
    await runtime.close();
    if (session && originalDispose) session.dispose=originalDispose;
  }
})();
