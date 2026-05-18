import { useEffect } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { UnknownRecord } from '../../../types/electronAPI';
import type { GatewayIntakeRun } from '../services/gatewayIntake';
import type { GatewayAnalysisRun } from '../services/gatewayAnalysis';
import type { GatewayProductionRun } from '../services/gatewayProduction';
import type { AnalysisReport } from '../services/mockTaskIntake';
import type { ProductionQueueItem } from '../services/gatewayProduction';

interface UseTaskCreateWizardGatewayEventsArgs {
  setIntakeRun: Dispatch<SetStateAction<GatewayIntakeRun | null>>;
  setIntakeStepIndex: Dispatch<SetStateAction<number>>;
  setIntakeStatus: Dispatch<SetStateAction<'idle' | 'running' | 'completed' | 'failed'>>;
  setIntakeError: Dispatch<SetStateAction<string>>;
  setAnalysisRun: Dispatch<SetStateAction<GatewayAnalysisRun | null>>;
  setAnalysisStatus: Dispatch<SetStateAction<'idle' | 'running' | 'completed' | 'failed'>>;
  setAnalysisReport: Dispatch<SetStateAction<AnalysisReport | null>>;
  setSelectedStrategyId: Dispatch<SetStateAction<string>>;
  setActiveStep: Dispatch<SetStateAction<1 | 2 | 3>>;
  setAnalysisError: Dispatch<SetStateAction<string>>;
  setProductionRun: Dispatch<SetStateAction<GatewayProductionRun | null>>;
  setProductionQueue: Dispatch<SetStateAction<ProductionQueueItem[]>>;
  setProductionStatus: Dispatch<SetStateAction<'idle' | 'running' | 'completed' | 'failed'>>;
  setProductionError: Dispatch<SetStateAction<string>>;
}

function hasEventName(payload: unknown): payload is UnknownRecord & { event: string } {
  return !!payload && typeof payload === 'object' && typeof (payload as { event?: unknown }).event === 'string';
}

export function useTaskCreateWizardGatewayEvents({
  setIntakeRun,
  setIntakeStepIndex,
  setIntakeStatus,
  setIntakeError,
  setAnalysisRun,
  setAnalysisStatus,
  setAnalysisReport,
  setSelectedStrategyId,
  setActiveStep,
  setAnalysisError,
  setProductionRun,
  setProductionQueue,
  setProductionStatus,
  setProductionError,
}: UseTaskCreateWizardGatewayEventsArgs) {
  useEffect(() => {
    if (!window.electronAPI?.onScriptAdapterEvent) return undefined;
    return window.electronAPI.onScriptAdapterEvent((payload) => {
      if (!hasEventName(payload)) return;
      if (payload.event.startsWith('intake.')) {
        const nextRun = payload.intakeRun as GatewayIntakeRun | undefined;
        if (!nextRun?.id || !Array.isArray(nextRun.steps)) return;
        setIntakeRun(nextRun);
        const runningIndex = nextRun.steps.findIndex((step) => step.status === 'running');
        const doneCount = nextRun.steps.filter((step) => step.status === 'succeeded').length;
        setIntakeStepIndex(runningIndex >= 0 ? runningIndex : doneCount);
        if (nextRun.status === 'running') setIntakeStatus('running');
        if (nextRun.status === 'succeeded') setIntakeStatus('completed');
        if (nextRun.status === 'failed') {
          setIntakeStatus('failed');
          setIntakeError(nextRun.error || '素材摄入失败');
        }
        return;
      }

      if (payload.event.startsWith('analysis.')) {
        const nextRun = payload.analysisRun as GatewayAnalysisRun | undefined;
        if (!nextRun?.id || !Array.isArray(nextRun.steps)) return;
        setAnalysisRun(nextRun);
        if (nextRun.status === 'running') setAnalysisStatus('running');
        if (nextRun.status === 'succeeded') {
          if (nextRun.result) {
            setAnalysisReport(nextRun.result);
            setSelectedStrategyId(nextRun.result.recommendedStrategyId);
            setAnalysisStatus('completed');
            setActiveStep(3);
          } else {
            setAnalysisStatus('failed');
            setAnalysisError('ANALYSIS_RESULT_EMPTY: 业务分析完成但没有返回报告');
          }
        }
        if (nextRun.status === 'failed') {
          setAnalysisStatus('failed');
          setAnalysisError(nextRun.error || '业务分析失败');
        }
        return;
      }

      if (payload.event.startsWith('production.')) {
        const nextRun = payload.productionRun as GatewayProductionRun | undefined;
        if (!nextRun?.id || !Array.isArray(nextRun.steps)) return;
        setProductionRun(nextRun);
        if (nextRun.result?.productionQueue) setProductionQueue(nextRun.result.productionQueue);
        if (nextRun.status === 'running') setProductionStatus('running');
        if (nextRun.status === 'succeeded') setProductionStatus('completed');
        if (nextRun.status === 'failed') {
          setProductionStatus('failed');
          setProductionError(nextRun.error || '制作交接失败');
        }
      }
    });
  }, [
    setActiveStep,
    setAnalysisError,
    setAnalysisReport,
    setAnalysisRun,
    setAnalysisStatus,
    setIntakeError,
    setIntakeRun,
    setIntakeStatus,
    setIntakeStepIndex,
    setProductionError,
    setProductionQueue,
    setProductionRun,
    setProductionStatus,
    setSelectedStrategyId,
  ]);
}
