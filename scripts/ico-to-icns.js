#!/usr/bin/env node
/**
 * 将 icon.ico 转换为 icon.icns (macOS)
 * 依赖: ico-to-png, sharp, icon-gen
 */
const path = require('path');
const fs = require('fs');

const SRC_ICO = path.join(__dirname, '../assets/icon.ico');
const OUT_ICNS = path.join(__dirname, '../assets/icon.icns');
const TEMP_DIR = path.join(__dirname, '../.icon-temp');
const ICNS_SIZES = [16, 32, 64, 128, 256, 512, 1024];

async function main() {
  const icoToPng = require('ico-to-png');
  const sharp = require('sharp');
  if (!fs.existsSync(SRC_ICO)) {
    console.error('源文件不存在:', SRC_ICO);
    process.exit(1);
  }

  if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
  }

  console.log('1. 从 ICO 生成各尺寸 PNG...');
  const icoBuffer = fs.readFileSync(SRC_ICO);
  await Promise.all(ICNS_SIZES.map(async (size) => {
    const pngBuffer = await icoToPng(icoBuffer, size, { scaleUp: true });
    fs.writeFileSync(path.join(TEMP_DIR, `${size}.png`), pngBuffer);
  }));

  console.log('2. 生成 ICNS...');
  const icongen = require('icon-gen');
  const results = await icongen(TEMP_DIR, TEMP_DIR, {
    report: false,
    ico: false,
    icns: { name: 'icon', sizes: ICNS_SIZES },
    favicon: false,
  });

  const generated = path.join(TEMP_DIR, 'icon.icns');
  if (fs.existsSync(generated)) {
    fs.copyFileSync(generated, OUT_ICNS);
    console.log('3. 已输出:', OUT_ICNS);
  } else {
    console.error('生成失败，未找到 icon.icns');
    process.exit(1);
  }

  fs.rmSync(TEMP_DIR, { recursive: true, force: true });
  console.log('完成');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
