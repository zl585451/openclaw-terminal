#!/usr/bin/env node

/**
 * OCT File Operations MCP Server
 * 
 * 为 OpenClaw Gateway 提供本地文件操作能力
 * Tools: file_list, file_move, file_rename, file_delete
 * 
 * 安全机制:
 * - 路径白名单 (ALLOWED_ROOTS)，禁止操作系统目录
 * - 所有路径解析后必须在白名单内
 * - 删除操作默认移到回收站（可配置）
 * - 操作日志记录
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import fs from "fs/promises";
import path from "path";
import os from "os";

// ============================================================
// 配置
// ============================================================

const DEFAULT_ALLOWED_ROOTS = [
  path.join(os.homedir(), "Desktop"),
  path.join(os.homedir(), "Documents"),
  path.join(os.homedir(), "Downloads"),
  path.join(os.homedir(), "Pictures"),
  path.join(os.homedir(), "Videos"),
  path.join(os.homedir(), "Music"),
];

/**
 * 高权限开关（危险）：
 * - "1"/"true"/"yes"/"on" 时允许访问任意目录
 * - 默认关闭，仅允许白名单目录
 */
const UNSAFE_ALLOW_ALL =
  String(process.env.OCT_FILE_OPS_UNSAFE_ALLOW_ALL || "").toLowerCase() === "1" ||
  String(process.env.OCT_FILE_OPS_UNSAFE_ALLOW_ALL || "").toLowerCase() === "true" ||
  String(process.env.OCT_FILE_OPS_UNSAFE_ALLOW_ALL || "").toLowerCase() === "yes" ||
  String(process.env.OCT_FILE_OPS_UNSAFE_ALLOW_ALL || "").toLowerCase() === "on";

/**
 * 可选追加白名单目录（分号分隔），例：
 * OCT_FILE_OPS_ALLOWED_ROOTS=D:\work;E:\datasets
 */
const EXTRA_ALLOWED_ROOTS = String(process.env.OCT_FILE_OPS_ALLOWED_ROOTS || "")
  .split(";")
  .map((item) => item.trim())
  .filter(Boolean)
  .map((item) => path.resolve(item));

const ALLOWED_ROOTS = Array.from(
  new Set([...DEFAULT_ALLOWED_ROOTS.map((p) => path.resolve(p)), ...EXTRA_ALLOWED_ROOTS])
);

// 回收站目录（删除时移到这里，而不是真删）
const TRASH_DIR = path.join(os.homedir(), ".oct-trash");

// ============================================================
// 安全工具
// ============================================================

/**
 * 验证路径是否在白名单目录内
 */
function validatePath(targetPath) {
  const resolved = path.resolve(targetPath);
  if (UNSAFE_ALLOW_ALL) {
    return resolved;
  }
  const isAllowed = ALLOWED_ROOTS.some(
    (root) => resolved === root || resolved.startsWith(root + path.sep)
  );
  if (!isAllowed) {
    throw new Error(
      `路径不在允许范围内: ${resolved}\n允许的目录: ${ALLOWED_ROOTS.join(", ")}`
    );
  }
  return resolved;
}

/**
 * 确保目录存在
 */
async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

/**
 * 记录操作日志
 */
async function logOperation(operation, details) {
  const logDir = path.join(os.homedir(), ".oct-logs");
  await ensureDir(logDir);
  const logFile = path.join(logDir, "file-ops.log");
  const timestamp = new Date().toISOString();
  const entry = `[${timestamp}] ${operation}: ${JSON.stringify(details)}\n`;
  await fs.appendFile(logFile, entry, "utf-8");
}

// ============================================================
// Tool 实现
// ============================================================

/**
 * file_list - 列出目录内容
 */
