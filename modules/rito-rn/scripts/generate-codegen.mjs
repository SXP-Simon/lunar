import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const require = createRequire(import.meta.url);
const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputRoot = path.resolve(process.argv[2]);
const specsRoot = path.join(packageRoot, 'specs');
const reactNativeRoot = path.dirname(require.resolve('react-native/package.json', {
  paths: [process.cwd(), packageRoot],
}));
const codegenRoot = path.dirname(require.resolve('@react-native/codegen/package.json', {
  paths: [reactNativeRoot],
}));
const combineCli = path.join(codegenRoot, 'lib', 'cli', 'combine', 'combine-js-to-schema-cli.js');
const generateCli = path.join(reactNativeRoot, 'scripts', 'generate-specs-cli.js');
const schemaPath = path.join(outputRoot, 'schema.json');

fs.rmSync(outputRoot, { recursive: true, force: true });
fs.mkdirSync(outputRoot, { recursive: true });

function run(nodeScript, args) {
  const result = spawnSync(process.execPath, [nodeScript, ...args], {
    cwd: packageRoot,
    stdio: 'inherit',
    windowsHide: true,
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

run(combineCli, [schemaPath, '--platform', 'android', '--libraryName', 'RitoReactNativeSpec', specsRoot]);
run(generateCli, [
  '--platform', 'android',
  '--schemaPath', schemaPath,
  '--outputDir', outputRoot,
  '--libraryName', 'RitoReactNativeSpec',
  '--javaPackageName', 'com.ritojs.reactnative',
]);
