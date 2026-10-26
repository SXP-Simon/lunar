import fs from 'node:fs';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
const evidence='../lunar-epub-evidence/scripts/hermes-eval.mjs';
const fixed=process.argv[2];assert.match(fixed,/^[a-f0-9]{40}$/);
const base='4641589621f24d0df7d5a0811a3e26b1856c64cf';
const results=[];
async function run(command,args){
  const child=spawn(command,args,{cwd:process.cwd(),stdio:['ignore','pipe','pipe']});
  let output='',error='';child.stdout.on('data',value=>{output+=value;});child.stderr.on('data',value=>{error+=value;});
  const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',resolve);});
  if(code!==0)throw Error(command+' '+args.join(' ')+'\n'+error+'\n'+output);
  return output;
}
try {
  for(let round=1;round<=3;round++){
    for(const [label,commit] of [['baseline',base],['fixed',fixed]]){
      assert.equal((await run('git',['status','--porcelain'])).trim(),'');
      await run('adb',['shell','am','force-stop','com.lunarain_079.lunar.dev']);
      await run('git',['switch','--detach',commit]);
      assert.equal((await run('git',['rev-parse','HEAD'])).trim(),commit);
      await new Promise(resolve=>setTimeout(resolve,1500));
      await run('adb',['shell','am','start','-W','-a','android.intent.action.VIEW','-d','lunar-dev://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A8081','com.lunarain_079.lunar.dev']);
      let ready;
      for(let attempt=0;;attempt++){
        const targets=await (await fetch('http://127.0.0.1:8081/json/list')).json();
        if(targets.some(t=>t.appId==='com.lunarain_079.lunar.dev')){
          ready=JSON.parse(await run(process.execPath,[evidence,'.tmp/epub-validation/reflow-ready.js'])).result?.value;
          if(ready?.ready)break;
        }
        if(attempt===100)throw Error('Fresh runtime did not become ready');
        await new Promise(resolve=>setTimeout(resolve,300));
      }
      assert.equal(ready.supportsReflow,label==='fixed');
      const pid=(await run('adb',['shell','pidof','com.lunarain_079.lunar.dev'])).trim();
      await run(process.execPath,[evidence,'.tmp/epub-validation/reader-perf-input.js']);
      const raw=await run(process.execPath,[evidence,'.tmp/epub-validation/reflow-cold-profile.js','--async']);
      fs.writeFileSync(`.tmp/epub-validation/reflow-cold-${label}-${round}.json`,raw);
      const task=JSON.parse(raw).result.value;
      assert.equal(task.status,'done',JSON.stringify(task));
      assert.equal(task.value.status,'done');
      assert.equal(task.value.supportsReflow,label==='fixed');
      assert.equal((await run('adb',['shell','pidof','com.lunarain_079.lunar.dev'])).trim(),pid);
      results.push({round,label,commit,pid,...task.value});
      fs.writeFileSync('.tmp/epub-validation/reflow-cold-trials.json',JSON.stringify(results,null,2)+'\n');
      console.log(JSON.stringify({round,label,pid,stats:task.value.stats}));
    }
  }
} finally {await run('git',['switch','perf/reader-session-reflow']);}
