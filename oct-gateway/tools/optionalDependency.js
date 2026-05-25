const path = require('path');
const { createRequire } = require('module');

const OPTIONAL_TOOLS_PACKAGE = path.resolve(__dirname, '..', 'optional-tools', 'package.json');

let optionalToolsRequire = null;

function getOptionalToolsRequire() {
  if (optionalToolsRequire) return optionalToolsRequire;
  try {
    optionalToolsRequire = createRequire(OPTIONAL_TOOLS_PACKAGE);
  } catch {
    optionalToolsRequire = null;
  }
  return optionalToolsRequire;
}

function createMissingOptionalDependencyError(packageName, installName = packageName) {
  const error = new Error(
    `缺少可选工具依赖: ${packageName}。请在 oct-gateway/optional-tools 目录下执行 npm install ${installName}`
  );
  error.code = 'OCT_OPTIONAL_DEPENDENCY_MISSING';
  error.packageName = packageName;
  error.installName = installName;
  error.hint = `执行命令: cd oct-gateway/optional-tools && npm install ${installName}`;
  return error;
}

function loadOptionalDependency(packageName, options = {}) {
  const installName = options.installName || packageName;
  try {
    return require(packageName);
  } catch (primaryError) {
    const optionalRequire = getOptionalToolsRequire();
    if (optionalRequire) {
      try {
        return optionalRequire(packageName);
      } catch (optionalError) {
        if (optionalError?.code !== 'MODULE_NOT_FOUND') {
          throw optionalError;
        }
      }
    }
    if (primaryError?.code !== 'MODULE_NOT_FOUND') {
      throw primaryError;
    }
    throw createMissingOptionalDependencyError(packageName, installName);
  }
}

function formatMissingOptionalDependency(error) {
  if (error?.code !== 'OCT_OPTIONAL_DEPENDENCY_MISSING') return null;
  return {
    success: false,
    error: error.message,
    hint: error.hint,
    optionalDependency: error.packageName,
  };
}

module.exports = {
  loadOptionalDependency,
  formatMissingOptionalDependency,
};
