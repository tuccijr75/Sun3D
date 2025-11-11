#!/usr/bin/env node
const { spawn } = require('node:child_process');
const path = require('node:path');

function resolveBuilder() {
  try {
    return require.resolve('electron-builder/out/cli/cli.js');
  } catch (error) {
    if (error.code !== 'MODULE_NOT_FOUND') {
      console.error('[run-builder] Failed to resolve electron-builder:', error);
    }
    return null;
  }
}

async function main() {
  const builderPath = resolveBuilder();
  if (!builderPath) {
    console.error(
      '\n⚠️  electron-builder is not installed.\n' +
        'Install it with `npm install electron-builder --save-dev` when registry access is restored, sideload a tarball,\n' +
        'or supply a vetted offline copy and expose its path via NODE_PATH. See the README for offline packaging guidance and the\n' +
        'Windows execution policy note.\n'
    );
    process.exitCode = 1;
    return;
  }

  const args = process.argv.slice(2);
  const child = spawn(process.execPath, [builderPath, ...args], {
    stdio: 'inherit',
    env: process.env,
    cwd: process.cwd()
  });

  child.on('exit', (code) => {
    process.exitCode = code ?? 0;
  });
}

main();
