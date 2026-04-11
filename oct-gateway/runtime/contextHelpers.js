function extractMemorySearchTerms(text) {
  const source = String(text || '').trim();
  if (!source) return [];

  const terms = [];
  const quoted = source.match(/["“”'‘’]([^"'“”‘’]{2,40})["“”'‘’]/g) || [];
  for (const token of quoted) {
    terms.push(token.replace(/["“”'‘’]/g, '').trim());
  }

  const enWords = source.match(/[a-zA-Z][a-zA-Z0-9_\-\.]{2,}/g) || [];
  terms.push(...enWords.slice(0, 5));

  const zhWords = source.match(/[\u4e00-\u9fa5]{2,8}/g) || [];
  terms.push(...zhWords.slice(0, 6));

  return [...new Set(terms.map((item) => item.trim()).filter(Boolean))];
}

function hasRecallIntent(text) {
  return /(还记得|记不记得|之前说过|之前那个|上次|刚才那个|那个方案|那个链路|前面聊过|以前提过|之前提过|我们前面|你记得吗)/.test(String(text || ''));
}

function isProjectAnalysisRequest(text) {
  return /(gateway|oct-gateway|前端|后端|ui|界面|canvas|架构|耦合|模块|链路|流程图|线路图|结构图|代码|文件|目录|hook|hooks|组件|context|contexts|streamrouter|turnfsm|messagelist|chattab|memory|orchestrator|index\.js|\.tsx|\.ts|\.js)/i.test(String(text || ''));
}

module.exports = {
  extractMemorySearchTerms,
  hasRecallIntent,
  isProjectAnalysisRequest,
};
