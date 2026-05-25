/**
 * read_document — 二进制文档解析工具
 *
 * 支持格式：.docx, .xlsx, .xls, .csv, .pdf
 * 可选依赖：mammoth (docx), xlsx (Excel), pdf-parse (PDF)
 *
 * 安装依赖（在 oct-gateway/optional-tools 目录下）：
 *   npm install mammoth xlsx pdf-parse
 *
 * 放置位置：oct-gateway/tools/read_document.js
 * 重启 Gateway 后自动加载。
 */

const fs = require('fs');
const path = require('path');
const { createLogger } = require('../logger');
const { loadOptionalDependency, formatMissingOptionalDependency } = require('./optionalDependency');

const log = createLogger('tool:read_document');

// ── 支持的格式 ──────────────────────────────────────────

const SUPPORTED_EXTS = new Set(['.docx', '.xlsx', '.xls', '.csv', '.pdf']);

const MAX_TEXT_LENGTH = 30000; // 返回给 AI 的最大字符数，防止上下文爆炸

// ── 解析器 ──────────────────────────────────────────────

/**
 * .docx → 纯文本（mammoth）
 */
async function parseDocx(filePath) {
  const mammoth = loadOptionalDependency('mammoth');
  const buf = fs.readFileSync(filePath);

  // 先提取纯文本（结构清晰，token 效率高）
  const textResult = await mammoth.extractRawText({ buffer: buf });
  const text = (textResult.value || '').trim();

  if (!text) {
    // 降级：提取为 Markdown 格式（保留标题、列表等结构）
    const mdResult = await mammoth.convertToMarkdown({ buffer: buf });
    return {
      content: (mdResult.value || '').trim(),
      format: 'markdown',
      warnings: mdResult.messages.map(m => m.message),
    };
  }

  return {
    content: text,
    format: 'text',
    warnings: textResult.messages.map(m => m.message),
  };
}

/**
 * .xlsx / .xls → Markdown 表格 或 JSON
 */
async function parseExcel(filePath, opts = {}) {
  const XLSX = loadOptionalDependency('xlsx');
  const workbook = XLSX.readFile(filePath, { type: 'file' });
  const sheetNames = workbook.SheetNames;

  if (!sheetNames.length) {
    return { content: '（空的 Excel 文件，没有工作表）', format: 'text', warnings: [] };
  }

  // 目标 sheet：用户可以指定，默认取第一个
  const targetSheet = opts.sheet || sheetNames[0];
  const sheetIndex = sheetNames.indexOf(targetSheet);
  const sheet = workbook.Sheets[sheetNames[sheetIndex >= 0 ? sheetIndex : 0]];

  if (!sheet) {
    return { content: '（工作表为空）', format: 'text', warnings: [] };
  }

  // 转成 JSON 数组
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  if (!rows.length) {
    return { content: '（工作表没有数据）', format: 'text', warnings: [] };
  }

  // 生成 Markdown 表格（AI 更容易理解）
  const mdLines = [];

  // 表头
  const header = rows[0].map(cell => String(cell).replace(/\|/g, '\\|'));
  mdLines.push('| ' + header.join(' | ') + ' |');
  mdLines.push('| ' + header.map(() => '---').join(' | ') + ' |');

  // 数据行（限制最多 200 行，避免 token 爆炸）
  const maxRows = Math.min(rows.length, 201);
  for (let i = 1; i < maxRows; i++) {
    const row = rows[i].map(cell => String(cell).replace(/\|/g, '\\|').replace(/\n/g, ' '));
    mdLines.push('| ' + row.join(' | ') + ' |');
  }

  const truncated = rows.length > 201;
  let content = mdLines.join('\n');
  if (truncated) {
    content += `\n\n（共 ${rows.length - 1} 行数据，仅展示前 200 行）`;
  }

  // 附上 sheet 列表信息
  const sheetInfo = sheetNames.length > 1
    ? `\n\n📊 该文件包含 ${sheetNames.length} 个工作表：${sheetNames.join('、')}（当前显示：${sheetNames[sheetIndex >= 0 ? sheetIndex : 0]}）`
    : '';

  return {
    content: content + sheetInfo,
    format: 'markdown-table',
    sheetNames,
    activeSheet: sheetNames[sheetIndex >= 0 ? sheetIndex : 0],
    totalRows: rows.length - 1,
    warnings: truncated ? [`数据量较大（${rows.length - 1} 行），已截取前 200 行`] : [],
  };
}

/**
 * .csv → Markdown 表格
 */
