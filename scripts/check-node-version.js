const fs = require('fs');
const path = require('path');

function readPreferredNodeVersion(rootDir) {
  const packageJsonPath = path.join(rootDir, 'package.json');
  try {
    const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    const voltaNode = String(pkg?.volta?.node || '').trim();
    if (voltaNode) return voltaNode;
  } catch {}

  const nvmrcPath = path.join(rootDir, '.nvmrc');
  try {
    const value = fs.readFileSync(nvmrcPath, 'utf8').trim();
    if (value) return value.replace(/^v/i, '');
  } catch {}

  return '';
}

function normalize(version) {
  return String(version || '').trim().replace(/^v/i, '');
}

function sameMajorMinor(a, b) {
  const [aMajor, aMinor] = normalize(a).split('.');
  const [bMajor, bMinor] = normalize(b).split('.');
  return Boolean(aMajor && bMajor && aMajor === bMajor && aMinor === bMinor);
}

function main() {
  const rootDir = path.join(__dirname, '..');
  const preferred = readPreferredNodeVersion(rootDir);
  const current = normalize(process.version);
  const strict = process.argv.includes('--strict');

  if (!preferred) {
    console.log(`[node-version] current Node ${current}; no preferred version configured`);
    return;
  }

  if (sameMajorMinor(current, preferred)) {
    console.log(`[node-version] using preferred Node ${current}`);
    return;
  }

  const message = [
    `[node-version] current Node ${current} differs from preferred ${preferred}`,
    '[node-version] run `nvm use` or install Volta to reduce gateway native-module drift',
  ].join('\n');

  if (strict) {
    console.error(message);
    process.exit(1);
  }

  console.warn(message);
}

main();
