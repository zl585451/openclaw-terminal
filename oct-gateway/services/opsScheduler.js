function scheduleNocturneHeartbeat({ config, memory, nocturneQueue, logger }) {
  const heartbeatIntervalMs = (config.nocturne?.heartbeat_interval_seconds ?? 300) * 1000;
  setInterval(async () => {
    try {
      const alive = await memory.isAlive();
      if (alive) {
        nocturneQueue.invalidateHealthCache();
        logger.info('Nocturne 心跳正常');
      } else {
        logger.warn('Nocturne 心跳检查：离线，记忆操作降级');
      }
    } catch (e) {
      logger.warn('Nocturne 心跳检查失败', { error: e?.message || String(e) });
    }
  }, heartbeatIntervalMs);
}

function scheduleReviewQueueMaintenance({ nocturneQueue, reviewQueueMaintenance, logger }) {
  const enabled = process.env.OCT_REVIEW_QUEUE_MAINTENANCE_ENABLED !== '0';
  const intervalMs = Number(process.env.OCT_REVIEW_QUEUE_MAINTENANCE_INTERVAL_MS || 6 * 60 * 60 * 1000);
  const startupDelayMs = Number(process.env.OCT_REVIEW_QUEUE_MAINTENANCE_STARTUP_DELAY_MS || 10 * 60 * 1000);
  const dryRun = process.env.OCT_REVIEW_QUEUE_MAINTENANCE_DRY_RUN === '1';

  if (!enabled) {
    logger.info('Review queue maintenance disabled');
    return;
  }

  const runMaintenance = () => {
    nocturneQueue.enqueue(async () => {
      const healthy = await nocturneQueue.isNocturneHealthy();
      if (!healthy) {
        logger.debug('Skip review queue maintenance: Nocturne offline');
        return;
      }

      const report = await reviewQueueMaintenance.expireStaleReviewCandidates({ dryRun });
      logger.debug('Review queue maintenance finished', {
        scanned: report.scanned,
        expired: report.expired,
        updated: report.updated.length,
        failed: report.failed.length,
        dryRun: report.dryRun,
      });
    }, 'reviewQueueMaintenance');
  };

  setTimeout(runMaintenance, startupDelayMs);
  setInterval(runMaintenance, intervalMs);

  logger.debug('Review queue maintenance scheduled', {
    intervalMs,
    startupDelayMs,
    dryRun,
  });
}

function scheduleMemoryGovernanceReport({ nocturneQueue, memoryManagementAgent, logger }) {
  const enabled = process.env.OCT_MEMORY_GOVERNANCE_REPORT_ENABLED !== '0';
  const intervalMs = Number(process.env.OCT_MEMORY_GOVERNANCE_REPORT_INTERVAL_MS || 12 * 60 * 60 * 1000);
  const startupDelayMs = Number(process.env.OCT_MEMORY_GOVERNANCE_REPORT_STARTUP_DELAY_MS || 15 * 60 * 1000);

  if (!enabled) {
    logger.info('Memory governance report disabled');
    return;
  }

  const runReport = () => {
    nocturneQueue.enqueue(async () => {
      const healthy = await nocturneQueue.isNocturneHealthy();
      if (!healthy) {
        logger.debug('Skip memory governance report: Nocturne offline');
        return;
      }
      await memoryManagementAgent.runMemoryGovernancePass();
    }, 'memoryGovernanceReport');
  };

  setTimeout(runReport, startupDelayMs);
  setInterval(runReport, intervalMs);

  logger.debug('Memory governance report scheduled', {
    intervalMs,
    startupDelayMs,
  });
}

function startMemoryMonitor({ logger }) {
  const intervalMs = Number(process.env.OCT_MEM_MON_INTERVAL_MS || 5 * 60 * 1000);
  const warnRssMb = Number(process.env.OCT_MEM_WARN_RSS_MB || 500);

  setInterval(() => {
    const usage = process.memoryUsage();
    const rss = (usage.rss / 1024 / 1024).toFixed(1);
    const heap = (usage.heapUsed / 1024 / 1024).toFixed(1);
    const heapTotal = (usage.heapTotal / 1024 / 1024).toFixed(1);

    logger.info(`RSS=${rss}MB | Heap=${heap}/${heapTotal}MB`, {
      rssMb: Number(rss),
      heapUsedMb: Number(heap),
      heapTotalMb: Number(heapTotal),
      externalMb: Number((usage.external / 1024 / 1024).toFixed(1)),
      arrayBuffersMb: Number(((usage.arrayBuffers || 0) / 1024 / 1024).toFixed(1)),
      uptimeSec: Math.round(process.uptime()),
    });

    if (usage.rss > warnRssMb * 1024 * 1024) {
      logger.warn(`Memory over ${warnRssMb}MB`, { rssMb: Number(rss) });
    }
  }, intervalMs);
}

module.exports = {
  scheduleNocturneHeartbeat,
  scheduleReviewQueueMaintenance,
  scheduleMemoryGovernanceReport,
  startMemoryMonitor,
};
