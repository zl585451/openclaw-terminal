#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');
const scanRoots = ['src', 'electron', 'oct-gateway'];
const codeExtensions = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);
const ignoredDirs = new Set([
  'node_modules',
  'dist',
  'dist-electron',
  'release',
  '.git',
  '.tmp',
  '.vscode',
  '.cursor',
]);

function walk(dir, files = []) {
  if (!fs.existsSync(dir)) return files;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!ignoredDirs.has(entry.name)) {
        walk(path.join(dir, entry.name), files);
      }
      continue;
    }
    const fullPath = path.join(dir, entry.name);
    if (codeExtensions.has(path.extname(entry.name))) {
      files.push(fullPath);
    }
  }
  return files;
}

function relative(filePath) {
  return path.relative(repoRoot, filePath).replace(/\\/g, '/');
}

function countLines(content) {
  if (!content) return 0;
  return content.split(/\r?\n/).length;
}

function collectLargeFiles(files, threshold) {
  return files
    .map((filePath) => {
      const content = fs.readFileSync(filePath, 'utf8');
      return { file: relative(filePath), lines: countLines(content) };
    })
    .filter((entry) => entry.lines >= threshold)
    .sort((a, b) => b.lines - a.lines)
    .slice(0, 20);
}

function collectNamedDeclarations(files) {
  const namedDeclarations = new Map();
  const declarationRegex =
    /^\s*(?:export\s+)?(?:declare\s+)?(interface|type)\s+([A-Z][A-Za-z0-9_]*)\b/gm;

  for (const filePath of files) {
    const content = fs.readFileSync(filePath, 'utf8');
    let match;
    while ((match = declarationRegex.exec(content)) !== null) {
      const [, kind, name] = match;
      const linesBefore = content.slice(0, match.index).split(/\r?\n/).length;
      const hit = {
        kind,
        file: relative(filePath),
        line: linesBefore,
      };
      if (!namedDeclarations.has(name)) {
        namedDeclarations.set(name, []);
      }
      namedDeclarations.get(name).push(hit);
    }
  }

  return [...namedDeclarations.entries()]
    .filter(([, hits]) => hits.length > 1)
    .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
    .slice(0, 20)
    .map(([name, hits]) => ({ name, hits }));
}

function buildReport() {
  const files = scanRoots.flatMap((root) => walk(path.join(repoRoot, root)));
  return {
    generatedAt: new Date().toISOString(),
    roots: scanRoots,
    fileCount: files.length,
    largeFiles: collectLargeFiles(files, 300),
    duplicateNamedDeclarations: collectNamedDeclarations(files),
  };
}

function printText(report) {
  console.log('OCT Repo Hygiene Report');
  console.log(`Generated: ${report.generatedAt}`);
  console.log(`Scanned files: ${report.fileCount}`);
  console.log('');

  console.log('Large files (>= 300 lines)');
  if (report.largeFiles.length === 0) {
    console.log('- none');
  } else {
    for (const entry of report.largeFiles) {
      console.log(`- ${entry.lines.toString().padStart(4, ' ')}  ${entry.file}`);
    }
  }
  console.log('');

  console.log('Duplicate interface/type names');
  if (report.duplicateNamedDeclarations.length === 0) {
    console.log('- none');
    return;
  }

  for (const entry of report.duplicateNamedDeclarations) {
    const locations = entry.hits
      .map((hit) => `${hit.kind} ${hit.file}:${hit.line}`)
      .join(' | ');
    console.log(`- ${entry.name} (${entry.hits.length}) -> ${locations}`);
  }
}

const report = buildReport();
if (process.argv.includes('--json')) {
  console.log(JSON.stringify(report, null, 2));
} else {
  printText(report);
}
