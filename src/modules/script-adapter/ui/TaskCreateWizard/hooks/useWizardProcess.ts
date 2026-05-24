import { useState } from 'react';
import { GatewayIntakeRun } from '../../../services/gatewayIntake';
import { GatewayAnalysisRun } from '../../../services/gatewayAnalysis';
import { GatewayProductionRun } from '../../../services/gatewayProduction';

export function useWizardProcess() {
  const [intakeRun, setIntakeRun] = useState<GatewayIntakeRun | null>(null);
  const [analysisRun, setAnalysisRun] = useState<GatewayAnalysisRun | null>(null);
  const [productionRun, setProductionRun] = useState<GatewayProductionRun | null>(null);

  return {
    intakeRun, setIntakeRun,
    analysisRun, setAnalysisRun,
    productionRun, setProductionRun,
  };
}
