// Runs actual Lunar TypeScript inspector functions in Node. No native/rendering mocks.
// This proves import metadata and initial-spine behavior, NOT Android rendering.
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const Module = require('node:module');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const lunar = path.resolve(process.argv[2] || '../lunar');
const output = process.argv[3] || 'inspector.json';
const appRequire = createRequire(path.join(lunar, 'apps/mobile/package.json'));
const ts = appRequire('typescript');
require.extensions['.ts'] = (module, filename) => {
  const { outputText } = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  module._compile(outputText, filename);
};
const inspectorPath = 'apps/mobile/src/reader/rito/epub-inspector.ts';
const sourceRef = process.env.LUNAR_SOURCE_REF;
let inspector;
if (sourceRef) {
  const source = execFileSync('git', ['show', `${sourceRef}:${inspectorPath}`], { cwd: lunar, encoding: 'utf8' });
  const filename = path.join(lunar, inspectorPath);
  const mod = new Module(filename, module);
  mod.filename = filename;
  mod.paths = Module._nodeModulePaths(path.dirname(filename));
  mod._compile(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, filename);
  inspector = mod.exports;
} else inspector = require(path.join(lunar, inspectorPath));
const run = fn => { try { return { ok: true, value: fn() }; } catch (e) { return { ok: false, error: e.message }; } };
const report = {
  commit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: lunar, encoding: 'utf8' }).trim(),
  diff: execFileSync('git', ['diff', '--stat'], { cwd: lunar, encoding: 'utf8' }).trim(),
  runtime: process.version,
  sourceRef: sourceRef || 'working-tree',
  scope: 'Real application metadata/cover/initial-spine functions; no native runtime or device rendering.',
  samples: fs.readdirSync(path.join(root, 'samples')).filter(n => n.endsWith('.epub')).sort().map(file => {
    const bytes = fs.readFileSync(path.join(root, 'samples', file));
    const data = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    return { file, sha256: createHash('sha256').update(bytes).digest('hex'),
      inspect: run(() => { const v = inspector.inspectReaderBookAssets(data); return { metadata: v.metadata, cover: v.cover && { source: v.cover.source, mediaType: v.cover.mediaType, byteLength: v.cover.bytes.length } }; }),
      initialSpine: run(() => inspector.discoverReaderInitialSpineHref(data)),
    };
  }),
};
fs.writeFileSync(path.join(root, 'reports', output), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report.samples.map(s => ({ file: s.file, inspect: s.inspect.ok, spine: s.initialSpine })), null, 2));
