const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const PROBE_SCRIPT = `
  const path = require('path');
  const gatewayDir = process.argv[1];
  const Database = require(path.join(gatewayDir, 'node_modules', 'better-sqlite3'));
  const sqliteVec = require(path.join(gatewayDir, 'node_modules', 'sqlite-vec'));
  const db = new Database(':memory:');
  if (sqliteVec && typeof sqliteVec.load === 'function') sqliteVec.load(db);
  db.exec('SELECT 1');
  db.close();
`;

function parseArgs(argv) {
  const args = { runtime: 'node', dryRun: false };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--runtime' && argv[i + 1]) {
      args.runtime = String(argv[i + 1]).trim();
      i += 1;
      continue;
    }
    if (token === '--dry-run') {
      args.dryRun = true;
    }
  }
  return args;
}

function resolveElectronVersion(rootDir) {
  const installedElectronPkg = path.join(rootDir, 'node_modules', 'electron', 'package.json');
  if (fs.existsSync(installedElectronPkg)) {
    const installed = JSON.parse(fs.readFileSync(installedElectronPkg, 'utf8'));
    const version = String(installed.version || '').trim();
    if (version) return version;
  }
  return '';
}

function getTargetInfo(rootDir, runtime) {
  if (runtime === 'electron') {
    const electronVersion = resolveElectronVersion(rootDir);
    return {
      runtime: 'electron',
      runtimeVersion: electronVersion,
      abi: '',
      modules: ['better-sqlite3', 'sqlite-vec'],
    };
  }
  return {
    runtime: 'node',
    runtimeVersion: process.version,
    abi: String(process.versions.modules || ''),
    modules: ['better-sqlite3', 'sqlite-vec'],
  };
}

function readMetadata(metaPath) {
  try {
    if (!fs.existsSync(metaPath)) return null;
    return JSON.parse(fs.readFileSync(metaPath, 'utf8'));
  } catch {
    return null;
  }
}

function needsRebuild(metadata, target) {
  if (!metadata) return true;
  if (metadata.runtime !== target.runtime) return true;
  if (metadata.runtimeVersion !== target.runtimeVersion) return true;
  if ((target.abi || '') !== (metadata.abi || '')) return true;
  return false;
}

function writeMetadata(metaPath, target) {
  const payload = {
    runtime: target.runtime,
    runtimeVersion: target.runtimeVersion,
    abi: target.abi || '',
    modules: target.modules,
    updatedAt: new Date().toISOString(),
  };
  fs.mkdirSync(path.dirname(metaPath), { recursive: true });
  fs.writeFileSync(metaPath, JSON.stringify(payload, null, 2));
}

function resolveElectronBinary() {
  try {
    return require('electron');
  } catch {
    return '';
  }
}

function canLoadNativeModules(gatewayDir, target) {
  const env = { ...process.env };
  let command = process.execPath;
  let args = ['-e', PROBE_SCRIPT, gatewayDir];
  let shell = false;

  if (target.runtime === 'electron') {
    const electronBinary = resolveElectronBinary();
    if (!electronBinary) return false;
    command = electronBinary;
    env.ELECTRON_RUN_AS_NODE = '1';
  }

  const result = spawnSync(command, args, {
    cwd: gatewayDir,
    stdio: 'ignore',
    shell,
    env,
  });

  return result.status === 0;
}

function rebuildForNode(gatewayDir, target) {
  const isWin = process.platform === 'win32';
  const command = isWin ? process.env.ComSpec || 'C:\\Windows\\System32\\cmd.exe' : 'npm';
  const args = isWin
    ? ['/d', '/s', '/c', `npm rebuild ${target.modules.join(' ')}`]
    : ['rebuild', ...target.modules];
  return spawnSync(command, args, {
    cwd: gatewayDir,
    stdio: 'inherit',
    shell: false,
  });
}

function rebuildForElectron(rootDir, target) {
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

  return spawnSync(rebuildCmd, [
    '-f',
    '-v',
    target.runtimeVersion,
    '-m',
    'oct-gateway',
    '-w',
    target.modules.join(','),
  ], {
    cwd: rootDir,
    stdio: 'inherit',
    shell: isWin,
  });
}

function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const rootDir = path.join(__dirname, '..');
  const gatewayDir = path.join(rootDir, 'oct-gateway');
  const metaPath = path.join(gatewayDir, 'node_modules', '.native-runtime.json');
  const target = getTargetInfo(rootDir, args.runtime);
  const metadata = readMetadata(metaPath);
  const runtimeHealthy = canLoadNativeModules(gatewayDir, target);

  if (!needsRebuild(metadata, target) && runtimeHealthy) {
    console.log(`[ensure-oct-gateway-native] native modules already match ${target.runtime} ${target.runtimeVersion || ''} ${target.abi || ''}`.trim());
    return;
  }

  if (runtimeHealthy) {
    writeMetadata(metaPath, target);
    console.log(`[ensure-oct-gateway-native] native modules already loadable for ${target.runtime}, metadata refreshed`);
    return;
  }

  console.log(`[ensure-oct-gateway-native] native modules need rebuild for ${target.runtime} ${target.runtimeVersion || ''} ${target.abi || ''}`.trim());
  if (args.dryRun) return;

  const result = target.runtime === 'electron'
    ? rebuildForElectron(rootDir, target)
    : rebuildForNode(gatewayDir, target);

  if (result.status !== 0) {
    process.exit(result.status || 1);
  }

  if (!canLoadNativeModules(gatewayDir, target)) {
    console.error(`[ensure-oct-gateway-native] native modules still failed to load after rebuild for ${target.runtime}`);
    process.exit(1);
  }

  writeMetadata(metaPath, target);
  console.log(`[ensure-oct-gateway-native] native modules aligned for ${target.runtime}`);
}

module.exports = { main };

if (require.main === module) {
  main();
}
