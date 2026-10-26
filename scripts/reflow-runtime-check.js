(async () => {
  const find=(key,suffix)=>{
    const entry=[...__r.getModules()].find(([,m])=>m.verboseName?.endsWith(suffix));
    return entry?__r(entry[0])[key]:undefined;
  };
  const Runtime=find('LunarReaderRuntime','native-reader-runtime.ts');
  const Backend=find('RitoNativePaginationBackend','rito-native-pagination-backend.ts');
  const read=find('readReaderBook','expo-reader-book-loader.ts');
  const modules=[...__r.getModules()].filter(([,m])=>m.isInitialized).map(([,m])=>m.publicModule.exports);
  const crypto=modules.find(m=>m?.digest&&m.CryptoDigestAlgorithm);
  const settings=modules.find(m=>m?.useApplicationSettingsStore)?.useApplicationSettingsStore;
  if(settings?.getState().resumeReadingOnLaunch!==false)throw Error('Disable startup resume before a fresh-process trial');
  const base=globalThis.__lunarReaderBenchInput;
  if(!base||!Runtime||!Backend||!read||!crypto)throw Error('Runtime or public input unavailable');
  const copy=value=>JSON.parse(JSON.stringify(value,(_k,v)=>typeof v==='bigint'?String(v):v));
  const hash=async bytes=>Array.from(new Uint8Array(await crypto.digest(crypto.CryptoDigestAlgorithm.SHA256,bytes)),v=>v.toString(16).padStart(2,'0')).join('');
  const stats={reads:0,opens:0,reflows:0,disposes:0};
  const backend=new Backend();
  const open=backend.open.bind(backend);backend.open=async value=>{stats.opens++;return open(value);};
  if(backend.reflow){const reflow=backend.reflow.bind(backend);backend.reflow=async value=>{stats.reflows++;return reflow(value);};}
  const runtime=new Runtime(async request=>{stats.reads++;return read(request.fileUri);},backend);
  const resume=runtime.suspendBackgroundPagination();
  const task={startedAtMs:Date.now(),status:'running',supportsReflow:typeof backend.reflow==='function',records:[],stats};
  globalThis.__lunarReflowRuntimeCheck=task;
  const request={...base,bookId:'81bc079841a38e91a02a7776d04786a2fc311cfd300064e9fc533ce7c54cf7b4',
    fileUri:'file:///data/user/0/com.lunarain_079.lunar.dev/files/perf/moby-dick.epub',
    restorePosition:{locator:{manifestHref:'chapter_001.xhtml',chapterProgress:0},progression:0,pageIndex:0,spreadIndex:0,timestamp:Date.now()}};
  const timed=async(name,action)=>{const at=performance.now();const value=await action();task.records.push({name,durationMs:performance.now()-at});return value;};
  let disposal,finishDisposal;
  const observeSession=()=>{
    const session=runtime.publication.session,original=session.dispose;
    disposal=new Promise(resolve=>{finishDisposal=resolve;});
    session.dispose=async function(...args){try{return await original.apply(this,args);}finally{stats.disposes++;finishDisposal();}};
  };
  const close=async()=>{await runtime.close();if(disposal)await Promise.race([disposal,new Promise((_,reject)=>setTimeout(()=>reject(Error('Native disposal did not settle')),10000))]);};
  const capture=async(step,mark)=>{
    const snapshot=runtime.getSnapshot(),pub=runtime.publication,frame=runtime.getCurrentFrame();
    const artifact=pub.session.currentVisibleArtifact;
    if(snapshot.phase!=='ready'||!frame||!artifact)throw Error('No ready frame: '+step);
    const images=[];
    const sources=[...new Set(frame.displayList.resolvedPrimitives.commands.filter(c=>c.kind==='draw-image').map(c=>c.src))];
    for(const source of sources){const bytes=runtime.getCurrentImageBytes(source);if(!bytes?.length)throw Error('Missing image bytes: '+source);images.push({source,bytes:bytes.length,sha256:await hash(bytes)});}
    const geometry=mark?await runtime.resolveExactSourceRange(mark):undefined;
    if(mark&&(geometry.status!=='resolved'||geometry.selectedText!==mark.text||!geometry.rects.length))throw Error('Source highlight lost: '+step+' '+JSON.stringify(geometry));
    const value={step,snapshot:copy(snapshot),sessionId:String(artifact.sessionId),artifactId:String(artifact.artifactId),
      semanticDigest:Array.from(artifact.displayList.semanticDigest,v=>v.toString(16).padStart(2,'0')).join(''),
      text:frame.text,images,geometry:copy(geometry??null),liveArtifacts:pub.session.artifacts.size,stats:{...stats}};
    task.records.push(value);return value;
  };
  try {
    await timed('open',()=>runtime.open(request));observeSession();
    const registry=runtime.fontRegistry,images=runtime.imageCache,session=runtime.publication.session;
    const found=await runtime.search({query:'Ishmael',limit:10});
    const locator=found.results.find(result=>result.locator?.sourceRange)?.locator;
    if(!locator)throw Error('No source-range search result');
    const mark={href:locator.manifestHref,sourceRange:locator.sourceRange,text:'Ishmael'};
    task.initial=await capture('initial',mark);
    task.reflows=[];
    for(const fontSize of [20,22,18]){
      const layout={...base,typography:{...base.typography,fontSize}};
      await timed('reflow-'+fontSize,()=>runtime.updateLayout(layout));
      const frame=await capture('reflow-'+fontSize,mark);
      frame.retainedSession=runtime.publication.session===session;
      frame.retainedFontRegistry=runtime.fontRegistry===registry;
      frame.retainedImageCache=runtime.imageCache===images;
      task.reflows.push(frame);
    }
    task.afterReflows={...stats};
    await runtime.goToToc('cover.xhtml');
    task.coverBefore=await capture('cover-before');
    await timed('cover-reflow',()=>runtime.updateLayout({...base,typography:{...base.typography,fontSize:20}}));
    task.coverAfter=await capture('cover-after');
    if(!task.coverBefore.images.length||!task.coverAfter.images.length)throw Error('Cover checkpoint has no rendered image');
    await close();
    task.fresh=[];
    for(const frame of task.reflows){
      const fontSize=Number(frame.step.slice('reflow-'.length));
      await timed('fresh-'+fontSize,()=>runtime.open({...request,typography:{...base.typography,fontSize},restorePosition:frame.snapshot.position}));observeSession();
      const fresh=await capture('fresh-'+fontSize,mark);
      fresh.sameText=fresh.text===frame.text;fresh.sameSemanticDigest=fresh.semanticDigest===frame.semanticDigest;
      fresh.sameGeometry=JSON.stringify(fresh.geometry)===JSON.stringify(frame.geometry);
      if(!fresh.sameText||!fresh.sameSemanticDigest||!fresh.sameGeometry)throw Error('Reflow differs from a full open: '+fontSize);
      task.fresh.push(fresh);await close();
    }
    await runtime.open({...request,typography:{...base.typography,fontSize:20},restorePosition:task.coverAfter.snapshot.position});observeSession();
    task.coverFresh=await capture('cover-fresh');
    if(task.coverAfter.semanticDigest!==task.coverFresh.semanticDigest||JSON.stringify(task.coverAfter.images)!==JSON.stringify(task.coverFresh.images))throw Error('Cover changed under session reuse');
    await runtime.goToLocator({manifestHref:'chapter_001.xhtml',chapterProgress:1});
    task.boundaryStart=await capture('boundary-start');task.boundaryTurns=[];
    for(const direction of ['next','previous','next','previous']){
      await timed('boundary-'+direction,()=>runtime[direction]());task.boundaryTurns.push(await capture('boundary-'+direction));
    }
    task.status='done';
  } catch(error){task.status='error';task.error=String(error);task.stack=error.stack;throw error;}
  finally {resume();await close();task.closedAtMs=Date.now();}
  return copy(task);
})();
