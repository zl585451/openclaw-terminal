/**
 * 工具层适配器：供 index.js 使用 setOnTaskBoardUpdate
 * 工具定义与执行已迁移至 tool_loader + tools/*.js
 */
const toolLoader = require('./tool_loader');

module.exports = {
  setOnTaskBoardUpdate: toolLoader.setOnTaskBoardUpdate,
};
