(async()=>{
  const find=(key,suffix)=>{const entry=[...__r.getModules()].find(([,m])=>m.verboseName?.endsWith(suffix));return entry?__r(entry[0])[key]:undefined;};
  const Runtime=find('LunarReaderRuntime','native-reader-runtime.ts'),Backend=find('RitoNativePaginationBackend','rito-native-pagination-backend.ts'),read=find('readReaderBook','expo-reader-book-loader.ts');
  const layout=globalThis.__lunarReaderBenchInput,backend=new Backend();
  const runtime=new Runtime(request=>read(request.fileUri),backend),resume=runtime.suspendBackgroundPagination();
  const base={...layout,bookId:'81bc079841a38e91a02a7776d04786a2fc311cfd300064e9fc533ce7c54cf7b4',fileUri:'file:///data/user/0/com.lunarain_079.lunar.dev/files/perf/moby-dick.epub',
    restorePosition:{locator:{manifestHref:'chapter_001.xhtml',chapterProgress:0},progression:0,pageIndex:0,spreadIndex:0,timestamp:Date.now()}};
  const result={steps:[]};let disposed;
  const watch=()=>{const session=runtime.publication.session,original=session.dispose;let finish;disposed=new Promise(resolve=>{finish=resolve;});session.dispose=async function(...args){try{return await original.apply(this,args);}finally{finish();}};};
  const close=async()=>{await runtime.close();if(disposed)await disposed;};
  try{
    await runtime.open(base);watch();
    const found=await runtime.search({query:'phantom',limit:20});
    const locator=found.results.find(item=>item.locator?.manifestHref==='chapter_001.xhtml'&&item.locator.sourceRange)?.locator;
    if(!locator)throw Error('No later-page source range');
    const mark={href:locator.manifestHref,sourceRange:locator.sourceRange,text:'phantom'};
    const capture=async(step)=>{
      const value={step,snapshot:runtime.getSnapshot(),sessionId:String(runtime.publication.session.sessionId),geometry:await runtime.resolveExactSourceRange(mark)};
      if(value.geometry.status!=='resolved'||value.geometry.selectedText!==mark.text||!value.geometry.rects.length)throw Error('Later-page mark lost: '+JSON.stringify(value));
      result.steps.push(value);return value;
    };
    await runtime.goToLocator(locator);
    const before=await capture('18px');
    if(before.snapshot.position.pageIndex===0)throw Error('Control is on first page');
    await runtime.updateLayout({...layout,typography:{...layout.typography,fontSize:24}});
    const after=await capture('24px');
    if(after.sessionId!==before.sessionId||after.snapshot.position.pageIndex===before.snapshot.position.pageIndex)throw Error('Did not retain session and change pagination');
    await close();
    await runtime.open({...base,typography:{...layout.typography,fontSize:24},restorePosition:after.snapshot.position});watch();
    const reopened=await capture('reopened-24px');
    if(JSON.stringify(reopened.geometry)!==JSON.stringify(after.geometry)||reopened.snapshot.position.pageIndex!==after.snapshot.position.pageIndex)throw Error('Reopen changed later-page location');
    result.status='done';
  }finally{resume();await close();}
  return result;
})();
