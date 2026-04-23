const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function resolveElectronVersion() {
  const installedElectronPkg = path.join(__dirname, '..', 'node_modules', 'electron', 'package.json');
  if (fs.existsSync(installedElectronPkg)) {
    const installed = JSON.parse(fs.readFileSync(installedElectronPkg, 'utf8'));
    const version = String(installed.version || '').trim();
    if (version) return version;
  }

  const pkgPath = path.join(__dirname, '..', 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  const raw =
    (pkg.devDependencies && pkg.devDependencies.electron)
    || (pkg.dependencies && pkg.dependencies.electron)
    || '';
  const cleaned = String(raw).trim().replace(/^[^\d]*/, '');
  if (!cleaned) {
    throw new Error('Cannot resolve Electron version from package.json');
  }
  return cleaned;
}

function main() {
  const rootDir = path.join(__dirname, '..');
  const electronVersion = resolveElectronVersion();
  const isWin = process.platform === 'win32';
  const rebuildCmd = path.join(
    rootDir,
    'node_modules',
    '.bin',
    isWin ? 'electron-rebuild.cmd' : 'electron-rebuild',
  );

  if (!fs.existsSync(rebuildCmd)) {
    throw new Error(`electron-rebuild not found: ${rebuildCmd}`);
  }

  const args = [
    '-f',
    '-v',
    electronVersion,
    '-m',
    'oct-gateway',
    '-w',
    'better-sqlite3,sqlite-vec',
  ];

  console.log(`[rebuild-oct-gateway-native] rebuilding for Electron ${electronVersion}`);
  const result = spawnSync(rebuildCmd, args, {
    cwd: rootDir,
    stdio: 'inherit',
    shell: isWin,
  });

  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

main();
