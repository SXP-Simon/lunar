(async () => {
  if (globalThis.__lunarReaderPerf) throw Error('Reader performance task already exists');
  if (globalThis.__lunarPerf) throw Error('An earlier performance wrapper is active');
  const modules = [...__r.getModules()].filter(([,m]) => m.isInitialized).map(([,m]) => m.publicModule.exports);
  const find = (key,suffix) => {
    const loaded=modules.find(module => typeof module?.[key] === 'function')?.[key];
    if (loaded) return loaded;
    const entry=[...__r.getModules()].find(([,m])=>m.verboseName?.endsWith(suffix));
    return entry ? __r(entry[0])[key] : undefined;
  };
  const layout=globalThis.__lunarReaderBenchInput;
  if (!layout) throw Error('Controlled layout not installed');
  const settings=modules.find(module=>module?.useApplicationSettingsStore)?.useApplicationSettingsStore;
  if (settings?.getState().resumeReadingOnLaunch!==false) throw Error('Automatic reader resume must be disabled');
  const nativeSessionLoaded=modules.some(module=>typeof module?.RitoReaderSession==='function');
  if (nativeSessionLoaded) throw Error('The process has already loaded native reader sessions');
  const Runtime = find('LunarReaderRuntime','native-reader-runtime.ts'), Backend = find('RitoNativePaginationBackend','rito-native-pagination-backend.ts'), read = find('readReaderBook','expo-reader-book-loader.ts');
  if (!Runtime || !Backend || !read) throw Error('Production reader factory exports missing');
  const task = {phase:'running', records:[], results:[], startedAtMs:Date.now(), layout, environment:{nativeSessionLoaded,resumeReadingOnLaunch:false}};
  globalThis.__lunarReaderPerf = task;
  const stringify = value => JSON.stringify(value, (_key,value) => typeof value==='bigint'?String(value):value);
  const copy = value => JSON.parse(stringify(value));
  const hex = bytes => Array.from(bytes,byte=>byte.toString(16).padStart(2,'0')).join('');
  const timed = async (name, action) => {
    const start=performance.now(),startedAtMs=Date.now();
    try { const value=await action();task.records.push({name,startedAtMs,durationMs:performance.now()-start,status:'ok'});return value; }
    catch (error) {task.records.push({name,startedAtMs,durationMs:performance.now()-start,status:'error',error:String(error)});throw error;}
  };
  const backend=new Backend();
  const runtime=new Runtime(request=>timed('book.read',()=>read(request.fileUri)),backend);
  const release=runtime.suspendBackgroundPagination();
  task.runtime=runtime;
  const openOriginal=backend.open.bind(backend);
  backend.open=options=>timed('backend.open',()=>openOriginal(options));
  const pictureOriginal=runtime.preparePicture.bind(runtime);
  runtime.preparePicture=(...args)=>timed('picture.prepare',()=>pictureOriginal(...args));
  const artifact = () => runtime.publication.currentArtifact;
  const details = value => ({id:String(value.artifactId),sessionId:String(value.sessionId),locator:copy(value.locator),
    displaySha256:hex(value.displayList.semanticDigest),texts:value.pages.map(page=>page.text),
    fontSizes:[...new Set(value.displayList.displayList.commands.filter(c=>c.kind==='text').map(c=>c.paint.font.sizePx))]});
  try {
    const request={...layout,bookId:'81bc079841a38e91a02a7776d04786a2fc311cfd300064e9fc533ce7c54cf7b4',
      fileUri:'file:///data/user/0/com.lunarain_079.lunar.dev/files/perf/moby-dick.epub',
      restorePosition:{locator:{manifestHref:'chapter_001.xhtml',spineIdref:'chapter001',chapterProgress:0},progression:0,pageIndex:0,spreadIndex:0,timestamp:Date.now()}};
    await timed('runtime.open',()=>runtime.open(request));
    task.initial={snapshot:copy(runtime.getSnapshot()),artifact:details(artifact())};
    for (const fontSize of [20,22,18]) {
      const pub=runtime.publication,session=pub.session, before=pub.currentArtifact;
      const candidate=await pub.operationQueue.enqueue(async()=> {
        const start=performance.now();
        const value=await session.requestArtifact({...pub.artifactRequest,sessionId:session.sessionId,requestId:session.nextRequestId,
          locator:before.locator,layout:{...pub.artifactRequest.layout,rootFontSize:fontSize}});
        try {return {...details(value),durationMs:performance.now()-start};}
        finally {await session.releaseArtifact(value.artifactId);}
      });
      if (session.currentVisibleArtifact?.artifactId!==before.artifactId) throw Error('The unadopted candidate changed visibility');
      const start=performance.now();
      await timed('runtime.updateLayout',()=>runtime.updateLayout({...layout,typography:{...layout.typography,fontSize}}));
      const fresh=details(artifact());
      task.results.push({fontSize,candidate,fresh,fullRuntimeMs:performance.now()-start,
        samePaint:candidate.displaySha256===fresh.displaySha256,sameText:JSON.stringify(candidate.texts)===JSON.stringify(fresh.texts),
        snapshot:copy(runtime.getSnapshot())});
    }
    task.phase='done';
  } catch(error) {task.phase='error';task.error=String(error);task.stack=error.stack;throw error;}
  finally {release();await runtime.close();task.closedAtMs=Date.now();task.runtime=undefined;}
  return copy(task);
})();
