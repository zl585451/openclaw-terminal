# OCR功能依赖安装指南

## 1. 安装Poppler（必需）

pdf2image需要Poppler才能将PDF转换为图像。

### Windows安装步骤：

1. 下载Poppler
   - 官网下载：https://github.com/oschwartz10612/poppler-windows/releases
   - 下载最新版：`poppler-xx.xx.0-0.zip`

2. 解压并配置
   ```powershell
   # 解压到固定目录，例如：
   C:\poppler\

   # 添加到系统PATH环境变量
   # 控制面板 → 系统 → 高级系统设置 → 环境变量
   # 在系统变量Path中添加：C:\poppler\Library\bin
   ```

3. 验证安装
   ```powershell
   pdfinfo -v
   ```

## 2. 可选：安装Tesseract OCR

如果需要使用Tesseract作为备用引擎：

1. 下载Tesseract
   - 官网下载：https://github.com/UB-Mannheim/tesseract/wiki
   - 下载：`tesseract-ocr-w64-setup-5.xx.exe`

2. 安装中文语言包
   - 下载：`chi_sim.traineddata`
   - 放到安装目录的`tessdata`文件夹

## 3. 测试OCR功能

安装Poppler后运行：

```bash
# 智能OCR模式（推荐）
python audio_knowledge_base.py --docs-dir "./documents/test" --force-ocr --ocr-mode smart --save-ocr-stats

# 全免费模式
python audio_knowledge_base.py --docs-dir "./documents/test" --force-ocr --ocr-mode paddle_only

# 全API模式
python audio_knowledge_base.py --docs-dir "./documents/test" --force-ocr --ocr-mode deepseek_only
```

## 4. 查看OCR统计

```bash
cat ./data/ocr_stats.json
```

## 快速安装Poppler（推荐）

使用Chocolatey一键安装：

```powershell
# 安装Chocolatey（如果没有）
Set-ExecutionPolicy Bypass -Scope Process -Force; [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072; iex ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))

# 安装Poppler
choco install poppler
```