async function fileList({ dir_path, recursive = false, filter_ext }) {
  const resolvedPath = validatePath(dir_path);

  const stat = await fs.stat(resolvedPath);
  if (!stat.isDirectory()) {
    throw new Error(`不是目录: ${resolvedPath}`);
  }

  const entries = await fs.readdir(resolvedPath, { withFileTypes: true });
  const results = [];

  for (const entry of entries) {
    // 跳过隐藏文件
    if (entry.name.startsWith(".")) continue;

    const fullPath = path.join(resolvedPath, entry.name);
    const entryStat = await fs.stat(fullPath);
    const ext = path.extname(entry.name).toLowerCase();

    // 扩展名过滤
    if (filter_ext && entry.isFile()) {
      const filters = filter_ext.split(",").map((e) => e.trim().toLowerCase());
      if (!filters.some((f) => ext === f || ext === `.${f}`)) continue;
    }

    const item = {
      name: entry.name,
      path: fullPath,
      type: entry.isDirectory() ? "directory" : "file",
      size: entryStat.size,
      modified: entryStat.mtime.toISOString(),
      extension: ext || null,
    };

    results.push(item);

    // 递归子目录
    if (recursive && entry.isDirectory()) {
      try {
        const subItems = await fileList({
          dir_path: fullPath,
          recursive: true,
          filter_ext,
        });
        results.push(...JSON.parse(subItems).items);
      } catch {
        // 权限不足等情况，跳过
      }
    }
  }

  // 按类型排序：目录在前，文件在后
  results.sort((a, b) => {
    if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return JSON.stringify({ dir: resolvedPath, count: results.length, items: results }, null, 2);
}

/**
 * file_move - 移动文件/目录
 */
async function fileMove({ source, destination, create_dirs = true }) {
  const resolvedSource = validatePath(source);
  const resolvedDest = validatePath(destination);

  // 检查源是否存在
  await fs.access(resolvedSource);

  // 如果目标是已存在的目录，移入该目录
  let finalDest = resolvedDest;
  try {
    const destStat = await fs.stat(resolvedDest);
    if (destStat.isDirectory()) {
      finalDest = path.join(resolvedDest, path.basename(resolvedSource));
    }
  } catch {
    // 目标不存在，使用原始路径
  }

  // 检查目标是否已存在
  try {
    await fs.access(finalDest);
    throw new Error(`目标已存在: ${finalDest}`);
  } catch (e) {
    if (e.message.startsWith("目标已存在")) throw e;
    // ENOENT = 目标不存在，正常继续
  }

  // 创建目标目录
  if (create_dirs) {
    await ensureDir(path.dirname(finalDest));
  }

  await fs.rename(resolvedSource, finalDest);
  await logOperation("MOVE", { from: resolvedSource, to: finalDest });

  return JSON.stringify({
    success: true,
    from: resolvedSource,
    to: finalDest,
  });
}

/**
 * file_rename - 重命名文件/目录
 */
async function fileRename({ file_path, new_name }) {
  const resolvedPath = validatePath(file_path);

  // new_name 不能包含路径分隔符
  if (new_name.includes("/") || new_name.includes("\\")) {
    throw new Error("新名称不能包含路径分隔符，如需移动请用 file_move");
  }

  // 检查源是否存在
  await fs.access(resolvedPath);

  const newPath = path.join(path.dirname(resolvedPath), new_name);

  // 检查目标是否已存在
  try {
    await fs.access(newPath);
    throw new Error(`目标已存在: ${newPath}`);
  } catch (e) {
    if (e.message.startsWith("目标已存在")) throw e;
  }

  await fs.rename(resolvedPath, newPath);
  await logOperation("RENAME", { from: resolvedPath, to: newPath });

  return JSON.stringify({
    success: true,
    from: resolvedPath,
    to: newPath,
  });
}

/**
 * file_delete - 删除文件/目录（默认移到回收站）
 */
async function fileDelete({ file_path, permanent = false }) {
  const resolvedPath = validatePath(file_path);

  // 检查源是否存在
  const stat = await fs.stat(resolvedPath);

  if (permanent) {
    // 真删
    if (stat.isDirectory()) {
      await fs.rm(resolvedPath, { recursive: true });
    } else {
      await fs.unlink(resolvedPath);
    }
    await logOperation("DELETE_PERMANENT", { path: resolvedPath });

    return JSON.stringify({
      success: true,
      path: resolvedPath,
      action: "permanently_deleted",
    });
  } else {
    // 移到回收站
    await ensureDir(TRASH_DIR);
    const timestamp = Date.now();
    const trashName = `${timestamp}_${path.basename(resolvedPath)}`;
    const trashPath = path.join(TRASH_DIR, trashName);

    await fs.rename(resolvedPath, trashPath);
    await logOperation("DELETE_TO_TRASH", {
      from: resolvedPath,
      trash: trashPath,
    });

    return JSON.stringify({
      success: true,
      path: resolvedPath,
      action: "moved_to_trash",
      trash_path: trashPath,
      restore_hint: `如需恢复，将 ${trashPath} 移回原位置`,
    });
  }
}

// ============================================================
// MCP Server 定义
// ============================================================

const server = new Server(
  {
    name: "oct-file-ops",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// 注册 tools 列表
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "file_list",
        description:
          "列出指定目录的内容，返回文件名、大小、修改时间、类型。支持递归和扩展名过滤。",
        inputSchema: {
          type: "object",
          properties: {
            dir_path: {
              type: "string",
              description: "要列出的目录路径",
            },
            recursive: {
              type: "boolean",
              description: "是否递归列出子目录内容，默认 false",
              default: false,
            },
            filter_ext: {
              type: "string",
              description:
                '按扩展名过滤，逗号分隔，如 ".pdf,.docx" 或 "pdf,docx"',
            },
          },
          required: ["dir_path"],
        },
      },
      {
        name: "file_move",
        description:
          "移动文件或目录到新位置。如果目标是已存在的目录，会移入该目录。自动创建目标目录。",
        inputSchema: {
          type: "object",
          properties: {
            source: {
              type: "string",
              description: "源文件/目录路径",
            },
            destination: {
              type: "string",
              description: "目标路径",
            },
            create_dirs: {
              type: "boolean",
              description: "是否自动创建目标目录，默认 true",
              default: true,
            },
          },
          required: ["source", "destination"],
        },
      },
      {
        name: "file_rename",
        description:
          "重命名文件或目录（仅改名，不移动位置）。新名称不能包含路径分隔符。",
        inputSchema: {
          type: "object",
          properties: {
            file_path: {
              type: "string",
              description: "要重命名的文件/目录路径",
            },
            new_name: {
              type: "string",
              description: "新名称（仅文件名，不含路径）",
            },
          },
          required: ["file_path", "new_name"],
        },
      },
      {
        name: "file_delete",
        description:
          "删除文件或目录。默认移到回收站（~/.oct-trash），可选永久删除。",
        inputSchema: {
          type: "object",
          properties: {
            file_path: {
              type: "string",
              description: "要删除的文件/目录路径",
            },
            permanent: {
              type: "boolean",
              description: "是否永久删除（不可恢复），默认 false（移到回收站）",
              default: false,
            },
          },
          required: ["file_path"],
        },
      },
    ],
  };
});

// 处理 tool 调用
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    let result;

    switch (name) {
      case "file_list":
        result = await fileList(args);
        break;
      case "file_move":
        result = await fileMove(args);
        break;
      case "file_rename":
        result = await fileRename(args);
        break;
      case "file_delete":
        result = await fileDelete(args);
        break;
      default:
        throw new Error(`未知工具: ${name}`);
    }

    return {
      content: [{ type: "text", text: result }],
    };
  } catch (error) {
    return {
      content: [{ type: "text", text: `错误: ${error.message}` }],
      isError: true,
    };
  }
});

// ============================================================
// 启动
// ============================================================

async function main() {
  console.error(
    `[oct-file-ops] access mode=${UNSAFE_ALLOW_ALL ? "UNSAFE_ALLOW_ALL" : "WHITELIST"}, allowedRoots=${ALLOWED_ROOTS.join(
      "; "
    )}`
  );
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[oct-file-ops] MCP Server 已启动");
}

main().catch((error) => {
  console.error("[oct-file-ops] 启动失败:", error);
  process.exit(1);
});
