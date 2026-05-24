import { useState } from 'react';
import { IntakeResult } from '../../../services/mockTaskIntake';

export function useWizardDecisions(intakeResult: IntakeResult | null) {
  const [decisionOverrides, setDecisionOverrides] = useState<Record<string, { value: string; desc: string; customNote: string }>>({});
  const [editingDecisionId, setEditingDecisionId] = useState<string | null>(null);

  const updateDecision = (itemId: string, value: string, desc: string) => {
    setDecisionOverrides((current) => ({
      ...current,
      [itemId]: {
        value,
        desc,
        customNote: current[itemId]?.customNote ?? '',
      },
    }));
  };

  const updateDecisionNote = (itemId: string, customNote: string) => {
    setDecisionOverrides((current) => ({
      ...current,
      [itemId]: {
        value: current[itemId]?.value ?? intakeResult?.taskDraft.confirmItems.find((item: any) => item.id === itemId)?.value ?? '',
        desc: current[itemId]?.desc ?? intakeResult?.taskDraft.confirmItems.find((item: any) => item.id === itemId)?.desc ?? '',
        customNote,
      },
    }));
  };

  return {
    decisionOverrides, setDecisionOverrides,
    editingDecisionId, setEditingDecisionId,
    updateDecision,
    updateDecisionNote,
  };
}
