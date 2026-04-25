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

const SOURCE_AGENT_PREVIEW = [
  { name: '文件解析 Agent', status: '预分配', desc: '识别文件类型、字数、章节边界和基础元数据。' },
  { name: '内容识别 Agent', status: '预分配', desc: '判断题材、文本形态和是否适合当前目标产物。' },
  { name: '任务安排 Agent', status: '预分配', desc: '生成初步任务草案、推荐方案和后续 Agent 队列。' },
];

const AGENT_QUEUE_SUMMARY = [
  { label: '已预分配', value: '3', desc: '文件解析、内容识别、任务安排' },
  { label: '即将执行', value: '1', desc: '业务分析 Agent' },
  { label: '后续候选', value: '3', desc: '场景拆分、文本改编、角色音标注' },
  { label: '人工确认', value: '是', desc: '分析方向和冲突要求需要确认' },
];

const INTAKE_INSIGHTS = [
  { label: '素材判断', value: '小说正文', desc: '旁白和对白混合，适合先做多人演播方向分析。' },
  { label: '结构判断', value: '识别第 1 章', desc: '章节边界可用，适合先从样章范围开始。' },
  { label: '推荐目标', value: '多人演播有声书', desc: '当前文本更适合听感优化、角色音和演播标注。' },
  { label: '风险提示', value: '轻风险', desc: '字数与章节仍需真实解析；未发现明显目标冲突。' },
];

const RECOMMENDED_PLAN = [
  { label: '推荐范围', value: '第 1 章', desc: '先控制样章范围，避免第一次任务过大。' },
  { label: '推荐本轮', value: '先分析问题', desc: '先输出文本问题、听感风险和改编方向，不直接改稿。' },
  { label: '推荐后续', value: '业务分析 Agent', desc: '第二步确认后再进入作品结构和听感问题分析。' },
];

