const assert = require('assert');
const webSearch = require('../tools/web_search');
const parallelWebResearch = require('../tools/parallel_web_research');

async function withMockedWebSearch(mock, fn) {
  const original = webSearch.execute;
  webSearch.execute = mock;
  try {
    await fn();
  } finally {
    webSearch.execute = original;
  }
}

async function testWeakParallelResultsExposeStopGuidance() {
  await withMockedWebSearch(async ({ query }) => ({
    success: true,
    searchQuality: { level: 'empty', resultCount: 0, reason: '未找到相关结果' },
    data: { engine: 'mock', query, results: [] },
    message: `搜索退级警告: ${query}`,
    hint: '未找到结果',
  }), async () => {
    const result = await parallelWebResearch.execute({
      queries: ['very obscure topic a', 'very obscure topic b'],
      count: 3,
    });

    assert.equal(result.success, true);
    assert.equal(result.searchQuality.level, 'empty');
    assert.equal(result.parallelSearchSummary.totalResultsReturned, 0);
    assert.equal(result.parallelSearchSummary.weakQueries, 2);
    assert.match(result.message, /并行搜索结果不足/);
    assert.match(result.message, /不要在没有新关键词或新线索时继续重复/);
    assert.match(result.hint, /不要空转/);
  });
}

async function testRichParallelResultsKeepStructuredJson() {
  await withMockedWebSearch(async ({ query }) => ({
    success: true,
    searchQuality: { level: 'rich', resultCount: 3, reason: '找到 3 条较完整结果' },
    data: {
      engine: 'mock',
      query,
      results: [
        { title: `${query} 1`, url: 'https://example.test/1', snippet: 'A useful result with enough detail.' },
        { title: `${query} 2`, url: 'https://example.test/2', snippet: 'Another useful result with enough detail.' },
        { title: `${query} 3`, url: 'https://example.test/3', snippet: 'A third useful result with enough detail.' },
      ],
    },
  }), async () => {
    const result = await parallelWebResearch.execute({
      queries: ['ai policy', 'ai product'],
      count: 3,
    });

    assert.equal(result.success, true);
    assert.equal(result.searchQuality.level, 'rich');
    assert.equal(result.parallelSearchSummary.totalResultsReturned, 6);
    assert.equal(Object.prototype.hasOwnProperty.call(result, 'message'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(result, 'hint'), false);
  });
}

(async () => {
  await testWeakParallelResultsExposeStopGuidance();
  await testRichParallelResultsKeepStructuredJson();
  console.log('PASS parallel_web_research downgrade guidance');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
