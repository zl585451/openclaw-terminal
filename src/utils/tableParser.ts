/**
 * 表格解析工具 - 用于流式阶段提前识别并渲染 Markdown 表格
 * 避免流式结束后切换到 ReactMarkdown 时布局突变导致跳动
 */

/** 检查一行是否是 Markdown 表格行 */
function isTableRow(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed.startsWith('|') || !trimmed.endsWith('|')) return false;
  return trimmed.split('|').filter((s) => s.length > 0).length >= 2;
}

/** 检查是否为 Markdown 表格分隔符行（如 |------|------| 或 |:-----|:----:|） */
function isTableSeparator(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed.startsWith('|') || !trimmed.endsWith('|')) return false;
  const cells = trimmed.slice(1, -1).split('|');
  if (cells.length < 2) return false;
  return cells.every((cell) => {
    const c = cell.trim();
    return /^:?[-]+:?$/g.test(c);
  });
}

export interface TableParseResult {
  /** 是否是表格 */
  isTable: boolean;
  /** 表格行数据（每行是单元格数组） */
  rows: string[][];
  /** 表头行数（通常为 1，包含分隔符行则为 2） */
  headerCount: number;
  /** 表格是否完整（有表头 + 分隔符 + 至少一行数据） */
  isComplete: boolean;
}

/**
 * 从文本中识别并解析 Markdown 表格
 * @param text - 流式输出的文本片段
 */
export function parseTableFromText(text: string): TableParseResult {
  if (!text || typeof text !== 'string') {
    return { isTable: false, rows: [], headerCount: 0, isComplete: false };
  }

  const lines = text.split('\n');
  if (lines.length === 0) {
    return { isTable: false, rows: [], headerCount: 0, isComplete: false };
  }

  // 查找表格区域（连续的表格行）
  const tableRows: string[][] = [];
  let separatorIndex = -1;
  let foundTableStart = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const trimmed = line.trim();

    if (isTableRow(line)) {
      foundTableStart = true;
      if (isTableSeparator(line)) {
        separatorIndex = tableRows.length;
        // 分隔符行不加入数据，只标记位置
      } else {
        const cells = line
          .slice(1, -1)
          .split('|')
          .map((cell) => cell.trim());
        tableRows.push(cells);
      }
    } else if (foundTableStart && trimmed.length > 0) {
      // 遇到非表格行且不是空行，停止解析
      break;
    }
    // 空行继续（可能表格还没结束）
  }

  // 只要有至少一行表格数据就认为是表格（流式阶段可能只有表头）
  if (tableRows.length < 1) {
    return { isTable: false, rows: [], headerCount: 0, isComplete: false };
  }

  // 分隔符应该在第 1 行（表头之后）
  const hasSeparator = separatorIndex === 1;
  const isComplete = hasSeparator && tableRows.length >= 2;

  return {
    isTable: true,
    rows: tableRows,
    headerCount: hasSeparator ? 1 : 0,
    isComplete,
  };
}
