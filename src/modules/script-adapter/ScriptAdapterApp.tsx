import { useEffect, useRef, useState } from 'react';
import { ScriptAdapterLayout } from './ui/ScriptAdapterLayout';
import { LibraryView } from './ui/Library/LibraryView';
import { scriptAdapterActions } from './store/actions';
import { MOCK_PROJECT, MOCK_CHAPTERS } from './mockData/mockProject';
import { MOCK_STAGES } from './mockData/mockStages';
import { MOCK_ARTIFACTS } from './mockData/mockArtifacts';
import { MOCK_TEAM_TEMPLATES } from './mockData/mockTemplates';
import { TaskCreateWizard } from './ui/TaskCreateWizard';
import styles from './styles/scriptAdapter.module.css';

type ScriptAdapterScreen = 'home' | 'create' | 'workspace' | 'library';

interface ScriptAdapterAppProps {
  onBack?: () => void;
  initialScreen?: ScriptAdapterScreen;
}


export function ScriptAdapterApp({ onBack, initialScreen = 'home' }: ScriptAdapterAppProps) {
  const [screen, setScreen] = useState<ScriptAdapterScreen>(initialScreen);
  const [taskContract, setTaskContract] = useState<any | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const enteredFromChat = initialScreen !== 'home';

  useEffect(() => {
    scriptAdapterActions.loadProject(
      MOCK_PROJECT,
      MOCK_CHAPTERS,
      MOCK_STAGES,
      MOCK_ARTIFACTS,
      MOCK_TEAM_TEMPLATES,
    );
    scriptAdapterActions.setViewMode('workbench');
    scriptAdapterActions.selectStage(3);
  }, []);

  useEffect(() => {
    rootRef.current?.scrollTo({ top: 0, left: 0 });
  }, [screen]);

  const handleModuleBack = () => {
    if (enteredFromChat) {
      onBack?.();
      return;
    }
    setScreen('home');
  };

  return (
    <div className={styles.root} ref={rootRef}>
      {screen === 'home' ? (
        <ContentCreationHome
          onBack={onBack}
          onCreateTask={() => setScreen('create')}
          onOpenDemoTask={() => setScreen('workspace')}
          onOpenLibrary={() => setScreen('library')}
        />
      ) : null}
      {screen === 'create' ? (
        <TaskCreateWizard
          onBack={() => setScreen('home')}
          onStart={(contract: any) => {
            setTaskContract(contract);
            setScreen('workspace');
          }}
        />
      ) : null}
      {screen === 'workspace' ? (
        <ScriptAdapterLayout onBack={handleModuleBack} taskContract={taskContract} />
      ) : null}
      {screen === 'library' ? (
        <LibraryWorkspace
          onBack={handleModuleBack}
          backLabel={enteredFromChat ? '← 返回 Chat' : '← 返回内容创作首页'}
          onOpenWorkbench={() => setScreen('workspace')}
        />
      ) : null}
    </div>
  );
}

interface HomeProps {
  onBack?: () => void;
  onCreateTask: () => void;
  onOpenDemoTask: () => void;
  onOpenLibrary: () => void;
}

function ContentCreationHome({ onBack, onCreateTask, onOpenDemoTask, onOpenLibrary }: HomeProps) {
  return (
    <div className={styles.entryShell}>
      <header className={styles.entryHeader}>
        <div>
          <div className={styles.detailEyebrow}>内容创作</div>
          <h1>从一个明确任务开始，而不是从 Agent 开始。</h1>
          <p>
            上传小说、剧本、课程稿或访谈稿，让 AI 先做初读分析，再由你确认方向，最后进入工作台执行改写、拆分、标注或制作方案。
          </p>
        </div>
        {onBack ? (
          <button type="button" className={styles.backButton} onClick={onBack}>
            ← 返回 Chat
          </button>
        ) : null}
      </header>

      <section className={styles.entryHeroGrid}>
        <div className={`${styles.card} ${styles.entryPrimaryCard}`}>
          <div className={styles.entryCardKicker}>推荐入口</div>
          <h2>新建内容制作任务</h2>
          <p>
            适合用户主动打开内容创作面板时使用。先选素材来源和目标产物，再开始 AI 初读分析。
          </p>
          <button type="button" className={styles.primaryButton} onClick={onCreateTask}>
            新建任务
          </button>
        </div>

        <div className={`${styles.card} ${styles.entrySecondaryCard} ${styles.entryLibraryCard}`}>
          <div className={styles.entryCardKicker}>项目启动</div>
          <h2>项目素材库</h2>
          <p>
            先把小说、脚本、访谈稿放进素材空间，再按章节预览、删除或回到工作台开工。它更像项目沙盒，不只是上传入口。
          </p>
          <button type="button" className={styles.ghostButton} onClick={onOpenLibrary}>
            打开素材库
          </button>
        </div>

        <div className={`${styles.card} ${styles.entrySecondaryCard}`}>
          <div className={styles.entryCardKicker}>已有任务</div>
          <h2>继续样章工作台</h2>
          <p>
            打开当前 mock 项目：长夜未瞑 · 多人演播有声小说。用于查看任务式工作台的完整演示。
          </p>
          <button type="button" className={styles.ghostButton} onClick={onOpenDemoTask}>
            继续制作
          </button>
        </div>
      </section>

      <section className={styles.entryTemplateGrid}>
        <EntryTemplateCard
          title="多人演播有声书"
          desc="小说口语化改编、角色音标注、演播提示、质检交付。"
        />
        <EntryTemplateCard
          title="广播剧"
          desc="重建场景台词、音效调度、角色关系和分场节奏。"
        />
        <EntryTemplateCard
          title="短剧脚本"
          desc="提炼冲突、拆场、生成短剧分集或分镜脚本。"
        />
        <EntryTemplateCard
          title="只做作品分析"
          desc="先总结问题、结构、人物、节奏和修改建议，不直接改稿。"
        />
      </section>
    </div>
  );
}

interface LibraryWorkspaceProps {
  onBack: () => void;
  onOpenWorkbench: () => void;
  backLabel: string;
}

function LibraryWorkspace({ onBack, onOpenWorkbench, backLabel }: LibraryWorkspaceProps) {
  return (
    <div className={styles.layout}>
      <div className={styles.layoutHeader}>
        <div className={styles.projectMeta}>
          <div className={styles.projectName}>项目素材库</div>
          <div className={styles.projectSub}>
            先上传并整理小说章节，再围绕这些内容讨论或进入内容制作工作台。
          </div>
        </div>

        <div className={styles.layoutControls}>
          <button type="button" className={styles.ghostButton} onClick={onOpenWorkbench}>
            进入工作台
          </button>
          <button type="button" className={styles.backButton} onClick={onBack}>
            {backLabel}
          </button>
        </div>
      </div>

      <div className={styles.viewFrame}>
        <LibraryView />
      </div>
    </div>
  );
}

interface EntryTemplateCardProps {
  title: string;
  desc: string;
}

function EntryTemplateCard({ title, desc }: EntryTemplateCardProps) {
  return (
    <div className={`${styles.card} ${styles.entryTemplateCard}`}>
      <strong>{title}</strong>
      <span>{desc}</span>
    </div>
  );
}

