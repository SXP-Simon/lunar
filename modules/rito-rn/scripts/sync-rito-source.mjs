import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const moduleRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const projectRoot = path.resolve(moduleRoot, '../..');
const sourceRoot = path.resolve(process.env.RITO_SOURCE_DIR ?? path.join(projectRoot, 'lib/Rito'));
const destinationRoot = path.join(moduleRoot, 'native/rito');
const crates = [
  'rito-core',
  'rito-ffi',
  'rito-block',
  'rito-fragment',
  'rito-inline',
  'rito-source',
  'rito-style-contract',
  'rito-stylo',
];

if (!fs.existsSync(sourceRoot)) {
  throw new Error(`Rito source directory does not exist: ${sourceRoot}`);
}
const sourcePackage = JSON.parse(fs.readFileSync(path.join(sourceRoot, 'packages/rito/package.json'), 'utf8'));
if (sourcePackage.name !== '@ritojs/core' || sourcePackage.version !== '2.0.0') {
  throw new Error(`Expected Rito @ritojs/core 2.0.0 source, found ${sourcePackage.name}@${sourcePackage.version}.`);
}

copyFile('Cargo.lock');
for (const crate of crates) {
  copyFile(`crates/${crate}/Cargo.toml`);
  copyDirectory(`crates/${crate}/src`);
}
copyFile('crates/rito-ffi/include/rito_ffi.h');
copyFile('crates/vendor/parley/Cargo.toml');
copyDirectory('crates/vendor/parley/src');

console.log(`Synchronized Rito Rust sources into ${destinationRoot}`);

function copyFile(relative) {
  const source = path.join(sourceRoot, relative);
  const destination = path.join(destinationRoot, relative);
  if (!fs.existsSync(source)) throw new Error(`Missing Rito source file: ${source}`);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination);
}

function copyDirectory(relative) {
  const source = path.join(sourceRoot, relative);
  const destination = path.join(destinationRoot, relative);
  if (!fs.existsSync(source)) throw new Error(`Missing Rito source directory: ${source}`);
  fs.rmSync(destination, { recursive: true, force: true });
  fs.cpSync(source, destination, { recursive: true });
}
