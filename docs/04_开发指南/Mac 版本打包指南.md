# 🍎 OCT Mac 版本打包指南

**OpenClaw Terminal for macOS**

---

## 📋 打包方式

### 方式 1：在 Mac 电脑上打包（推荐）⭐

**要求**：
- macOS 10.13 或更高版本
- Node.js 18+
- Xcode Command Line Tools

**步骤**：

```bash
# 1. 克隆代码
git clone https://github.com/zl585451/openclaw-terminal.git
cd openclaw-terminal

# 2. 安装依赖
npm install

# 3. 打包 Mac 版本（Intel + M1/M2）
npm run electron:build:mac

# 4. 查看打包结果
ls release/
# OCT-0.1.0-Mac-x64.dmg    (Intel Mac)
# OCT-0.1.0-Mac-arm64.dmg  (M1/M2 Mac)
```

---

### 方式 2：使用 GitHub Actions 自动打包（推荐）⭐

**优点**：
- ✅ 不需要 Mac 电脑
- ✅ 自动打包 Intel + M1/M2
- ✅ 自动发布到 GitHub Release

**步骤**：

1. 创建 `.github/workflows/build-mac.yml`
2. 推送代码到 GitHub
3. 自动打包并发布

**我已经帮你创建了！** 见下方文件。

---

### 方式 3：在 Windows 上打包（不推荐）

**问题**：
- ❌ 需要 Mac 的签名证书
- ❌ 需要 Mac 的开发者账号
- ❌ 打包的 DMG 可能无法在 Mac 上运行

**结论**：不建议在 Windows 上打包 Mac 版本。

---

## 📦 打包结果

### Intel Mac (x64)
- **文件名**: `OCT-0.1.0-Mac-x64.dmg`
- **大小**: ~120MB
- **系统**: macOS 10.13+ (Intel)

### Apple Silicon (M1/M2)
- **文件名**: `OCT-0.1.0-Mac-arm64.dmg`
- **大小**: ~120MB
- **系统**: macOS 11.0+ (M1/M2)

### Universal (合并版)
- **文件名**: `OCT-0.1.0-Mac-Universal.dmg`
- **大小**: ~240MB
- **系统**: macOS 10.13+ (Intel + M1/M2)

---

## 🔧 Mac 特有配置

### 图标文件

需要 Mac 图标格式 `.icns`：

```bash
# 从 PNG 生成 ICNS
mkdir icon.iconset
sips -z 512 512 assets/icon.png --out icon.iconset/icon_512x512.png
sips -z 256 256 assets/icon.png --out icon.iconset/icon_256x256.png
sips -z 128 128 assets/icon.png --out icon.iconset/icon_128x128.png
iconutil -c icns icon.iconset -o assets/icon.icns
```

### 签名和公证（可选）

如果要上架 Mac App Store 或避免安全警告：

```bash
# 1. 申请 Apple Developer 账号（$99/年）
# 2. 创建证书
# 3. 签名应用
codesign --deep --force --verify --verbose \
  --sign "Developer ID Application: Your Name" \
  release/OCT.app

# 4. 公证应用
xcrun notarytool submit release/OCT-0.1.0-Mac-x64.dmg \
  --apple-id "your@email.com" \
  --team-id "YOUR_TEAM_ID" \
  --password "app-specific-password"
```

---

## 📝 用户安装指南（Mac）

### 安装步骤

1. **下载 DMG 文件**
   - Intel Mac: `OCT-0.1.0-Mac-x64.dmg`
   - M1/M2 Mac: `OCT-0.1.0-Mac-arm64.dmg`

2. **打开 DMG**
   ```
   双击 OCT-0.1.0-Mac-x64.dmg
   ```

3. **拖拽到应用程序**
   ```
   把 OCT.app 拖到 Applications 文件夹
   ```

4. **首次运行**
   - 右键点击 OCT.app
   - 选择"打开"
   - 点击"仍然打开"

---

## ⚠️ Mac 安全提示处理

### 问题："无法打开，因为无法验证开发者"

**解决方法**：

```bash
# 方法 1：系统设置
系统设置 → 隐私与安全性 → 安全性
点击"仍然打开"

# 方法 2：命令行
xattr -d com.apple.quarantine /Applications/OCT.app

# 方法 3：右键打开
右键点击 OCT.app → 打开 → 仍然打开
```

---

## 🎯 快速发布到 GitHub

打包完成后，上传到 GitHub Release：

```bash
# 1. 打开 GitHub Release 页面
https://github.com/zl585451/openclaw-terminal/releases

# 2. 编辑 v0.1.0 或创建新版本

# 3. 上传 Mac 安装包
- OCT-0.1.0-Mac-x64.dmg
- OCT-0.1.0-Mac-arm64.dmg

# 4. 更新 Release 说明
## 🍎 Mac 版本
- Intel Mac: 下载 OCT-0.1.0-Mac-x64.dmg
- M1/M2 Mac: 下载 OCT-0.1.0-Mac-arm64.dmg
```

---

## 📊 版本对比

| 平台 | 安装包 | 大小 | 系统要求 |
|------|--------|------|---------|
| **Windows** | OCT-Setup-v0.1.0.exe | 107MB | Windows 10/11 |
| **Mac Intel** | OCT-0.1.0-Mac-x64.dmg | ~120MB | macOS 10.13+ |
| **Mac M1/M2** | OCT-0.1.0-Mac-arm64.dmg | ~120MB | macOS 11.0+ |

---

## 🚀 推荐方案

**最简单的方式**：

1. 使用 GitHub Actions 自动打包
2. 自动发布到 GitHub Release
3. 用户在 Release 页面下载对应版本

**需要 Mac 电脑吗？**
- ❌ 不需要！GitHub Actions 会帮你打包！

---

**作者**: 少爷 & AMY  
**日期**: 2026-03-11  
**版本**: v0.1.0

🦞 **OpenClaw Terminal** · 让电脑听懂你的话
