function sendResponse(connection, msg, { ok, payload, errorMessage }) {
  connection.send({
    type: 'res',
    id: msg.id,
    ok,
    method: msg.method,
    payload,
    error: ok ? undefined : { message: errorMessage },
  });
}

function createScriptAdapterMessageHandler({
  startIntake,
  startAnalysis,
  startProductionHandoff,
  startChapterPipelineRun,
  cancelChapterPipelineRun,
  listChapterPipelineRuns,
  startBatch,
  getBatchStatus,
  listBatches,
  cancelBatch,
  rerunChapter,
  deleteBatch,
  approveGate,
  rejectGate,
  applyReviewDecision,
  connectionRegistry,
  logger,
}) {
  return async function handleScriptAdapterMessage(msg, connection) {
    if (msg?.type !== 'req' || !String(msg?.method || '').startsWith('scriptAdapter.')) {
      return false;
    }

    if (msg.method === 'scriptAdapter.intake.start') {
      const result = await startIntake(msg.params || {}, connection, logger);
      sendResponse(connection, msg, {
        ok: Boolean(result.success),
        payload: result,
        errorMessage: result.error || 'intake failed',
      });
      return true;
    }

    if (msg.method === 'scriptAdapter.analysis.start') {
      const result = await startAnalysis(msg.params || {}, connection, logger);
      sendResponse(connection, msg, {
        ok: Boolean(result.success),
        payload: result,
        errorMessage: result.error || 'analysis failed',
      });
      return true;
    }

    if (msg.method === 'scriptAdapter.production.handoff') {
      const result = await startProductionHandoff(msg.params || {}, connection, logger);
      sendResponse(connection, msg, {
        ok: Boolean(result.success),
        payload: result,
        errorMessage: result.error || 'production handoff failed',
      });
      return true;
    }

    if (msg.method === 'scriptAdapter.run.start') {
      const run = startChapterPipelineRun(msg.params || {}, connection, logger);
      sendResponse(connection, msg, {
        ok: true,
        payload: {
          type: 'script-adapter-run-started',
          ...run,
        },
      });
      return true;
    }

    if (msg.method === 'scriptAdapter.run.cancel') {
      const result = cancelChapterPipelineRun(msg.params?.taskId, msg.params?.reason);
      sendResponse(connection, msg, {
        ok: Boolean(result.success),
        payload: {
          type: 'script-adapter-run-cancelled',
          ...result,
        },
        errorMessage: result.error || 'cancel failed',
      });
      return true;
    }

    if (msg.method === 'scriptAdapter.run.list') {
      sendResponse(connection, msg, {
        ok: true,
        payload: {
          type: 'script-adapter-run-list',
          runs: listChapterPipelineRuns(),
        },
      });
      return true;
    }

    if (msg.method === 'scriptAdapter.batch.start') {
      const result = await startBatch(msg.params || {}, connection, logger);
      sendResponse(connection, msg, {
        ok: Boolean(result.success),
        payload: result,
        errorMessage: result.error || 'batch start failed',
      });
      return true;
    }

    if (msg.method === 'scriptAdapter.batch.status') {
      const result = getBatchStatus(msg.params?.batchId);
      sendResponse(connection, msg, {
        ok: Boolean(result.success),
        payload: result,
        errorMessage: result.error || 'batch not found',
      });
      return true;
    }

    if (msg.method === 'scriptAdapter.batch.list') {
      const result = listBatches(msg.params || {});
      sendResponse(connection, msg, {
        ok: true,
        payload: result,
      });
      return true;
    }

    if (msg.method === 'scriptAdapter.batch.cancel') {
      const result = cancelBatch(msg.params?.batchId);
      sendResponse(connection, msg, {
        ok: Boolean(result.success),
        payload: result,
        errorMessage: result.error || 'batch cancel failed',
      });
      return true;
    }

    if (msg.method === 'scriptAdapter.batch.rerunChapter') {
      const result = rerunChapter(msg.params || {}, connection, logger);
      sendResponse(connection, msg, {
        ok: Boolean(result.success),
        payload: result,
        errorMessage: result.error || 'rerun failed',
      });
      return true;
    }

    if (msg.method === 'scriptAdapter.batch.delete') {
      const result = deleteBatch(msg.params?.batchId);
      sendResponse(connection, msg, {
        ok: Boolean(result.success),
        payload: result,
        errorMessage: result.error || 'delete failed',
      });
      return true;
    }

    if (msg.method === 'scriptAdapter.batch.subscribe') {
      const batchId = String(msg.params?.batchId || '').trim();
      if (batchId) {
        connectionRegistry.subscribe(batchId, connection);
      }
      sendResponse(connection, msg, {
        ok: Boolean(batchId),
        payload: {
          subscribed: Boolean(batchId),
          batchId,
        },
        errorMessage: 'batchId required',
      });
      return true;
    }

    if (msg.method === 'scriptAdapter.batch.approveGate') {
      const result = approveGate(msg.params || {}, connection, logger);
      sendResponse(connection, msg, {
        ok: Boolean(result.success),
        payload: result,
        errorMessage: result.error || 'approve gate failed',
      });
      return true;
    }

    if (msg.method === 'scriptAdapter.batch.rejectGate') {
      const result = rejectGate(msg.params || {}, connection, logger);
      sendResponse(connection, msg, {
        ok: Boolean(result.success),
        payload: result,
        errorMessage: result.error || 'reject gate failed',
      });
      return true;
    }

    if (msg.method === 'scriptAdapter.batch.applyReviewDecision') {
      const result = applyReviewDecision(msg.params || {}, connection, logger);
      sendResponse(connection, msg, {
        ok: Boolean(result.success),
        payload: result,
        errorMessage: result.error || 'apply review decision failed',
      });
      return true;
    }

    return false;
  };
}

module.exports = {
  createScriptAdapterMessageHandler,
};
