#!/usr/bin/env node
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

function resolveElectron() {
  const envPath = process.env.ELECTRON_PATH || process.env.LOCAL_ELECTRON_PATH;
  if (envPath && fs.existsSync(envPath)) {
    return envPath;
  }

  try {
    const electronModule = require('electron');
    if (typeof electronModule === 'string') {
      return electronModule;
    }
    if (electronModule && typeof electronModule === 'object' && electronModule.default) {
      return electronModule.default;
    }
  } catch (error) {
    if (error.code !== 'MODULE_NOT_FOUND') {
      console.error('[run-electron] Failed to resolve bundled electron:', error);
    }
  }

  const vendorDir = path.join(__dirname, '..', 'vendor', 'electron');
  const platformBins = {
    win32: 'electron.exe',
    darwin: 'Electron.app/Contents/MacOS/Electron',
    linux: 'electron'
  };
  const candidate = platformBins[process.platform];
  if (candidate) {
    const candidatePath = path.join(vendorDir, candidate);
    if (fs.existsSync(candidatePath)) {
      return candidatePath;
    }
  }

  return null;
}

async function main() {
  const electronPath = resolveElectron();
  if (!electronPath) {
    console.error(
      '\n⚠️  Electron is not installed.\n' +
        'Install it with `npm install electron --save-dev` when registry access is restored, sideload a tarball, or drop a vetted\n' +
        'binary under `vendor/electron/` and set ELECTRON_PATH accordingly. Windows users may need to run\n' +
        '`Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` once (see README.md).\n'
    );
    process.exitCode = 1;
    return;
  }

  const args = process.argv.slice(2);
  const child = spawn(electronPath, ['.'].concat(args), {
    stdio: 'inherit',
    env: process.env
  });

  child.on('exit', (code) => {
    process.exitCode = code ?? 0;
  });
}

main();
