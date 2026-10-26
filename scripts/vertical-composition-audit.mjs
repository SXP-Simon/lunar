// Real paint -> pointer selection -> serialized annotation -> reflow and new process.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import readline from 'node:readline';
import { fileURLToPath, pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

const [rootArg, binary, font] = process.argv.slice(2).filter(arg => !arg.startsWith('--out='));
const root = path.resolve(rootArg);
const kernel = fs.existsSync(path.join(root, 'Cargo.toml')) ? root : path.join(root, 'rito-rn/upstream/rito');
const evidence = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const decoder = path.join(kernel, 'packages/rito-core-wasm/src/reader-session-primitive-decoder-runtime.js');
const { decodeRitoReaderPrimitiveList } = await import(pathToFileURL(decoder));
const sample = path.join(evidence, 'samples/vertical-composition-probe.epub');
const linux = value => '/mnt/' + value[0].toLowerCase() + value.slice(2).replaceAll('\\', '/');
const outputArg = process.argv.find(arg => arg.startsWith('--out='));
const report = outputArg ? path.resolve(outputArg.slice(6)) : path.join(evidence, 'reports/vertical-composition');
fs.mkdirSync(report, { recursive: true });
const texts = ['盒内文字', '一级', '二级', '末尾', '山道'];
let stderr = '';
const result = {
  sampleSha256: crypto.createHash('sha256').update(fs.readFileSync(sample)).digest('hex'),
  decoderSha256: crypto.createHash('sha256').update(fs.readFileSync(decoder)).digest('hex'),
  binary, font, platform: 'Linux native ReaderSession; not an Android updated APK', chapters: [],
};

function client() {
  const windows = process.platform === 'win32';
  const child = spawn(windows ? 'wsl' : binary, windows
    ? ['-d', 'Ubuntu-22.04', '--', binary, linux(sample), font]
    : [sample, font], { stdio: ['pipe', 'pipe', 'pipe'] });
  const done = new Promise((resolve, reject) => {
    child.once('error', reject); child.once('close', resolve);
  });
  child.stderr.on('data', chunk => { stderr += chunk.toString(); });
  const lines = readline.createInterface({ input: child.stdout })[Symbol.asyncIterator]();
  return {
    async query(value) {
      child.stdin.write(JSON.stringify(value) + '\n');
      const line = await lines.next();
      assert(!line.done, stderr);
      const response = JSON.parse(line.value);
      assert(!response.error, response.error);
      return response;
    },
    async close() { child.stdin.end(); assert.equal(await done, 0, stderr); },
  };
}
function sameRect(actual, expected) {
  for (const key of ['x', 'y', 'width', 'height']) {
    assert(Math.abs(actual[key] - expected[key]) < 1e-6, `${key}: ${actual[key]} != ${expected[key]}`);
  }
}
function expected(frame, text, vertical) {
  const command = frame.commands.find(c => c.kind === 'text' && c.text.includes(text));
  assert(command, `missing paint: ${text}`);
  const prefix = Array.from(command.text.slice(0, command.text.indexOf(text))).length;
  const count = Array.from(text).length;
  const total = Array.from(command.text).length;
  const step = (vertical ? command.rect.height : command.rect.width) / total;
  return vertical
    ? { x: command.rect.x, y: command.rect.y + prefix * step, width: command.rect.width, height: count * step }
    : { x: command.rect.x + prefix * step, y: command.rect.y, width: count * step, height: command.rect.height };
}
function points(rect, vertical, pageIndex) {
  const point = fraction => ({ pageIndex,
    x: rect.x + rect.width * (vertical ? 0.5 : fraction),
    y: rect.y + rect.height * (vertical ? fraction : 0.5),
  });
  return { anchor: point(0.05), focus: point(0.95) };
}
async function open(api, chapter, size, extra = {}) {
  const response = await api.query({ action: 'open', href: chapter + '.xhtml', size, ...extra });
  const decoded = decodeRitoReaderPrimitiveList(Uint8Array.from(response.wire));
  delete response.wire;
  return { ...response, commands: decoded.commands };
}
function snapshot(frame) {
  return { ...frame, commands: frame.commands.filter(c => c.kind === 'draw-image' || c.kind === 'ruby'
    || (c.kind === 'text' && texts.some(text => c.text.includes(text)))) };
}
function checkRange(response, text, rect, vertical) {
  assert.equal(response.text, text, JSON.stringify(response));
  if (vertical) {
    assert.equal(response.rects.length, 1);
    sameRect(response.rects[0], rect);
  }
}
try {
  for (const chapter of ['horizontal', 'vertical', 'prefixed']) {
    const vertical = chapter !== 'horizontal';
    const record = { chapter, initial: [], reflow: [], reopened: [], back: [] };
    result.chapters.push(record);
    const saved = [];
    let api = client();
    try {
      for (const text of texts) {
        const anchorId = text === '山道' ? 'ruby' : text === '盒内文字' ? undefined : 'nested';
        const frame = await open(api, chapter, 18, anchorId ? { anchorId } : {});
        const rect = expected(frame, text, vertical);
        const selected = await api.query({ action: 'select', ...points(rect, vertical, frame.pageIndex) });
        record.initial.push({ text, expected: rect, frame: snapshot(frame), selected });
        checkRange(selected, text, rect, vertical);
        assert.equal(selected.status, 'selected');
        assert(selected.targetJson);
        const range = { start: selected.start, end: selected.end };
        saved.push({ text, targetJson: selected.targetJson, range, rect });
      }
      const head = await open(api, chapter, 24);
      record.headAt24 = snapshot(head);
      record.mainTargetLeftFirstPage = !head.commands.some(c => c.kind === 'text' && c.text.includes('盒内文字'));
      assert(record.mainTargetLeftFirstPage, 'the long control must move the marked text off the chapter head');
      for (const mark of saved) {
        const frame = await open(api, chapter, 24, { range: mark.range });
        const rect = expected(frame, mark.text, vertical);
        const restored = await api.query({ action: 'restore', targetJson: mark.targetJson });
        record.reflow.push({ text: mark.text, expected: rect, frame: snapshot(frame), restored });
        assert.equal(restored.status, 'Resolved');
        checkRange(restored, mark.text, rect, vertical);
        assert(rect.width !== mark.rect.width || rect.height !== mark.rect.height, 'font reflow changed glyph geometry');
      }
    } finally { await api.close(); }
    // A fresh executable/session gets only serialized marks and source ranges.
    api = client();
    try {
      for (const size of [24, 18]) {
        for (const mark of saved) {
          const frame = await open(api, chapter, size, { range: mark.range });
          const rect = expected(frame, mark.text, vertical);
          const restored = await api.query({ action: 'restore', targetJson: mark.targetJson });
          const records = size === 24 ? record.reopened : record.back;
          records.push({ text: mark.text, expected: rect, frame: snapshot(frame), restored });
          assert.equal(restored.status, 'Resolved');
          checkRange(restored, mark.text, rect, vertical);
          if (vertical) sameRect(rect, size === 24
            ? record.reflow.find(item => item.text === mark.text).expected : mark.rect);
        }
      }
    } finally { await api.close(); }
  }
} catch (error) {
  result.failure = String(error.stack ?? error);
  throw error;
} finally {
  fs.writeFileSync(path.join(report, 'interaction.json'), JSON.stringify(result, null, 2) + '\n');
  fs.writeFileSync(path.join(report, 'native-stderr.log'), stderr);
}
console.log(JSON.stringify(result.chapters.map(chapter => ({ chapter: chapter.chapter,
  selected: chapter.initial.length, reflow: chapter.reflow.length, reopened: chapter.reopened.length,
  back: chapter.back.length, mainTargetLeftFirstPage: chapter.mainTargetLeftFirstPage }))));