const BACKGROUND_INTAKE_STEPS = [
  'RawAsset 原始文件留存',
  '文本抽取 / 清洗 / 编码统一',
  'SourceDocument 标准化入库',
  'SourceProfile 建索引和轻量画像',
  '任务安排 Agent 生成 TaskDraft',
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
  const [sourceConfirmed, setSourceConfirmed] = useState(false);
  const briefLength = brief.trim().length;
  const isBriefLong = briefLength > 220;
  const isBriefTooShort = briefLength > 0 && briefLength < 12;
  const progressValue = sourceConfirmed ? 78 : 46;
  const createSteps = [
    {
      index: 1,
      title: '确认素材',
      desc: sourceConfirmed ? '参数已确认 · 已生成预分配' : '上传原始文本 · 生成预分配',
      status: sourceConfirmed ? 'done' : 'active',
    },
    {
      index: 2,
      title: '确认执行',
      desc: sourceConfirmed ? '定义产物 · 锁定团队结构' : '等待素材确认',
      status: sourceConfirmed ? 'active' : 'pending',
    },
  ] as const;

  const addRequirementPreset = (preset: string) => {
    setBrief((current) => {
      const trimmed = current.trim();
      if (trimmed.includes(preset)) return current;
      return trimmed ? `${trimmed}；${preset}` : preset;
    });
  };

  return (
    <div className={styles.createShell}>
      <header className={styles.createComposerHeader}>
        <div>
          <div className={styles.detailEyebrow}>后台任务编排</div>
          <h1>配置内容制作任务</h1>
          <p>先安排素材、目标、范围和要求。当前只定 UI，不接真实上传、文件解析或 Gateway 执行。</p>
        </div>
        <button type="button" className={styles.backButton} onClick={onBack}>
          ← 返回任务大厅
        </button>
      </header>

      <main className={styles.composerGrid}>
        <aside className={styles.composerRail}>
          <div className={`${styles.card} ${styles.composerProgressCard}`}>
            <div className={styles.sidebarSectionLabel}>任务完整度</div>
            <div className={styles.composerProgressValue}>{progressValue}%</div>
            <div className={styles.composerProgressTrack}>
              <span style={{ width: `${progressValue}%` }} />
            </div>
            <div className={styles.mutedText}>
              {sourceConfirmed ? '已生成初步任务草案，等待你确认详细执行方案。' : '先确认素材参数，系统再生成 Agent 预分配。'}
            </div>
          </div>

          <div className={styles.composerStepList}>
            {createSteps.map((step) => (
              <div
                key={step.index}
                className={`${styles.composerStepItem} ${
                  step.status === 'active' ? styles.composerStepItemActive : ''
                } ${
                  step.status === 'done' ? styles.composerStepItemDone : ''
                }`}
              >
                <span className={styles.composerStepIndex}>{step.index}</span>
                <div>
                  <strong>{step.title}</strong>
                  <span>{step.desc}</span>
                </div>
              </div>
            ))}
          </div>
        </aside>

        <section className={styles.composerMain}>
          <div className={`${styles.card} ${styles.composerGateCard}`}>
            <div className={styles.composerSectionHeader}>
              <div>
                <div className={styles.detailEyebrow}>第 1 步 · 输入确认</div>
                <h2>提交原始文本，确认素材参数</h2>
              </div>
              <span className={sourceConfirmed ? styles.composerStatePill : styles.reviewPill}>
                {sourceConfirmed ? '已确认' : '待确认'}
              </span>
            </div>

            <div className={styles.sourceGateLayout}>
              <div className={styles.sourcePrimaryColumn}>
                <div className={styles.sourceModeHeader}>
                  <strong>素材来源</strong>
                  <span>第一版以上传原始文本为主，粘贴和已有文档先作为轻量入口保留。</span>
                </div>
                <div className={styles.choiceGrid}>
                  <button type="button" className={styles.choiceCardActive}>上传文件</button>
                  <button type="button" className={styles.choiceCard}>粘贴试跑</button>
                  <button type="button" className={styles.choiceCard}>已有文档</button>
                </div>
                <div className={styles.mockUploadBox}>
                  <strong>拖拽小说原文到这里，或点击选择文件</strong>
                  <span>支持 .txt / .md / .docx / 小说章节文本。确认后才会进入文件解析和 Agent 预分配。</span>
                </div>
              </div>

              <div className={styles.sourceInspectPanel}>
                <div className={styles.taskFieldLabel}>确认后生成的素材参数</div>
                <div className={styles.sourceParamGrid}>
                  <div><span>文件</span><strong>长夜未瞑_第1章.txt</strong></div>
                  <div><span>类型</span><strong>小说正文</strong></div>
                  <div><span>章节</span><strong>识别第 1 章</strong></div>
                  <div><span>字数</span><strong>待真实解析</strong></div>
                </div>
                <div className={styles.agentPreviewList}>
                  {SOURCE_AGENT_PREVIEW.map((item) => (
                    <div key={item.name} className={styles.agentPreviewItem}>
                      <div>
                        <strong>{item.name}</strong>
                        <span>{item.desc}</span>
                      </div>
                      <em>{item.status}</em>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  className={styles.primaryButton}
                  onClick={() => setSourceConfirmed(true)}
                >
                  确认素材，生成任务方案
                </button>
              </div>
            </div>
          </div>

          <div className={`${styles.card} ${styles.composerRequirementCard}`}>
            <div className={styles.composerSectionHeader}>
              <div>
                <div className={styles.detailEyebrow}>第 2 步 · 产物确认</div>
                <h2>定义产物、范围和本轮要求</h2>
              </div>
              <span className={sourceConfirmed ? styles.reviewPill : styles.mutedPill}>
                {sourceConfirmed ? '初步分析已生成' : '等待素材'}
              </span>
            </div>

            {sourceConfirmed ? (
              <div className={styles.intakeResultPanel}>
                <div className={styles.intakeResultHeader}>
                  <div>
                    <strong>AI 初步判断</strong>
                    <span>任务安排 Agent 已完成轻量摄入分析，下面是给第 2 步的默认建议。</span>
                  </div>
                  <em>task.intake_planner@1.0</em>
                </div>
                <div className={styles.intakeInsightGrid}>
                  {INTAKE_INSIGHTS.map((item) => (
                    <div key={item.label} className={styles.intakeInsightCard}>
                      <span>{item.label}</span>
                      <strong>{item.value}</strong>
                      <em>{item.desc}</em>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className={styles.intakeWaitingPanel}>
                <strong>等待第 1 步确认后生成 AI 初步判断</strong>
                <span>确认素材后，系统会先完成文件留存、文本标准化、轻量画像和任务草案生成，再进入这里让你调整。</span>
              </div>
            )}

            {sourceConfirmed ? (
              <div className={styles.recommendedPlanPanel}>
                <div className={styles.taskFieldLabel}>推荐执行方案</div>
                <div className={styles.recommendedPlanGrid}>
                  {RECOMMENDED_PLAN.map((item) => (
                    <div key={item.label} className={styles.recommendedPlanItem}>
                      <span>{item.label}</span>
                      <strong>{item.value}</strong>
                      <em>{item.desc}</em>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <div className={styles.composerConfigGrid}>
              <div className={styles.composerConfigGroup}>
                <strong>目标产物</strong>
                <div className={styles.choiceGrid}>
                  <button type="button" className={styles.choiceCardActive}>多人演播有声书</button>
                  <button type="button" className={styles.choiceCard}>广播剧</button>
                  <button type="button" className={styles.choiceCard}>短剧脚本</button>
                  <button type="button" className={styles.choiceCard}>只做作品分析</button>
                </div>
              </div>
              <div className={styles.composerConfigGroup}>
                <strong>处理范围</strong>
                <div className={styles.choiceGrid}>
                  <button type="button" className={styles.choiceCardActive}>前1章</button>
                  <button type="button" className={styles.choiceCard}>全文</button>
                  <button type="button" className={styles.choiceCard}>自定义范围</button>
                </div>
              </div>
              <div className={styles.composerConfigGroup}>
                <strong>本轮目标</strong>
                <div className={styles.choiceGrid}>
                  <button type="button" className={styles.choiceCardActive}>先分析问题</button>
                  <button type="button" className={styles.choiceCard}>直接生成样章</button>
                </div>
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

            <div className={styles.teamLockBox}>
              <div>
                <strong>确认后锁定的 Agent 团队</strong>
                <span>业务分析 Agent 先执行；场景拆分、文本改编、角色音标注和演播设计进入后续候选队列。</span>
              </div>
              <button
                type="button"
                className={styles.primaryButton}
                disabled={!sourceConfirmed}
                onClick={onStart}
              >
                确认方案，开始 AI 初读分析
              </button>
            </div>
          </div>
        </section>

        <aside className={styles.composerSummary}>
          <div className={`${styles.card} ${styles.taskMapCard}`}>
            <div className={styles.composerSectionHeader}>
              <div>
                <div className={styles.sidebarSectionLabel}>任务地图</div>
                <h3>系统理解结果</h3>
              </div>
              <span className={sourceConfirmed ? styles.reviewPill : styles.mutedPill}>
                {sourceConfirmed ? '待执行确认' : '待素材确认'}
              </span>
            </div>
            <div className={styles.summaryList}>
              <div><span>素材</span><strong>{sourceConfirmed ? '已确认 · 等待解析接入' : '上传文件 · 待确认'}</strong></div>
              <div><span>目标</span><strong>多人演播有声书</strong></div>
              <div><span>范围</span><strong>前1章</strong></div>
              <div><span>本轮</span><strong>先分析问题</strong></div>
              <div><span>草案</span><strong>{sourceConfirmed ? '已生成 TaskDraft' : '等待生成'}</strong></div>
            </div>
          </div>

          <div className={`${styles.card} ${styles.taskMapCard}`}>
            <div className={styles.sidebarSectionLabel}>后台摄入链路</div>
            <div className={styles.backgroundStepList}>
              {BACKGROUND_INTAKE_STEPS.map((step, index) => (
                <div key={step} className={sourceConfirmed ? styles.backgroundStepDone : styles.backgroundStepPending}>
                  <span>{index + 1}</span>
                  <strong>{step}</strong>
                </div>
              ))}
            </div>
          </div>

          <div className={`${styles.card} ${styles.taskMapCard}`}>
            <div className={styles.sidebarSectionLabel}>确认闸门</div>
            <div className={styles.gateMapList}>
              <div className={sourceConfirmed ? styles.gateMapItemDone : styles.gateMapItemActive}>
                <span>1</span>
                <div>
                  <strong>素材确认</strong>
                  <em>{sourceConfirmed ? '已通过' : '当前步骤'}</em>
                </div>
              </div>
              <div className={sourceConfirmed ? styles.gateMapItemActive : styles.gateMapItemPending}>
                <span>2</span>
                <div>
                  <strong>执行确认</strong>
                  <em>{sourceConfirmed ? '等待确认方案' : '等待素材确认'}</em>
                </div>
              </div>
            </div>
          </div>

          <div className={`${styles.card} ${styles.taskMapCard}`}>
            <div className={styles.sidebarSectionLabel}>Agent 队列总览</div>
            <div className={styles.queueSummaryGrid}>
              {AGENT_QUEUE_SUMMARY.map((item) => (
                <div key={item.label} className={styles.queueSummaryItem}>
                  <span>{item.label}</span>
                  <strong>{item.value}</strong>
                  <em>{item.desc}</em>
                </div>
              ))}
            </div>
          </div>

          <div className={styles.requirementBoundaryBox}>
            <strong>执行边界</strong>
            <span>AI 会把输入整理成“任务摘要”。与当前素材、目标产物无关的内容不会进入改写执行，只会作为备注保留；如果要求互相冲突，会先让你确认。</span>
          </div>
        </aside>
      </main>

      <footer className={styles.composerActionBar}>
        <div>
          <strong>{sourceConfirmed ? '等待确认执行方案' : '等待确认素材参数'}</strong>
          <span>每一步确认都会沉淀成后台任务对象，方便后续 Agent 分配和人工复核。</span>
        </div>
        <div className={styles.createFooterActions}>
          <button type="button" className={styles.ghostButton} onClick={onBack}>
            稍后再建
          </button>
          <button type="button" className={styles.ghostButton}>
            保存草稿
          </button>
          <button
            type="button"
            className={styles.primaryButton}
            disabled={!sourceConfirmed}
            onClick={onStart}
          >
            确认方案，开始分析
          </button>
        </div>
      </footer>
    </div>
  );
}
