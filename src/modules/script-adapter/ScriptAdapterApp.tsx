import { useEffect, useState } from 'react';
import { ScriptAdapterLayout } from './ui/ScriptAdapterLayout';
import { scriptAdapterActions } from './store/actions';
import { MOCK_PROJECT, MOCK_CHAPTERS } from './mockData/mockProject';
import { MOCK_STAGES } from './mockData/mockStages';
import { MOCK_ARTIFACTS } from './mockData/mockArtifacts';
import { MOCK_AGENTS } from './mockData/mockAgents';
import { MOCK_TEAM_TEMPLATES } from './mockData/mockTemplates';
import styles from './styles/scriptAdapter.module.css';

type ScriptAdapterScreen = 'home' | 'create' | 'workspace';

const REQUIREMENT_PRESETS = [
  '不要改剧情',
  '提升听感',
  '旁白更口语化',
  '标注角色音',
  '补充BGM和音效',
  '补充CV情绪',
  '先出样章',
  '保留悬疑节奏',
];

const REQUIREMENT_HINTS = [
  { title: '应该写', text: '改编目标、处理范围、风格要求、保留边界、需要输出什么。' },
  { title: '不要写', text: '大段原文、无关聊天、账号密码、让 AI 改掉核心剧情事实。' },
  { title: '系统会处理', text: '无关内容会降级为备注；冲突要求会在初读分析阶段提示用户确认。' },
];

interface ScriptAdapterAppProps {
  onBack?: () => void;
}

export function ScriptAdapterApp({ onBack }: ScriptAdapterAppProps) {
  const [screen, setScreen] = useState<ScriptAdapterScreen>('home');

  useEffect(() => {
    scriptAdapterActions.loadProject(
      MOCK_PROJECT,
      MOCK_CHAPTERS,
      MOCK_STAGES,
      MOCK_ARTIFACTS,
      MOCK_TEAM_TEMPLATES,
    );
    scriptAdapterActions.setAgents(MOCK_AGENTS);
    scriptAdapterActions.setViewMode('workbench');
    scriptAdapterActions.selectStage(3);
  }, []);

  return (
    <div className={styles.root}>
      {screen === 'home' ? (
        <ContentCreationHome
          onBack={onBack}
          onCreateTask={() => setScreen('create')}
          onOpenDemoTask={() => setScreen('workspace')}
        />
      ) : null}
      {screen === 'create' ? (
        <TaskCreateWizard
          onBack={() => setScreen('home')}
          onStart={() => setScreen('workspace')}
        />
      ) : null}
      {screen === 'workspace' ? (
        <ScriptAdapterLayout onBack={() => setScreen('home')} />
      ) : null}
    </div>
  );
}

interface HomeProps {
  onBack?: () => void;
  onCreateTask: () => void;
  onOpenDemoTask: () => void;
}

