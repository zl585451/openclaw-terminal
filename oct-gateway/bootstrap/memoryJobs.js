'use strict';

function startGatewayMemoryJobs({
  memory,
  memoryTaskQueue,
  memoryManagementAgent,
  reviewQueueMaintenance,
  startMemoryMonitor,
  startScheduler,
  scheduleMemoryHealthCheck,
  scheduleMemoryHeartbeat,
  scheduleReviewQueueMaintenance,
  scheduleMemoryGovernanceReport,
  logger,
  memoryLogger,
  memoryRoot,
}) {
  scheduleMemoryHealthCheck?.({
    memory,
    logger,
  });

  scheduleMemoryHeartbeat?.({
    memoryTaskQueue,
    logger,
  });

  scheduleReviewQueueMaintenance?.({
    memoryTaskQueue,
    reviewQueueMaintenance,
    logger,
  });

  scheduleMemoryGovernanceReport?.({
    memoryTaskQueue,
    memoryManagementAgent,
    logger,
  });

  logger?.info?.('Memory v2 file backend enabled', { root: memoryRoot });
  startMemoryMonitor?.({ logger: memoryLogger });
  startScheduler?.();
}

module.exports = {
  startGatewayMemoryJobs,
};
