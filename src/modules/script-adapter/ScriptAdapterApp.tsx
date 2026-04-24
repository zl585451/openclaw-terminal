import { useEffect } from 'react';
import { ScriptAdapterLayout } from './ui/ScriptAdapterLayout';
import { scriptAdapterActions } from './store/actions';
import { MOCK_PROJECT, MOCK_CHAPTERS } from './mockData/mockProject';
import { MOCK_STAGES } from './mockData/mockStages';
import { MOCK_ARTIFACTS } from './mockData/mockArtifacts';
import { MOCK_AGENTS } from './mockData/mockAgents';
import styles from './styles/scriptAdapter.module.css';

interface ScriptAdapterAppProps {
  onBack?: () => void;
}

export function ScriptAdapterApp({ onBack }: ScriptAdapterAppProps) {
  useEffect(() => {
    scriptAdapterActions.loadProject(MOCK_PROJECT, MOCK_CHAPTERS, MOCK_STAGES, MOCK_ARTIFACTS);
    scriptAdapterActions.setAgents(MOCK_AGENTS);
    scriptAdapterActions.setViewMode('workbench');
    scriptAdapterActions.selectStage(4);
  }, []);

  return (
    <div className={styles.root}>
      <ScriptAdapterLayout onBack={onBack} />
    </div>
  );
}
