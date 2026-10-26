// Public ReaderSession host probe + the matching upstream primitive decoder.
// node vertical-interaction-audit.mjs LUNAR_ROOT base|fixed LINUX_BINARY [LINUX_FONT]
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import readline from 'node:readline';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

const [lunarArg,label,binary,fontArg] = process.argv.slice(2);
assert(label==='base'||label==='fixed','label must be base or fixed');
const lunar=path.resolve(lunarArg);
const evidence=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const decoderPath=path.join(lunar,'rito-rn/upstream/rito/packages/rito-core-wasm/src/reader-session-primitive-decoder-runtime.js');
const {decodeRitoReaderPrimitiveList}=await import(pathToFileURL(decoderPath));
const linux=p=>'/mnt/'+p[0].toLowerCase()+p.slice(2).replaceAll('\\','/');
const sample=path.join(evidence,'samples/ruby-writing-mode-probe.epub');
const child=spawn('wsl',['-d','Ubuntu-22.04','--',binary,linux(sample),
  fontArg??'/home/helian/rito-vertical-fixed/apps/reader/src/assets/fonts/SourceHanSerifCN-Regular.otf'],{stdio:['pipe','pipe','pipe']});
const completed=new Promise((resolve,reject)=>{
  child.once('error',reject);child.once('close',code=>resolve(code));
});
let errors='';child.stderr.on('data',c=>errors+=c.toString());
const lines=readline.createInterface({input:child.stdout})[Symbol.asyncIterator]();
async function query(v){child.stdin.write(JSON.stringify(v)+'\n');
  const line=await lines.next();assert(!line.done,errors);return JSON.parse(line.value);}
function locate(commands,text,vertical){
  const c=commands.find(c=>c.kind==='text' && c.text.includes(text));assert(c,`paint ${text}`);
  const chars=Array.from(c.text),prefix=Array.from(c.text.slice(0,c.text.indexOf(text))).length;
  const count=Array.from(text).length;
  const em=c.paint.font.sizePx;
  const step=vertical?c.rect.height/chars.length:em;
  return vertical?{x:c.rect.x,y:c.rect.y+prefix*step,width:em,height:count*step}:
    {x:c.rect.x+prefix*step,y:c.rect.y,width:count*step,height:c.rect.height};
}
function points(rect,vertical){
  return vertical?{anchor:{x:rect.x+rect.width/2,y:rect.y+0.05*rect.height},
    focus:{x:rect.x+rect.width/2,y:rect.y+0.95*rect.height}}:
    {anchor:{x:rect.x+0.05*rect.width,y:rect.y+rect.height/2},
    focus:{x:rect.x+0.95*rect.width,y:rect.y+rect.height/2}};
}
function sameRect(actual,expected){for(const key of ['x','y','width','height'])
  assert(Math.abs(actual[key]-expected[key])<1e-6,`${key}: ${actual[key]} != ${expected[key]}`);}
const cases=[];
try {
  for(const chapter of ['horizontal','vertical','prefixed']){
    const vertical=chapter!=='horizontal';const saved=[];
    for(const size of [18,20]){
      const opened=await query({action:'open',href:chapter+'.xhtml',size});
      assert(!opened.error,opened.error);
      const decoded=decodeRitoReaderPrimitiveList(Uint8Array.from(opened.wire));
      const paints=decoded.commands.filter(c=>c.kind==='text'||c.kind==='ruby');
      const result={chapter,size,displaySha256:opened.displaySha256,text:opened.text,
        hits:opened.hits,paints,checks:[]};
      for(const text of ['く','山道']){
        const expected=locate(paints,text,vertical);
        if(size===18){
          const selected=await query({action:'select',...points(expected,vertical)});
          result.checks.push({text,expected,selected});saved.push({text,targetJson:selected.targetJson});
          if(label==='fixed'){
            assert.equal(selected.text,text,JSON.stringify(selected));
            if(vertical){assert.equal(selected.rects.length,1);sameRect(selected.rects[0],expected);}
          }
        }else{
          const target=saved.find(s=>s.text===text)?.targetJson;
          const restored=target?await query({action:'restore',targetJson:target}):null;
          result.checks.push({text,expected,restored});
          if(label==='fixed'){
            assert.equal(restored.status,'Resolved');assert.equal(restored.text,text);
            if(vertical){assert.equal(restored.rects.length,1);sameRect(restored.rects[0],expected);}
          }
        }
      }
      cases.push(result);
    }
  }
}finally{child.stdin.end();}
assert.equal(await completed,0,errors);
const out=path.join(evidence,'reports/vertical-interaction-fix');fs.mkdirSync(out,{recursive:true});
fs.writeFileSync(path.join(out,label+'.json'),JSON.stringify({label,
  sampleSha256:crypto.createHash('sha256').update(fs.readFileSync(sample)).digest('hex'),
  decoderSha256:crypto.createHash('sha256').update(fs.readFileSync(decoderPath)).digest('hex'),
  platform:'Linux x86_64 / WSL host, not an Android APK',cases},null,2)+'\n');
fs.writeFileSync(path.join(out,label+'-stderr.log'),errors);
console.log(JSON.stringify(cases.map(c=>({chapter:c.chapter,size:c.size,
  selected:c.checks.map(t=>(t.selected??t.restored)?.text??null)})),null,2));
