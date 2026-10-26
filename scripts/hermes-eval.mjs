// Local Hermes inspection over Metro. Reads an expression from a UTF-8 file.
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
const require = createRequire(import.meta.url);
const WebSocket = require(path.resolve('node_modules/.pnpm/ws@8.21.3/node_modules/ws'));
const targets = await (await fetch('http://127.0.0.1:8081/json/list')).json();
const target = targets.find(t => t.appId === 'com.lunarain_079.lunar.dev');
if (!target) throw new Error('Lunar dev Hermes target unavailable');
const socket = new WebSocket(target.webSocketDebuggerUrl, { origin: 'http://127.0.0.1:8081' });
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true });
  socket.addEventListener('error', event => reject(event.error ?? new Error(event.message)), { once: true });
});
let sequence = 0;
const pending = new Map();
socket.addEventListener('message', event => {
  const data = JSON.parse(event.data);
  if (data.id && pending.has(data.id)) {
    const entry = pending.get(data.id);
    pending.delete(data.id);
    clearTimeout(entry.timer);
    if (data.error) entry.reject(new Error(JSON.stringify(data.error)));
    else entry.resolve(data.result);
  }
});
function call(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('CDP timed out: ' + method)); }, 30000);
    pending.set(id, { resolve, reject, timer });
    socket.send(JSON.stringify({ id, method, params }));
  });
}
try {
  await call('Runtime.enable');
  const expression = fs.readFileSync(process.argv[2], 'utf8');
  let result;
  if (process.argv.includes('--async')) {
    // Hermes uses RN's Promise implementation; CDP awaitPromise does not unwrap it.
    const start = `(() => { if(globalThis.__lunarAuditTask?.status==='pending')throw new Error('Another audit operation is still pending');globalThis.__lunarAuditTask={status:'pending'};Promise.resolve().then(()=>eval(${JSON.stringify(expression)})).then(value=>{globalThis.__lunarAuditTask={status:'done',value}},error=>{globalThis.__lunarAuditTask={status:'error',error:String(error),stack:error?.stack}});return {started:true};})()`;
    const started = await call('Runtime.evaluate', { expression: start, returnByValue: true });
    if (started.exceptionDetails) throw new Error(JSON.stringify(started.exceptionDetails));
    const deadline = Date.now() + 120000;
    do {
      await new Promise(resolve => setTimeout(resolve, 300));
      result = await call('Runtime.evaluate', { expression: 'globalThis.__lunarAuditTask', returnByValue: true });
      if (result.result?.value?.status !== 'pending') break;
      if (Date.now() > deadline) throw new Error('Audit task remains pending after 120 seconds; do not restart it');
    } while (true);
    if (result.result?.value?.status === 'error') process.exitCode = 1;
  } else {
    result = await call('Runtime.evaluate', { expression, returnByValue: true });
  }
  console.log(JSON.stringify(result));
  if (result.exceptionDetails) process.exitCode = 1;
} finally {
  socket.close();
}
