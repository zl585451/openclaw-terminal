const fs = require('fs');
const path = require('path');

const releaseDir = path.resolve(process.cwd(), 'release');

const forbiddenNamePatterns = [
  // Block real env files; allow templates like .env.example/.env.sample.
  /^\.env(\..+)?$/i,
  /\.pem$/i,
  /\.key$/i,
  /^id_rsa(\..+)?$/i,
  /license_keys/i,
];

const forbiddenPathFragments = [
  '/.git/',
  '/.cursor/',
  '/agent-transcripts/',
];

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, out);
    } else {
      out.push(full);
    }
  }
  return out;
}

if (!fs.existsSync(releaseDir)) {
  console.error('[release-safety] release directory not found:', releaseDir);
  process.exit(1);
}

const files = walk(releaseDir);
const violations = [];

for (const fullPath of files) {
  const relPath = path.relative(releaseDir, fullPath).replace(/\\/g, '/');
  const fileName = path.basename(fullPath);

  const isEnvTemplate =
    /^\.env\.(example|sample|template)$/i.test(fileName) || /^\.env\.local\.example$/i.test(fileName);

  const badName = forbiddenNamePatterns.some((p) => p.test(fileName));
  const badPath = forbiddenPathFragments.some((frag) =>
    `/${relPath.toLowerCase()}/`.includes(frag.toLowerCase()),
  );

  if ((badName && !isEnvTemplate) || badPath) {
    violations.push(relPath);
  }
}

if (violations.length > 0) {
  console.error('[release-safety] Found forbidden files in release output:');
  for (const v of violations) {
    console.error(` - ${v}`);
  }
  process.exit(2);
}

console.log(`[release-safety] OK. Checked ${files.length} files.`);