function ContentCreationHome({ onBack, onCreateTask, onOpenDemoTask }: HomeProps) {
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

interface WizardProps {
  onBack: () => void;
  onStart: () => void;
}

function TaskCreateWizard({ onBack, onStart }: WizardProps) {
  const [brief, setBrief] = useState('不要改剧情，只提升听感；先做第1章前半段样章；需要标注角色音、BGM、音效和CV情绪。');
  const briefLength = brief.trim().length;
  const isBriefLong = briefLength > 220;
  const isBriefTooShort = briefLength > 0 && briefLength < 12;

  const addRequirementPreset = (preset: string) => {
    setBrief((current) => {
      const trimmed = current.trim();
      if (trimmed.includes(preset)) return current;
      return trimmed ? `${trimmed}；${preset}` : preset;
    });
  };

  return (
    <div className={styles.createShell}>
      <header className={styles.createHeader}>
        <div>
          <div className={styles.detailEyebrow}>新建内容制作任务</div>
          <h1>先告诉 AI：素材从哪来，要做成什么。</h1>
          <p>第一版先用前端 mock 跑通创建体验，真实上传、文件解析和 Gateway 执行会在下一步接入。</p>
        </div>
        <button type="button" className={styles.backButton} onClick={onBack}>
          ← 返回任务大厅
        </button>
      </header>

      <main className={styles.createGrid}>
        <section className={`${styles.card} ${styles.createMainCard}`}>
          <div className={styles.createStepHeader}>
            <span>1</span>
            <div>
              <strong>选择素材来源</strong>
              <p>用户可以上传文件、粘贴文本，或未来从已有文档中选择。</p>
            </div>
          </div>
          <div className={styles.choiceGrid}>
            <button type="button" className={styles.choiceCardActive}>上传文件</button>
            <button type="button" className={styles.choiceCard}>粘贴文本</button>
            <button type="button" className={styles.choiceCard}>已有文档</button>
          </div>

          <div className={styles.mockUploadBox}>
            <strong>拖拽文件到这里，或点击选择文件</strong>
            <span>支持 .txt / .md / .docx / 小说章节文本。当前版本为交互占位。</span>
          </div>
        </section>

        <section className={`${styles.card} ${styles.createMainCard}`}>
          <div className={styles.createStepHeader}>
            <span>2</span>
            <div>
              <strong>选择目标产物</strong>
              <p>用户选目标，系统再决定调用哪套 Agent 团队。</p>
            </div>
          </div>
          <div className={styles.choiceGrid}>
            <button type="button" className={styles.choiceCardActive}>多人演播有声书</button>
            <button type="button" className={styles.choiceCard}>广播剧</button>
            <button type="button" className={styles.choiceCard}>短剧脚本</button>
            <button type="button" className={styles.choiceCard}>只做作品分析</button>
          </div>
        </section>

        <section className={`${styles.card} ${styles.createMainCard}`}>
          <div className={styles.createStepHeader}>
            <span>3</span>
            <div>
              <strong>确认处理范围和本轮目标</strong>
              <p>避免一上来跑全书，先把样章闭环跑顺。</p>
            </div>
          </div>
          <div className={styles.choiceGrid}>
            <button type="button" className={styles.choiceCardActive}>前1章</button>
            <button type="button" className={styles.choiceCard}>全文</button>
            <button type="button" className={styles.choiceCard}>自定义范围</button>
            <button type="button" className={styles.choiceCardActive}>先分析问题</button>
            <button type="button" className={styles.choiceCard}>直接生成样章</button>
          </div>
        </section>

        <section className={`${styles.card} ${styles.createMainCard}`}>
          <div className={styles.createStepHeader}>
            <span>4</span>
            <div>
              <strong>填写本轮要求</strong>
              <p>先用标签帮用户圈定边界，自由输入只作为补充说明，不直接无条件执行。</p>
            </div>
          </div>

          <div className={styles.requirementGuide}>
            {REQUIREMENT_HINTS.map((hint) => (
              <div key={hint.title} className={styles.requirementHintCard}>
                <strong>{hint.title}</strong>
                <span>{hint.text}</span>
              </div>
            ))}
          </div>

          <div className={styles.requirementPresetBlock}>
            <div className={styles.taskFieldLabel}>推荐要求标签</div>
            <div className={styles.choiceGrid}>
              {REQUIREMENT_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  className={brief.includes(preset) ? styles.choiceCardActive : styles.choiceCard}
                  onClick={() => addRequirementPreset(preset)}
                >
                  {preset}
                </button>
              ))}
            </div>
          </div>

          <div className={styles.requirementBoundaryBox}>
            <strong>执行边界</strong>
            <span>AI 会把你的输入整理成“任务摘要”。与当前素材、目标产物无关的内容不会进入改写执行，只会作为备注保留；如果要求互相冲突，会先让你确认。</span>
          </div>

          <textarea
            className={styles.taskTextarea}
            aria-label="本轮任务补充要求"
            placeholder="例：不要改剧情，只提升听感；先做第1章前半段样章；需要标注角色音、BGM、音效和CV情绪。"
            value={brief}
            onChange={(event) => setBrief(event.target.value)}
          />

          <div className={styles.requirementMetaRow}>
            <span className={isBriefLong || isBriefTooShort ? styles.requirementWarnText : styles.mutedText}>
              {briefLength}/300 建议字数
            </span>
            {isBriefTooShort ? <span className={styles.requirementWarnText}>要求太短，建议至少说明目标或边界。</span> : null}
            {isBriefLong ? <span className={styles.requirementWarnText}>要求偏长，AI 会先压缩成任务摘要再执行。</span> : null}
          </div>

          <div className={styles.createFooterActions}>
            <button type="button" className={styles.primaryButton} onClick={onStart}>
              开始 AI 初读分析
            </button>
            <button type="button" className={styles.ghostButton} onClick={onBack}>
              稍后再建
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}
