const sharp = require('sharp');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const sourcePath = path.join(__dirname, '..', 'assets', 'icon.ico');
const outputDir = path.join(__dirname, '..', 'assets', 'icon.iconset');
const outputPath = path.join(__dirname, '..', 'assets', 'icon.icns');

// Mac 需要的尺寸
const sizes = [16, 32, 64, 128, 256, 512, 1024];

async function convertToMacIcon() {
  console.log('🎨 开始转换 Mac 图标...\n');
  
  // 创建 iconset 目录
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
    console.log('✅ 创建 iconset 目录');
  }
  
  // 生成各个尺寸的 PNG
  for (const size of sizes) {
    const pngPath = path.join(outputDir, `icon_${size}x${size}.png`);
    await sharp(sourcePath)
      .resize(size, size)
      .png()
      .toFile(pngPath);
    console.log(`✅ 生成 ${size}x${size} PNG`);
  }
  
  console.log('\n✅ 所有尺寸 PNG 已生成！');
  console.log(`📁 目录：${outputDir}`);
  
  // 提示用户在 Mac 上使用 iconutil 转换
  console.log('\n💡 在 Mac 上执行以下命令生成 .icns:');
  console.log(`   iconutil -c icns ${outputDir} -o ${outputPath}`);
  
  // 或者使用在线工具
  console.log('\n或者使用在线转换工具:');
  console.log('   https://cloudconvert.com/png-to-icns');
}

convertToMacIcon().catch(console.error);
