import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function patchFile(relativePath, marker, applyPatch) {
  const filePath = path.join(projectRoot, relativePath);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Expected Metro file is missing: ${relativePath}`);
  }

  const source = fs.readFileSync(filePath, 'utf8');
  if (source.includes(marker)) {
    return;
  }

  const patched = applyPatch(source);
  if (patched === source) {
    throw new Error(`Unable to patch Metro file: ${relativePath}`);
  }
  fs.writeFileSync(filePath, patched);
}

patchFile(
  'node_modules/metro/src/node-haste/DependencyGraph.js',
  'const workletsDirPath = _path.default.join(',
  (source) => {
    const withPath = source.replace(
      'class DependencyGraph extends _events.default {',
      `const workletsDirPath = _path.default.join(\n  "react-native-worklets",\n  ".worklets",\n);\nclass DependencyGraph extends _events.default {`,
    );
    return withPath.replace(
      '  async getOrComputeSha1(mixedPath) {\n',
      `  async getOrComputeSha1(mixedPath) {\n    if (mixedPath.includes(workletsDirPath)) {\n      const createHash = require("crypto").createHash;\n      return {\n        sha1: createHash("sha1")\n          .update(performance.now().toString())\n          .digest("hex"),\n      };\n    }\n`,
    );
  },
);

patchFile(
  'node_modules/metro-runtime/src/modules/HMRClient.js',
  'global.__workletsModuleProxy?.propagateModuleUpdate',
  (source) =>
    source.replace(
      'const inject = ({ module: [id, code], sourceURL }) => {\n',
      `const inject = ({ module: [id, code], sourceURL }) => {\n  if (global.__workletsModuleProxy?.propagateModuleUpdate) {\n    global.__workletsModuleProxy.propagateModuleUpdate(code, sourceURL);\n  }\n`,
    ),
);
