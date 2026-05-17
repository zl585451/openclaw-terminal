async function checkMemoryHealth({ memory, logger }) {
  try {
    const alive = await memory.isAlive();
    if (!alive) {
      logger.warn('memory backend unavailable, memory features degraded');
      return;
    }

    const coreUris = [
      'core://agent/identity',
      'core://my_user/profile',
      'core://agent/rules/output_format',
      'core://my_user/preferences',
      'core://my_user/communication',
      'core://project/oct/status',
      'core://project/oct/decisions',
    ];

    const missing = [];
    for (const uri of coreUris) {
      const result = await memory.readMemory(uri, { treat404AsDebug: true });
      const content = result.data?.node?.content || result.data?.content || '';
      if (!result.ok || !content) missing.push(uri);
    }

    if (missing.length === 0) {
      logger.info('Core memory health ok', { total: coreUris.length });
    } else {
      logger.warn('Core memory missing', { missing });
    }
  } catch (e) {
    logger.warn('Memory health check failed', { error: e?.message || String(e) });
  }
}

function scheduleMemoryHealthCheck({ memory, logger, startupDelayMs = 3000 }) {
  setTimeout(() => {
    checkMemoryHealth({ memory, logger });
  }, startupDelayMs);
}

module.exports = {
  checkMemoryHealth,
  scheduleMemoryHealthCheck,
};
