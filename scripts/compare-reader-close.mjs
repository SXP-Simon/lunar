import fs from 'node:fs';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
const root=process.cwd();
const evidence='../lunar-epub-evidence/scripts/hermes-eval.mjs';
const base='4641589621f24d0df7d5a0811a3e26b1856c64cf';
const fixed='f6f336f0f621a35750d83465cd713d30110cf0de';
const results=[];
async function run(command,args){
  const child=spawn(command,args,{cwd:root,stdio:['ignore','pipe','pipe']});
  let output='',error='';child.stdout.on('data',value=>{output+=value;});child.stderr.on('data',value=>{error+=value;});
  const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',resolve);});
  if(code!==0)throw Error(command+' '+args.join(' ')+'\n'+error+'\n'+output);
  return output;
}
try {
  for (let round=1;round<=3;round++) {
    for (const [label,commit] of [['baseline',base],['fixed',fixed]]) {
      assert.equal((await run('git',['status','--porcelain'])).trim(),'');
      await run('adb',['shell','am','force-stop','com.lunarain_079.lunar.dev']);
      await run('git',['switch','--detach',commit]);
      assert.equal((await run('git',['rev-parse','HEAD'])).trim(),commit);
      await new Promise(resolve=>setTimeout(resolve,1500));
      await run('adb',['shell','am','start','-W','-a','android.intent.action.VIEW','-d','lunar-dev://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A8081','com.lunarain_079.lunar.dev']);
      for (let attempt=0;;attempt++) {
        const targets=await (await fetch('http://127.0.0.1:8081/json/list')).json();
        if(targets.some(target=>target.appId==='com.lunarain_079.lunar.dev'))break;
        if(attempt===80)throw Error('Fresh Hermes target did not appear');
        await new Promise(resolve=>setTimeout(resolve,250));
      }
      await run(process.execPath,[evidence,'.tmp/epub-validation/reader-perf-input.js']);
      const raw=await run(process.execPath,[evidence,'.tmp/epub-validation/reader-close-observer.js','--async']);
      fs.writeFileSync(`.tmp/epub-validation/reader-close-formal-${label}-${round}.json`,raw);
      const task=JSON.parse(raw).result.value;
      assert.equal(task.status,'done',JSON.stringify(task));
      results.push({round,label,commit,...task.value});
      fs.writeFileSync('.tmp/epub-validation/reader-close-formal-trials.json',JSON.stringify(results,null,2)+'\n');
      assert.equal(task.value.disposeStatus,'ok');
      assert.equal(task.value.tracksPendingClose,label==='fixed');
      assert.equal(task.value.nativeDisposedWhenCloseResolved,label==='fixed');
      console.log(JSON.stringify({round,label,nativeDisposedWhenCloseResolved:task.value.nativeDisposedWhenCloseResolved}));
    }
  }
} finally {await run('git',['switch','fix/reader-close-pending']);}