async function parseCsv(filePath) {
  const raw = fs.readFileSync(filePath, 'utf-8');
  if (!raw.trim()) {
    return { content: '（空的 CSV 文件）', format: 'text', warnings: [] };
  }

  // 简单 CSV 解析（不处理引号内逗号的复杂场景，用 xlsx 库作为后备）
  try {
    const XLSX = loadOptionalDependency('xlsx');
    const workbook = XLSX.read(raw, { type: 'string' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

    if (!rows.length) {
      return { content: '（CSV 文件没有数据）', format: 'text', warnings: [] };
    }

    const mdLines = [];
    const header = rows[0].map(cell => String(cell).replace(/\|/g, '\\|'));
    mdLines.push('| ' + header.join(' | ') + ' |');
    mdLines.push('| ' + header.map(() => '---').join(' | ') + ' |');

    const maxRows = Math.min(rows.length, 201);
    for (let i = 1; i < maxRows; i++) {
      const row = rows[i].map(cell => String(cell).replace(/\|/g, '\\|').replace(/\n/g, ' '));
      mdLines.push('| ' + row.join(' | ') + ' |');
    }

    let content = mdLines.join('\n');
    if (rows.length > 201) {
      content += `\n\n（共 ${rows.length - 1} 行数据，仅展示前 200 行）`;
    }

    return { content, format: 'markdown-table', warnings: [] };
  } catch (e) {
    // 降级：直接返回原文
    const sliced = raw.slice(0, MAX_TEXT_LENGTH);
    return {
      content: sliced,
      format: 'raw-csv',
      warnings: raw.length > MAX_TEXT_LENGTH ? ['CSV 内容过长，已截取前部分'] : [],
    };
  }
}

/**
 * .pdf → 纯文本（pdf-parse）
 */
async function parsePdf(filePath) {
  const pdfParse = loadOptionalDependency('pdf-parse');
  const buf = fs.readFileSync(filePath);
  const data = await pdfParse(buf);
  const text = (data.text || '').trim();

  return {
    content: text || '（PDF 未提取到文本内容，可能是扫描件/纯图片 PDF）',
    format: 'text',
    pages: data.numpages,
    warnings: !text ? ['该 PDF 可能是扫描件，建议使用图片识别功能'] : [],
  };
}

// ── 主入口 ──────────────────────────────────────────────

module.exports = {
  name: 'read_document',
  category: 'project',
  riskLevel: 'safe',
  displayName: '读取文档',
  definition: {
    type: 'function',
    function: {
      name: 'read_document',
      description: [
        '读取二进制文档并提取文本内容。',
        '支持格式：.docx（Word）、.xlsx/.xls（Excel）、.csv、.pdf。',
        '注意：纯文本文件（.txt/.md/.json/.js 等）请使用 read_file 工具，不要用本工具。',
        '用户上传 .docx/.xlsx/.pdf 文件时，请优先使用本工具读取，而不是 read_file。',
      ].join(' '),
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: '文件路径（绝对路径或项目相对路径）',
          },
          sheet: {
            type: 'string',
            description: '（可选）Excel 文件要读取的工作表名称，默认读取第一个工作表',
          },
        },
        required: ['path'],
      },
    },
  },

  execute: async (args) => {
    const rawPath = String(args.path || '').trim();
    if (!rawPath) {
      return {
        success: false,
        error: 'path 不能为空',
        hint: '请提供文档文件路径，例如 E:\\Documents\\report.docx',
      };
    }

    // 路径解析（与 read_file 保持一致的逻辑）
    const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
    const resolvedPath = path.isAbsolute(rawPath)
      ? path.normalize(rawPath)
      : path.resolve(PROJECT_ROOT, rawPath);

    if (!fs.existsSync(resolvedPath)) {
      return {
        success: false,
        error: `文件不存在: ${resolvedPath}`,
        hint: '确认路径是否正确。',
        path: resolvedPath,
      };
    }

    const ext = path.extname(resolvedPath).toLowerCase();
    if (!SUPPORTED_EXTS.has(ext)) {
      return {
        success: false,
        error: `不支持的格式: ${ext}`,
        hint: `本工具支持 ${[...SUPPORTED_EXTS].join('、')}。纯文本文件请使用 read_file。`,
        path: resolvedPath,
      };
    }

    try {
      let result;

      switch (ext) {
        case '.docx':
          result = await parseDocx(resolvedPath);
          break;
        case '.xlsx':
        case '.xls':
          result = await parseExcel(resolvedPath, { sheet: args.sheet });
          break;
        case '.csv':
          result = await parseCsv(resolvedPath);
          break;
        case '.pdf':
          result = await parsePdf(resolvedPath);
          break;
        default:
          return { success: false, error: `未知格式: ${ext}` };
      }

      // 截断保护
      let content = result.content || '';
      let truncated = false;
      if (content.length > MAX_TEXT_LENGTH) {
        content = content.slice(0, MAX_TEXT_LENGTH);
        truncated = true;
      }

      const fileName = path.basename(resolvedPath);
      log.info('document parsed', {
        file: fileName,
        ext,
        format: result.format,
        contentLength: content.length,
        truncated,
      });

      return {
        success: true,
        data: {
          path: resolvedPath,
          fileName,
          ext,
          format: result.format,
          content,
          truncated,
          ...(result.pages != null ? { pages: result.pages } : {}),
          ...(result.sheetNames ? { sheetNames: result.sheetNames } : {}),
          ...(result.activeSheet ? { activeSheet: result.activeSheet } : {}),
          ...(result.totalRows != null ? { totalRows: result.totalRows } : {}),
        },
        error: null,
        content, // 顶层冗余，兼容 AMY 旧版读取习惯
        warnings: [
          ...(result.warnings || []),
          ...(truncated ? [`内容超长（${result.content.length} 字符），已截取前 ${MAX_TEXT_LENGTH} 字符`] : []),
        ],
      };
    } catch (e) {
      log.error('document parse failed', { path: resolvedPath, ext, error: e?.message });

      // 区分「依赖未安装」和「文件本身有问题」
      const msg = e?.message || String(e);
      const missingOptionalDependency = formatMissingOptionalDependency(e);
      if (missingOptionalDependency) {
        return {
          ...missingOptionalDependency,
          path: resolvedPath,
        };
      }

      return {
        success: false,
        error: `解析失败: ${msg}`,
        hint: '文件可能已损坏或格式不标准，请确认文件可用。',
        path: resolvedPath,
      };
    }
  },
};
