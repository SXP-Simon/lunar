import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { ENTRY_FILE } from '@lunar/plugin-sdk/package-format';
import { buildPlugin } from './build.ts';
import { startDevServer } from './dev-server.ts';
import { initProject } from './init.ts';
import { checkPackageLimits, collectPackageFiles, packPlugin } from './pack.ts';
import { loadProject } from './project.ts';

const USAGE = `Usage: lunar-plugin <command> [directory] [options]

Commands:
  init <directory> --id <id> --name <name>   Create a plugin project
  build [directory]                          Bundle the plugin into dist/main.js
  validate [directory]                       Check the manifest, locales, build and package limits
  pack [directory]                           Build and write dist/<id>-<version>.lunar-plugin
  dev [directory] [--port 5757] [--host 0.0.0.0]
                                             Rebuild on change and serve to a Lunar development build`;

export async function main(argv: readonly string[]): Promise<number> {
  const [command, ...rest] = argv;
  const { values, positionals } = parseArgs({
    args: [...rest],
    allowPositionals: true,
    options: {
      id: { type: 'string' },
      name: { type: 'string' },
      port: { type: 'string', default: '5757' },
      host: { type: 'string', default: '0.0.0.0' },
      help: { type: 'boolean', short: 'h' },
    },
  });
  const directory = positionals[0] ?? '.';
  if (!command || values.help || command === 'help') {
    console.log(USAGE);
    return command ? 0 : 1;
  }

  switch (command) {
    case 'init': {
      if (!positionals[0] || !values.id || !values.name) {
        console.error('init requires a directory, --id and --name');
        return 1;
      }
      const files = await initProject(directory, { id: values.id, name: values.name });
      console.log(`Created ${files.length} files in ${path.resolve(directory)}`);
      return 0;
    }
    case 'build': {
      const project = await loadProject(directory);
      const result = await buildPlugin(project);
      await mkdir(project.outDir, { recursive: true });
      await writeFile(path.join(project.outDir, ENTRY_FILE), result.code);
      result.warnings.forEach((warning) => console.warn(`warning: ${warning}`));
      console.log(`Built ${path.join(project.outDir, ENTRY_FILE)} (${result.code.byteLength} bytes)`);
      return 0;
    }
    case 'validate': {
      const project = await loadProject(directory);
      const result = await buildPlugin(project);
      const problems = checkPackageLimits(await collectPackageFiles(project, result.code));
      if (problems.length > 0) {
        problems.forEach((problem) => console.error(`error: ${problem}`));
        return 1;
      }
      console.log(`${project.manifest.id}@${project.manifest.version} is valid`);
      return 0;
    }
    case 'pack': {
      const result = await packPlugin(await loadProject(directory));
      result.warnings.forEach((warning) => console.warn(`warning: ${warning}`));
      console.log(`Packed ${result.file} (${result.bytes} bytes, sha256 ${result.sha256})`);
      return 0;
    }
    case 'dev': {
      const port = Number(values.port);
      if (!Number.isInteger(port) || port < 0 || port > 65_535) {
        console.error('--port must be an integer between 0 and 65535');
        return 1;
      }
      const server = await startDevServer(directory, {
        port,
        host: values.host ?? '0.0.0.0',
        onEvent: (message) => console.log(`[dev] ${message}`),
      });
      console.log('Enter one of these addresses in Lunar → Settings → Plugins → Developer connection:');
      server.urls.forEach((url) => console.log(`  ${url}`));
      await new Promise<void>((resolve) => process.once('SIGINT', () => resolve()));
      await server.close();
      return 0;
    }
    default:
      console.error(`Unknown command "${command}"\n\n${USAGE}`);
      return 1;
  }
}
