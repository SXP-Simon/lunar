// Execute the real app layout inspector; this does not test native rendering.
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const lunar = path.resolve(process.argv[2] || '../lunar');
const appRequire = createRequire(path.join(lunar, 'apps/mobile/package.json'));
const ts = appRequire('typescript');
require.extensions['.ts'] = (module, filename) => {
  module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, filename);
};
const { inspectReaderBookLayout } = require(path.join(lunar, 'apps/mobile/src/reader/rito/epub-layout.ts'));
const report = {
  commit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: lunar, encoding: 'utf8' }).trim(),
  status: execFileSync('git', ['status', '--short'], { cwd: lunar, encoding: 'utf8' }).trim(),
  runtime: process.version,
  samples: fs.readdirSync(path.join(root, 'samples')).filter(n => n.endsWith('.epub')).sort().map(file => {
    const bytes = fs.readFileSync(path.join(root, 'samples', file));
    return { file, sha256: createHash('sha256').update(bytes).digest('hex'), layout: inspectReaderBookLayout(bytes) };
  }),
};
fs.writeFileSync(path.join(root, 'reports/layout-inspector.json'), JSON.stringify(report, null, 2) + '\n');
console.log(report.samples.map(s => `${s.file}: ${s.layout.kind} (${s.layout.fixedLayoutSpineItems} fixed / ${s.layout.reflowableSpineItems} flow)`).join('\n'));
