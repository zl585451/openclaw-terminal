import { useEffect, useRef, useState } from 'react';
import { ScriptAdapterLayout } from './ui/ScriptAdapterLayout';
import { LibraryView } from './ui/Library/LibraryView';
import {
  getChapterText,
  listBooks,
  listChapters,
  pickLocalFile,
  uploadBook,
  type LibraryBook,
  type LibraryChapter,
} from './services/aiLibraryClient';
import { scriptAdapterActions } from './store/actions';
import { MOCK_PROJECT, MOCK_CHAPTERS } from './mockData/mockProject';
import { MOCK_STAGES } from './mockData/mockStages';
import { MOCK_ARTIFACTS } from './mockData/mockArtifacts';
import { MOCK_AGENTS } from './mockData/mockAgents';
import { MOCK_TEAM_TEMPLATES } from './mockData/mockTemplates';
import {
  type AnalysisReport,
  type AnalysisStatus,
  MOCK_INTAKE_STEPS,
  type IntakeResult,
  type IntakeStatus,
  runMockInitialAnalysis,
  runMockTaskIntake,
} from './services/mockTaskIntake';
import type { DeliveryOptions, TaskCreationContract } from './types/batch';
import styles from './styles/scriptAdapter.module.css';

type ScriptAdapterScreen = 'home' | 'create' | 'workspace' | 'library';
type WizardStep = 1 | 2 | 3;
type CreationRangeMode = 'single' | 'range' | 'all';

const AGENT_QUEUE_SUMMARY = [
  { label: '已预分配', value: '3', desc: '文件解析、内容识别、任务安排' },
  { label: '即将执行', value: '1', desc: '业务分析 Agent' },
  { label: '后续候选', value: '3', desc: '场景拆分、文本改编、角色音标注' },
  { label: '人工确认', value: '是', desc: '分析方向和冲突要求需要确认' },
];

const getGoalConfirmationCopy = (goal: string) => {
  if (goal.includes('广播剧')) {
    return {
      next: '业务分析 Agent 会先判断场景拆分、对白增强和音效成本。',
      reason: '广播剧改造成本更高，所以这里只锁定目标和范围；第 3 步再决定是否真的进入广播剧拆解。',
      focus: '场景拆分 / 对白增强 / 音效成本',
    };
  }
  if (goal.includes('润色')) {
    return {
      next: '业务分析 Agent 会先判断语言顺滑度、节奏和信息顺序。',
      reason: '润色目标需要先看文本问题分布，所以这里只锁定目标和范围；第 3 步再决定润色深度。',
      focus: '语言顺滑 / 节奏调整 / 信息顺序',
    };
  }
  if (goal.includes('分析')) {
    return {
      next: '业务分析 Agent 会先输出问题清单、证据片段和后续建议。',
      reason: '作品分析不直接改稿，所以这里只锁定分析对象；第 3 步再确认报告深度和交付清单。',
      focus: '问题清单 / 证据片段 / 后续建议',
    };
  }
  return {
    next: '业务分析 Agent 会先判断旁白听感、对白可演性和角色音风险。',
    reason: '多人演播需要先看可演性和角色音风险，所以这里只锁定目标和范围；第 3 步再决定改法深度。',
    focus: '旁白听感 / 对白可演性 / 角色音风险',
  };
};

interface ScriptAdapterAppProps {
  onBack?: () => void;
  initialScreen?: ScriptAdapterScreen;
}

export function ScriptAdapterApp({ onBack, initialScreen = 'home' }: ScriptAdapterAppProps) {
  const [screen, setScreen] = useState<ScriptAdapterScreen>(initialScreen);
  const [taskContract, setTaskContract] = useState<TaskCreationContract | null>(null);
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
    scriptAdapterActions.setAgents(MOCK_AGENTS);
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
          onStart={(contract) => {
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

interface WizardProps {
  onBack: () => void;
  onStart: (contract: TaskCreationContract) => void;
}

function TaskCreateWizard({ onBack, onStart }: WizardProps) {
  const [sourceMode, setSourceMode] = useState<'library' | 'upload' | 'paste'>('library');
  const [libraryBooks, setLibraryBooks] = useState<LibraryBook[]>([]);
  const [libraryChapters, setLibraryChapters] = useState<LibraryChapter[]>([]);
  const [selectedBookId, setSelectedBookId] = useState('');
  const [selectedChapterIndex, setSelectedChapterIndex] = useState<number | ''>('');
  const [selectedRangeMode, setSelectedRangeMode] = useState<CreationRangeMode>('single');
  const [selectedRangeEndIndex, setSelectedRangeEndIndex] = useState<number | ''>('');
  const [chapterPreview, setChapterPreview] = useState('');
  const [libraryStatus, setLibraryStatus] = useState<'idle' | 'loading-books' | 'loading-chapters' | 'loading-preview'>('idle');
  const [libraryError, setLibraryError] = useState('');
  const [uploadFilePath, setUploadFilePath] = useState('');
  const [uploadTitle, setUploadTitle] = useState('');
  const [uploadAuthor, setUploadAuthor] = useState('');
  const [uploadingBook, setUploadingBook] = useState(false);
  const [pastedText, setPastedText] = useState('');
  const [activeStep, setActiveStep] = useState<WizardStep>(1);
  const [intakeStatus, setIntakeStatus] = useState<IntakeStatus>('idle');
  const [intakeStepIndex, setIntakeStepIndex] = useState(0);
  const [intakeResult, setIntakeResult] = useState<IntakeResult | null>(null);
  const [intakeError, setIntakeError] = useState('');
  const [analysisStatus, setAnalysisStatus] = useState<AnalysisStatus>('idle');
  const [analysisReport, setAnalysisReport] = useState<AnalysisReport | null>(null);
  const [analysisError, setAnalysisError] = useState('');
  const [selectedStrategyId, setSelectedStrategyId] = useState('');
  const [deliveryOptions, setDeliveryOptions] = useState<DeliveryOptions>({
    adaptedScript: true,
    voiceRegistry: true,
    qualityReview: true,
    cvDirections: false,
    bgmSfx: false,
    finalPackage: true,
  });
  const [editingDecisionId, setEditingDecisionId] = useState<string | null>(null);
  const [decisionOverrides, setDecisionOverrides] = useState<Record<string, { value: string; desc: string; customNote: string }>>({});
  const sourceConfirmed = intakeStatus === 'completed' && Boolean(intakeResult);
  const isIntakeRunning = intakeStatus === 'running';
  const isAnalysisRunning = analysisStatus === 'running';
  const analysisCompleted = analysisStatus === 'completed' && Boolean(analysisReport);
  const selectedStrategy = analysisReport?.strategyOptions.find((option) => option.id === selectedStrategyId);
  const progressValue = analysisCompleted ? 96 : isAnalysisRunning ? 86 : sourceConfirmed ? 72 : isIntakeRunning ? 48 : 34;
  const agentQueueSummary = intakeResult
    ? [
        { label: '已预分配', value: String(intakeResult.agentPreAllocation.assignedCount), desc: '文件解析、内容识别、任务安排' },
        { label: '即将执行', value: analysisCompleted ? String(analysisReport?.executionImpact.nextAgents.length ?? 0) : '1', desc: analysisCompleted ? (analysisReport?.executionImpact.nextAgents.join('、') ?? '') : intakeResult.agentPreAllocation.nextAgent },
        { label: '后续候选', value: String(intakeResult.agentPreAllocation.candidateCount), desc: analysisCompleted ? '按策略进入制作队列' : '场景拆分、文本改编、角色音标注' },
        { label: '人工确认', value: analysisReport?.executionImpact.requiresReview ? '是' : intakeResult.agentPreAllocation.requiresHumanConfirm ? '是' : '否', desc: analysisCompleted ? '修改策略已待确认' : '分析方向和冲突要求需要确认' },
      ]
    : AGENT_QUEUE_SUMMARY;
  const createSteps = [
    {
      index: 1,
      title: '确认素材',
      desc: sourceConfirmed ? '参数已确认 · 已生成预分配' : isIntakeRunning ? '正在生成素材对象' : '先选项目素材 · 再生成预分配',
      status: activeStep === 1 ? 'active' : sourceConfirmed ? 'done' : 'pending',
    },
    {
      index: 2,
      title: '确认目标和范围',
      desc: analysisStatus !== 'idle' ? '已确认 · 正在分析' : sourceConfirmed ? '定义产物 · 工作范围' : '等待素材确认',
      status: activeStep === 2 ? 'active' : analysisStatus !== 'idle' ? 'done' : sourceConfirmed ? 'done' : 'pending',
    },
    {
      index: 3,
      title: '确认修改方向',
      desc: analysisCompleted ? '选择怎么改 · 锁定制作队列' : isAnalysisRunning ? 'AI 初读分析中' : '等待目标和范围',
      status: activeStep === 3 ? 'active' : analysisCompleted ? 'done' : 'pending',
    },
  ] as const;

  useEffect(() => {
    let cancelled = false;

    const loadBooks = async () => {
      setLibraryStatus('loading-books');
      setLibraryError('');
      try {
        const books = await listBooks();
        if (cancelled) return;
        setLibraryBooks(books);
        if (books.length > 0) {
          setSelectedBookId((current) => current || books[0].id);
          setSourceMode('library');
        } else {
          setSelectedBookId('');
          setSelectedChapterIndex('');
          setSourceMode('upload');
        }
      } catch (error) {
        if (cancelled) return;
        setLibraryBooks([]);
        setSelectedBookId('');
        setSelectedChapterIndex('');
        setLibraryError(error instanceof Error ? error.message : '项目素材库加载失败');
      } finally {
        if (!cancelled) setLibraryStatus('idle');
      }
    };

    void loadBooks();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!selectedBookId) {
      setLibraryChapters([]);
      setSelectedChapterIndex('');
      setChapterPreview('');
      return;
    }

    let cancelled = false;

    const loadChapters = async () => {
      setLibraryStatus('loading-chapters');
      setLibraryError('');
      try {
        const chapters = await listChapters(selectedBookId);
        if (cancelled) return;
        setLibraryChapters(chapters);
        setSelectedChapterIndex((current) => {
          if (current !== '' && chapters.some((chapter) => chapter.chapter_index === current)) return current;
          return chapters.length > 0 ? chapters[0].chapter_index : '';
        });
        setSelectedRangeEndIndex((current) => {
          if (current !== '' && chapters.some((chapter) => chapter.chapter_index === current)) return current;
          return chapters.length > 0 ? chapters[0].chapter_index : '';
        });
      } catch (error) {
        if (cancelled) return;
        setLibraryChapters([]);
        setSelectedChapterIndex('');
        setLibraryError(error instanceof Error ? error.message : '章节列表加载失败');
      } finally {
        if (!cancelled) setLibraryStatus('idle');
      }
    };

    void loadChapters();
    return () => {
      cancelled = true;
    };
  }, [selectedBookId]);

  useEffect(() => {
    if (!selectedBookId || selectedChapterIndex === '') {
      setChapterPreview('');
      return;
    }

    let cancelled = false;

    const loadPreview = async () => {
      setLibraryStatus('loading-preview');
      setLibraryError('');
      try {
        const { text } = await getChapterText(selectedBookId, Number(selectedChapterIndex));
        if (!cancelled) setChapterPreview(text.slice(0, 220));
      } catch (error) {
        if (!cancelled) {
          setChapterPreview('');
          setLibraryError(error instanceof Error ? error.message : '章节预览加载失败');
        }
      } finally {
        if (!cancelled) setLibraryStatus('idle');
      }
    };

    void loadPreview();
    return () => {
      cancelled = true;
    };
  }, [selectedBookId, selectedChapterIndex]);

  const canOpenStep = (step: WizardStep) => {
    if (step === 1) return true;
    if (step === 2) return sourceConfirmed;
    return analysisCompleted || isAnalysisRunning;
  };

  const openStep = (step: WizardStep) => {
    if (canOpenStep(step)) setActiveStep(step);
  };

  const refreshLibraryBooks = async () => {
    setLibraryStatus('loading-books');
    setLibraryError('');
    try {
      const books = await listBooks();
      setLibraryBooks(books);
      return books;
    } catch (error) {
      setLibraryError(error instanceof Error ? error.message : '项目素材库刷新失败');
      return [];
    } finally {
      setLibraryStatus('idle');
    }
  };

  const handlePickUploadFile = async () => {
    const filePath = await pickLocalFile();
    if (!filePath) return;
    setUploadFilePath(filePath);
    if (!uploadTitle.trim()) {
      setUploadTitle((filePath.split(/[\\/]/).pop() || '').replace(/\.(txt|md)$/i, ''));
    }
  };

  const handleUploadIntoLibrary = async () => {
    if (!uploadFilePath) {
      setLibraryError('请先选择一个 .txt 或 .md 文件');
      return;
    }
    if (!uploadTitle.trim()) {
      setLibraryError('请先填写书名');
      return;
    }

    setUploadingBook(true);
    setLibraryError('');
    try {
      const uploaded = await uploadBook({
        filePath: uploadFilePath,
        title: uploadTitle.trim(),
        author: uploadAuthor.trim() || undefined,
      });
      const books = await refreshLibraryBooks();
      const nextBook = books.find((book) => book.id === uploaded.book_id) || books[0];
      if (nextBook) {
        setSelectedBookId(nextBook.id);
        setSourceMode('library');
      }
      setUploadFilePath('');
      setUploadTitle('');
      setUploadAuthor('');
    } catch (error) {
      setLibraryError(error instanceof Error ? error.message : '上传到项目素材库失败');
    } finally {
      setUploadingBook(false);
    }
  };

  const selectedBook = libraryBooks.find((book) => book.id === selectedBookId) || null;
  const selectedChapter = libraryChapters.find((chapter) => chapter.chapter_index === selectedChapterIndex) || null;
  const selectedRangeChapters = (() => {
    if (!selectedBook || libraryChapters.length === 0) return [];
    if (selectedRangeMode === 'all') return libraryChapters;
    if (selectedRangeMode === 'range') {
      const start = selectedChapterIndex === '' ? libraryChapters[0]?.chapter_index ?? 0 : Number(selectedChapterIndex);
      const end = selectedRangeEndIndex === '' ? start : Number(selectedRangeEndIndex);
      const [from, to] = [start, end].sort((a, b) => a - b);
      return libraryChapters.filter((chapter) => chapter.chapter_index >= from && chapter.chapter_index <= to);
    }
    return selectedChapter ? [selectedChapter] : [];
  })();
  const selectedRangeTotalChars = selectedRangeChapters.reduce((sum, chapter) => sum + Number(chapter.char_count || 0), 0);
  const selectedRangeLabel = selectedRangeMode === 'all'
    ? `全书规划 · ${selectedRangeChapters.length} 章`
    : selectedRangeChapters.length > 1
      ? `${selectedRangeChapters[0]?.title || `第 ${selectedRangeChapters[0]?.chapter_index + 1} 章`} - ${selectedRangeChapters[selectedRangeChapters.length - 1]?.title || `第 ${selectedRangeChapters[selectedRangeChapters.length - 1]?.chapter_index + 1} 章`}`
      : selectedChapter?.title || (selectedChapter ? `第 ${selectedChapter.chapter_index + 1} 章` : '待选择章节');
  const sourceReady = sourceMode === 'library'
    ? Boolean(selectedBook && selectedRangeChapters.length > 0)
    : sourceMode === 'upload'
      ? false
      : Boolean(pastedText.trim());
  const sourceSummary = selectedBook?.title || uploadTitle.trim() || '待选择素材';
  const sourceTypeLabel = selectedBook?.source_type || (sourceMode === 'paste' ? '临时粘贴文本' : '待识别');
  const sourceWordCountLabel = selectedRangeTotalChars
    ? `约 ${selectedRangeTotalChars.toLocaleString('zh-CN')} 字`
    : sourceMode === 'paste' && pastedText.trim()
      ? `约 ${pastedText.trim().length.toLocaleString('zh-CN')} 字`
      : '待真实解析';

  const handleConfirmSource = async () => {
    if (isIntakeRunning || !sourceReady) return;

    setIntakeStatus('running');
    setIntakeStepIndex(0);
    setIntakeResult(null);
    setIntakeError('');

    try {
      const result = await runMockTaskIntake((stepIndex) => {
        setIntakeStepIndex(stepIndex);
      }, {
        sourceTitle: sourceSummary,
        rangeLabel: sourceMode === 'library' ? selectedRangeLabel : sourceMode === 'paste' ? '临时文本' : '待选择',
        wordCountLabel: sourceWordCountLabel,
        sourceTypeLabel,
      });
      setIntakeResult(result);
      setDecisionOverrides({});
      setEditingDecisionId(null);
      setAnalysisStatus('idle');
      setAnalysisReport(null);
      setAnalysisError('');
      setSelectedStrategyId('');
      setIntakeStatus('completed');
      setActiveStep(2);
    } catch (error) {
      setIntakeStatus('failed');
      setIntakeError(error instanceof Error ? error.message : '素材摄入失败，请重试。');
    }
  };

  const getIntakeStepClassName = (stepIndex: number) => {
    if (intakeStatus === 'completed' || intakeStepIndex > stepIndex) return styles.backgroundStepDone;
    if (isIntakeRunning && intakeStepIndex === stepIndex) return styles.backgroundStepRunning;
    return styles.backgroundStepPending;
  };

  const getDecisionView = (item: IntakeResult['taskDraft']['confirmItems'][number]) => {
    return decisionOverrides[item.id] ?? { value: item.value, desc: item.desc, customNote: '' };
  };

  const getDecisionSourceLabel = (item: IntakeResult['taskDraft']['confirmItems'][number]) => {
    const currentValue = getDecisionView(item).value;
    const source = item.options.find((option) => option.value === currentValue)?.source;
    if (source === 'recommended') return 'AI 推荐';
    if (source === 'agent') return 'Agent 候选';
    return '同类预设';
  };

  const getDecisionEditButtonText = (item: IntakeResult['taskDraft']['confirmItems'][number]) => {
    if (editingDecisionId === item.id) return '完成修改';
    if (item.id === 'work_goal') return '修改目标';
    if (item.id === 'scope') return '修改范围';
    return '修改';
  };

  const updateDecision = (itemId: string, value: string, desc: string) => {
    setDecisionOverrides((current) => ({
      ...current,
      [itemId]: {
        value,
        desc,
        customNote: current[itemId]?.customNote ?? '',
      },
    }));
    if (itemId === 'work_goal') {
      setAnalysisStatus('idle');
      setAnalysisReport(null);
      setAnalysisError('');
      setSelectedStrategyId('');
    }
  };

  const updateDecisionNote = (itemId: string, customNote: string) => {
    setDecisionOverrides((current) => ({
      ...current,
      [itemId]: {
        value: current[itemId]?.value ?? intakeResult?.taskDraft.confirmItems.find((item) => item.id === itemId)?.value ?? '',
        desc: current[itemId]?.desc ?? intakeResult?.taskDraft.confirmItems.find((item) => item.id === itemId)?.desc ?? '',
        customNote,
      },
    }));
  };

  const getDecisionSummaryValue = (itemId: string, fallback: string) => {
    if (itemId === 'scope' && sourceMode === 'library') return selectedRangeLabel;
    const sourceItem = intakeResult?.taskDraft.confirmItems.find((item) => item.id === itemId);
    return decisionOverrides[itemId]?.value ?? sourceItem?.value ?? fallback;
  };

  const selectedWorkGoal = getDecisionSummaryValue('work_goal', '多人演播有声书');
  const goalConfirmationCopy = getGoalConfirmationCopy(selectedWorkGoal);

  const handleRunAnalysis = async () => {
    if (!sourceConfirmed || isAnalysisRunning) return;

    setAnalysisStatus('running');
    setAnalysisReport(null);
    setAnalysisError('');
    setSelectedStrategyId('');
    setActiveStep(3);

    try {
      const report = await runMockInitialAnalysis({
        rangeLabel: selectedRangeLabel,
        chapterCount: selectedRangeChapters.length,
        totalChars: selectedRangeTotalChars,
        workGoal: selectedWorkGoal,
        chapters: selectedRangeChapters.map((chapter) => ({
          title: chapter.title || `第 ${chapter.chapter_index + 1} 章`,
          preview: chapter.preview || '',
          charCount: Number(chapter.char_count || 0),
        })),
      });
      setAnalysisReport(report);
      setSelectedStrategyId(report.recommendedStrategyId);
      setAnalysisStatus('completed');
      setActiveStep(3);
    } catch (error) {
      setAnalysisStatus('failed');
      setAnalysisError(error instanceof Error ? error.message : 'AI 初读分析失败，请重试。');
    }
  };

  const getFooterTitle = () => {
    if (activeStep === 1) {
      if (isIntakeRunning) return '正在确认素材';
      if (sourceConfirmed) return `已确认：${selectedRangeLabel}`;
      return sourceReady ? `待确认：${selectedRangeLabel}` : '等待选择任务素材';
    }
    if (activeStep === 2) {
      return isAnalysisRunning ? 'AI 初读分析中' : sourceConfirmed ? '等待确认目标和范围' : '请先完成素材确认';
    }
    return analysisCompleted ? '等待确认修改方向' : isAnalysisRunning ? 'AI 初读分析中' : '等待目标和范围确认';
  };

  const getFooterDesc = () => {
    if (activeStep === 1) return '确认后会进入目标和范围配置；后台解析会自动完成，不需要你理解技术链路。';
    if (activeStep === 2) return '确认后只进入 AI 初读分析，不会直接改稿；分析完成会自动进入第 3 步。';
    return '确认修改方向和交付清单后，才进入制作 Agent，并生成工作台执行单。';
  };

  const getFooterButtonText = () => {
    if (activeStep === 1) return isIntakeRunning ? '正在确认素材' : sourceConfirmed ? '重新确认素材' : '确认这份素材，继续配置目标';
    if (activeStep === 2) return isAnalysisRunning ? 'AI 初读分析中' : analysisCompleted ? '重新分析并进入第 3 步' : '确认目标和范围，进入第 3 步';
    return '确认方向，进入工作台';
  };

  const isFooterButtonDisabled = () => {
    if (activeStep === 1) return isIntakeRunning || !sourceReady;
    if (activeStep === 2) return !sourceConfirmed || isAnalysisRunning;
    return !analysisCompleted || !selectedStrategyId;
  };

  const handleFooterAction = () => {
    if (activeStep === 1) {
      void handleConfirmSource();
      return;
    }
    if (activeStep === 2) {
      void handleRunAnalysis();
      return;
    }
    if (!selectedBook || selectedRangeChapters.length === 0 || !selectedStrategy) return;
    onStart({
      bookId: selectedBook.id,
      bookTitle: selectedBook.title,
      chapterIndices: selectedRangeChapters.map((chapter) => chapter.chapter_index),
      rangeLabel: selectedRangeLabel,
      totalChars: selectedRangeTotalChars,
      chapterCount: selectedRangeChapters.length,
      workGoal: getDecisionSummaryValue('work_goal', '多人演播有声书'),
      strategyTitle: selectedStrategy.title,
      strategyDesc: selectedStrategy.desc,
      deliveryOptions,
    });
  };

  return (
    <div className={styles.createShell}>
      <header className={styles.createComposerHeader}>
        <div>
          <div className={styles.detailEyebrow}>新建内容任务</div>
          <h1>先确认素材，再配置目标</h1>
          <p>第一步只需要确认本次要处理的书和章节；后台解析、内容识别和任务草案会自动完成。</p>
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
              {analysisCompleted
                ? 'AI 初读分析完成，等待你确认修改方向。'
                : isAnalysisRunning
                  ? '业务分析 Agent 正在输出问题、证据和修改方向。'
                  : sourceConfirmed
                ? '已生成任务草案，等待你确认目标订单。'
                : isIntakeRunning
                  ? `正在执行第 ${Math.min(intakeStepIndex + 1, MOCK_INTAKE_STEPS.length)} 步素材摄入。`
                  : '先确认素材，系统再自动生成任务草案。'}
            </div>
          </div>

          <div className={styles.composerStepList}>
            {createSteps.map((step) => (
              <button
                type="button"
                key={step.index}
                className={`${styles.composerStepItem} ${
                  step.status === 'active' ? styles.composerStepItemActive : ''
                } ${
                  step.status === 'done' ? styles.composerStepItemDone : ''
                }`}
                disabled={!canOpenStep(step.index as WizardStep)}
                onClick={() => openStep(step.index as WizardStep)}
              >
                <span className={styles.composerStepIndex}>{step.index}</span>
                <div>
                  <strong>{step.title}</strong>
                  <span>{step.desc}</span>
                </div>
              </button>
            ))}
          </div>
        </aside>

        <section className={styles.composerMain}>
          {activeStep === 1 ? (
          <div className={`${styles.card} ${styles.composerGateCard}`}>
            <div className={styles.composerSectionHeader}>
              <div>
                <div className={styles.detailEyebrow}>第 1 步 · 素材确认</div>
                <h2>确认本次任务素材</h2>
                <p className={styles.sectionLead}>选择要处理的书和章节。确认后系统会自动解析素材，并带你进入目标配置。</p>
              </div>
              <span className={sourceConfirmed ? styles.composerStatePill : styles.reviewPill}>
                {sourceConfirmed ? '已确认' : isIntakeRunning ? '处理中' : '待确认'}
              </span>
            </div>

            <div className={styles.sourceGateLayout}>
              <div className={styles.sourcePrimaryColumn}>
                <div className={styles.sourceModeHeader}>
                  <strong>素材来源</strong>
                  <span>优先复用当前项目素材库里的书和章节；只有缺素材时，才在这里补充上传。</span>
                </div>
                <div className={styles.choiceGrid}>
                  <button
                    type="button"
                    className={sourceMode === 'library' ? styles.choiceCardActive : styles.choiceCard}
                    onClick={() => setSourceMode('library')}
                  >
                    项目素材库
                  </button>
                  <button
                    type="button"
                    className={sourceMode === 'upload' ? styles.choiceCardActive : styles.choiceCard}
                    onClick={() => setSourceMode('upload')}
                  >
                    上传新文件
                  </button>
                  <button
                    type="button"
                    className={sourceMode === 'paste' ? styles.choiceCardActive : styles.choiceCard}
                    onClick={() => setSourceMode('paste')}
                  >
                    粘贴试跑
                  </button>
                </div>

                {sourceMode === 'library' ? (
                  <div className={styles.sourceLibraryPanel}>
                    <div className={styles.sourceLibraryHeaderRow}>
                      <strong>当前项目已有素材</strong>
                      <span>
                        {libraryStatus === 'loading-books'
                          ? '正在读取项目素材库...'
                          : libraryBooks.length > 0
                            ? `${libraryBooks.length} 份素材`
                            : '还没有已上传素材'}
                      </span>
                    </div>

                    {libraryBooks.length === 0 ? (
                      <div className={styles.mockUploadBox}>
                        <strong>当前项目还没有素材</strong>
                        <span>先切到“上传新文件”，把小说放进项目素材库，再回来选章节。</span>
                      </div>
                    ) : null}

                    {selectedBook ? (
                      <>
                      <div className={styles.sourceSelectionGrid}>
                        <label className={styles.sourceSelectField}>
                          <span>选中的书</span>
                          <select value={selectedBookId} onChange={(event) => setSelectedBookId(event.target.value)}>
                            {libraryBooks.map((book) => (
                              <option key={book.id} value={book.id}>
                                {book.title}
                              </option>
                            ))}
                          </select>
                        </label>

                        <label className={styles.sourceSelectField}>
                          <span>起始章节</span>
                          <select
                            value={selectedChapterIndex === '' ? '' : String(selectedChapterIndex)}
                            onChange={(event) => {
                              const next = event.target.value === '' ? '' : Number(event.target.value);
                              setSelectedChapterIndex(next);
                              if (selectedRangeMode === 'single') setSelectedRangeEndIndex(next);
                            }}
                          >
                            <option value="">{libraryStatus === 'loading-chapters' ? '章节加载中...' : '请选择一章'}</option>
                            {libraryChapters.map((chapter) => (
                              <option key={chapter.id} value={String(chapter.chapter_index)}>
                                {chapter.title || `第 ${chapter.chapter_index + 1} 章`}（{chapter.char_count ?? '?'} 字）
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>

                      <div className={styles.creationRangeCard}>
                        <div className={styles.taskFieldLabel}>本次处理范围</div>
                        <div className={styles.creationRangeTabs}>
                          {[
                            ['single', '单章试产'],
                            ['range', '小批量范围'],
                            ['all', '全书规划'],
                          ].map(([mode, label]) => (
                            <button
                              key={mode}
                              type="button"
                              className={selectedRangeMode === mode ? styles.batchModeTabActive : styles.batchModeTab}
                              onClick={() => {
                                setSelectedRangeMode(mode as CreationRangeMode);
                                if (mode === 'single') setSelectedRangeEndIndex(selectedChapterIndex);
                              }}
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                        {selectedRangeMode === 'range' ? (
                          <label className={styles.sourceSelectField}>
                            <span>结束章节</span>
                            <select
                              value={selectedRangeEndIndex === '' ? '' : String(selectedRangeEndIndex)}
                              onChange={(event) => setSelectedRangeEndIndex(event.target.value === '' ? '' : Number(event.target.value))}
                            >
                              {libraryChapters.map((chapter) => (
                                <option key={chapter.id} value={String(chapter.chapter_index)}>
                                  {chapter.title || `第 ${chapter.chapter_index + 1} 章`}（{chapter.char_count ?? '?'} 字）
                                </option>
                              ))}
                            </select>
                          </label>
                        ) : null}
                        <div className={styles.creationRangeSummary}>
                          <strong>范围已锁定</strong>
                          <span>
                            {selectedRangeChapters.length || 0} 章 · {selectedRangeTotalChars.toLocaleString('zh-CN')} 字。
                            {selectedRangeMode === 'all' ? ' 全书本轮只做规划确认，不建议直接真实试产。' : ' 后续工作台只展示摘要，不再重新选章。'}
                          </span>
                        </div>
                      </div>
                      </>
                    ) : null}

                    {selectedChapter ? (
                      <div className={styles.sourcePreviewCard}>
                        <div>
                          <strong>章节预览</strong>
                          <span>只展示开头片段，方便确认文本是否选对。</span>
                        </div>
                        <p>{chapterPreview || '正在加载章节预览...'}</p>
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {sourceMode === 'upload' ? (
                  <div className={styles.sourceUploadPanel}>
                    <div className={styles.mockUploadBox}>
                      <strong>把新文件先放进当前项目素材库</strong>
                      <span>支持 `.txt` / `.md`。上传成功后会自动回到“项目素材库”并选中这本书。</span>
                    </div>
                    <div className={styles.sourceUploadRow}>
                      <button type="button" className={styles.ghostButton} onClick={() => void handlePickUploadFile()}>
                        {uploadFilePath ? '重新选择文件' : '选择文件'}
                      </button>
                      <span>{uploadFilePath || '未选择文件'}</span>
                    </div>
                    <div className={styles.sourceSelectionGrid}>
                      <label className={styles.sourceSelectField}>
                        <span>书名</span>
                        <input value={uploadTitle} onChange={(event) => setUploadTitle(event.target.value)} placeholder="例如：长夜未瞑" />
                      </label>
                      <label className={styles.sourceSelectField}>
                        <span>作者（可选）</span>
                        <input value={uploadAuthor} onChange={(event) => setUploadAuthor(event.target.value)} placeholder="例如：某某" />
                      </label>
                    </div>
                    <button
                      type="button"
                      className={styles.primaryButton}
                      disabled={uploadingBook}
                      onClick={() => void handleUploadIntoLibrary()}
                    >
                      {uploadingBook ? '上传中...' : '上传到项目素材库'}
                    </button>
                  </div>
                ) : null}

                {sourceMode === 'paste' ? (
                  <div className={styles.sourceUploadPanel}>
                    <div className={styles.mockUploadBox}>
                      <strong>临时试跑文本</strong>
                      <span>这段文本只用于快速试跑，不会自动存入项目素材库。</span>
                    </div>
                    <textarea
                      className={styles.sourcePasteTextarea}
                      value={pastedText}
                      onChange={(event) => setPastedText(event.target.value)}
                      placeholder="粘贴一段临时文本，例如第 1 章开头的 1000-3000 字。"
                    />
                  </div>
                ) : null}
              </div>

              <div className={styles.sourceInspectPanel}>
                <div className={styles.sourceFocusCard}>
                  <span>准备确认</span>
                  <strong>{sourceMode === 'library' ? selectedRangeLabel : sourceSummary}</strong>
                  <em>{sourceMode === 'library' ? '来自项目素材库' : sourceMode === 'paste' ? '来自临时粘贴文本' : '等待上传到项目素材库'}</em>
                </div>

                <div className={styles.sourceParamGrid}>
                  <div><span>素材</span><strong>{sourceSummary}</strong></div>
                  <div><span>字数</span><strong>{sourceWordCountLabel}</strong></div>
                  <div><span>类型</span><strong>{sourceConfirmed ? intakeResult?.sourceProfile.contentCategory ?? sourceTypeLabel : sourceTypeLabel}</strong></div>
                  <div><span>状态</span><strong>{sourceConfirmed ? '已确认' : sourceReady ? '可以确认' : '等待素材'}</strong></div>
                </div>

                <div className={styles.sourceProfileSummary}>
                  <strong>
                    {intakeResult
                      ? `系统理解：${intakeResult.sourceProfile.contentCategory}`
                      : sourceMode === 'library'
                        ? '系统将把选中章节作为本次任务输入'
                        : sourceMode === 'upload'
                          ? '请先上传文件，再回到素材库选择章节'
                          : '临时文本可快速试跑，但不会自动入库'}
                  </strong>
                  <span>
                    {intakeResult
                      ? intakeResult.sourceProfile.structureSummary
                      : sourceMode === 'library'
                        ? '确认后会自动完成文件解析、内容识别和任务草案生成。'
                        : sourceMode === 'upload'
                          ? '上传成功后会自动回到“项目素材库”模式。'
                          : '如果后续要复用这份正文，建议先上传进项目素材库。'}
                  </span>
                  <em>{intakeResult?.sourceProfile.confidenceLabel ?? '自动识别'}</em>
                </div>

                <div className={styles.nextActionHint}>
                  <strong>确认后将自动完成</strong>
                  <span>文件解析 → 内容识别 → 任务草案生成</span>
                  <small>这些后台步骤会折叠处理；你下一步只需要确认目标和范围。</small>
                </div>

                {libraryError ? <div className={styles.inlineErrorText}>{libraryError}</div> : null}
                {intakeError ? <div className={styles.inlineErrorText}>{intakeError}</div> : null}
              </div>
            </div>
          </div>
          ) : null}
          {activeStep === 2 ? (
          <div className={`${styles.card} ${styles.composerRequirementCard}`}>
            <div className={styles.composerSectionHeader}>
              <div>
                <div className={styles.detailEyebrow}>第 2 步 · 目标和范围确认</div>
                <h2>确认工作目标和处理范围</h2>
              </div>
              <span className={sourceConfirmed ? styles.reviewPill : styles.mutedPill}>
                {sourceConfirmed ? '任务草案已生成' : isIntakeRunning ? '生成中' : '等待素材'}
              </span>
            </div>

            {sourceConfirmed && intakeResult ? (
              <>
                <div className={styles.planHeroCard}>
                  <div className={styles.planHeroHeader}>
                    <div>
                      <strong>已生成任务草案</strong>
                      <span>这一步只确认订单是否正确：做成什么，处理哪一段。</span>
                    </div>
                    <em>{intakeResult.plannerAgent}</em>
                  </div>
                  <div className={styles.orderSummaryGrid}>
                    <div>
                      <span>目标</span>
                      <strong>{selectedWorkGoal}</strong>
                    </div>
                    <div>
                      <span>范围</span>
                      <strong>{selectedRangeLabel}</strong>
                    </div>
                    <div>
                      <span>下一步</span>
                      <strong>{goalConfirmationCopy.focus}</strong>
                    </div>
                  </div>
                  <div className={styles.orderNextStepBox}>
                    <strong>确认后：进入业务分析，不会开始改稿</strong>
                    <span>{goalConfirmationCopy.next}</span>
                  </div>
                </div>

                <div className={styles.planDecisionList}>
                  {intakeResult.taskDraft.confirmItems.map((item) => (
                    <div key={item.id} className={styles.planDecisionItem}>
                      <div className={styles.planDecisionTop}>
                        <div>
                          <div className={styles.decisionLabelRow}>
                            <span>{item.label}</span>
                            <b>{item.id === 'scope' ? '第 1 步已锁定' : getDecisionSourceLabel(item)}</b>
                          </div>
                          <strong>{item.id === 'scope' ? selectedRangeLabel : getDecisionView(item).value}</strong>
                          <em>
                            {item.id === 'scope'
                              ? `${selectedRangeChapters.length} 章 · ${selectedRangeTotalChars.toLocaleString('zh-CN')} 字。若要修改章节，请回到第 1 步。`
                              : getDecisionView(item).desc}
                          </em>
                          {getDecisionView(item).customNote ? <small>补充：{getDecisionView(item).customNote}</small> : null}
                        </div>
                        <button
                          type="button"
                          className={styles.tinyEditButton}
                          onClick={() => {
                            if (item.id === 'scope') {
                              setActiveStep(1);
                              return;
                            }
                            setEditingDecisionId(editingDecisionId === item.id ? null : item.id);
                          }}
                        >
                          {item.id === 'scope' ? '返回改范围' : getDecisionEditButtonText(item)}
                        </button>
                      </div>
                          {editingDecisionId === item.id && item.id !== 'scope' ? (
                        <div className={styles.decisionEditPanel}>
                          <div className={styles.decisionEditHint}>
                            <strong>这里只换产品目标，不选改法</strong>
                            <span>第 2 步只决定“要做成什么”和“处理哪一段”；改稿深度、润色方式和产物细节会在第 3 步确认。</span>
                          </div>
                          <div className={styles.decisionOptionList}>
                            {item.options.map((option) => (
                              <button
                                key={option.value}
                                type="button"
                                className={getDecisionView(item).value === option.value ? styles.decisionOptionActive : styles.decisionOption}
                                onClick={() => updateDecision(item.id, option.value, option.desc)}
                              >
                                <span>{option.source === 'recommended' ? '建议目标' : option.source === 'agent' ? 'Agent 候选' : '产品预设'}</span>
                                <strong>{option.value}</strong>
                                <em>{option.desc}</em>
                              </button>
                            ))}
                          </div>
                          <label className={styles.decisionCustomNote}>
                            <span>自定义补充</span>
                            <textarea
                              value={getDecisionView(item).customNote}
                              placeholder={item.customHint}
                              onChange={(event) => updateDecisionNote(item.id, event.target.value)}
                            />
                          </label>
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>

                <div className={styles.teamLockBox}>
                  <div>
                    <strong>确认后进入业务分析，不进入制作</strong>
                    <span>{goalConfirmationCopy.reason}</span>
                  </div>
                  <button
                    type="button"
                    className={styles.primaryButton}
                    disabled={!sourceConfirmed}
                    onClick={handleRunAnalysis}
                  >
                    {isAnalysisRunning ? 'AI 初读分析中' : analysisCompleted ? '重新生成 AI 初读分析' : '确认目标和范围，开始 AI 初读分析'}
                  </button>
                  {analysisError ? <div className={styles.inlineErrorText}>{analysisError}</div> : null}
                </div>
              </>
            ) : (
              <div className={styles.intakeWaitingPanel}>
                <strong>{isIntakeRunning ? '正在生成 AI 初步判断' : '等待第 1 步确认后生成 AI 初步判断'}</strong>
                <span>
                  {isIntakeRunning
                    ? '系统正在完成文件留存、文本标准化、轻量画像和任务草案生成，完成后会自动回填到这里。'
                    : '确认素材后，系统会先完成文件留存、文本标准化、轻量画像和任务草案生成，再进入这里让你调整。'}
                </span>
              </div>
            )}
          </div>
          ) : null}

          {activeStep === 3 ? (
          <div className={`${styles.card} ${styles.composerRequirementCard}`}>
            <div className={styles.composerSectionHeader}>
              <div>
                <div className={styles.detailEyebrow}>第 3 步 · 修改方向确认</div>
                <h2>确认修改方向和交付内容</h2>
              </div>
              <span className={analysisCompleted ? styles.reviewPill : styles.mutedPill}>
                {analysisCompleted ? '待确认策略' : isAnalysisRunning ? '分析中' : '等待分析'}
              </span>
            </div>

            {isAnalysisRunning ? (
              <div className={styles.analysisRunningPanel}>
                <strong>业务分析 Agent 正在读取第 2 步的目标订单</strong>
                <span>正在基于已锁定目标和范围生成问题证据、可修改方向、推荐策略和执行影响。这里仍不会改稿，只做开工前决策。</span>
              </div>
            ) : null}

            {analysisCompleted && analysisReport ? (
              <>
                <div className={styles.analysisHeroCard}>
                  <div>
                    <strong>AI 初读结论</strong>
                    <span>{analysisReport.agentName}</span>
                  </div>
                  <p>{analysisReport.summary}</p>
                </div>

                <div className={styles.analysisIssueGrid}>
                  {analysisReport.diagnosis.map((item) => (
                    <div key={item.title} className={styles.analysisIssueCard}>
                      <span>风险：{item.severity}</span>
                      <strong>{item.title}</strong>
                      <em>{item.detail}</em>
                    </div>
                  ))}
                </div>

                <div className={styles.evidencePanel}>
                  <div className={styles.taskFieldLabel}>问题证据</div>
                  {analysisReport.evidence.map((item) => (
                    <div key={`${item.location}-${item.issue}`} className={styles.evidenceItem}>
                      <div>
                        <strong>{item.location}</strong>
                        <span>{item.issue}</span>
                      </div>
                      <p>{item.quote}</p>
                    </div>
                  ))}
                </div>

                <div className={styles.strategyPanel}>
                  <div className={styles.composerSectionHeader}>
                    <div>
                      <div className={styles.taskFieldLabel}>选择修改方向</div>
                      <span className={styles.mutedText}>这里才决定“怎么改、改多深、交给哪些制作 Agent”。</span>
                    </div>
                  </div>
                  <div className={styles.strategyGrid}>
                    {analysisReport.strategyOptions.map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        className={selectedStrategyId === option.id ? styles.strategyCardActive : styles.strategyCard}
                        onClick={() => setSelectedStrategyId(option.id)}
                      >
                        <span>{option.recommended ? 'AI 推荐' : option.editDepth}</span>
                        <strong>{option.title}</strong>
                        <em>{option.desc}</em>
                        <small>{option.impact}</small>
                      </button>
                    ))}
                  </div>
                </div>

                <div className={styles.deliveryOptionContractPanel}>
                  <div className={styles.composerSectionHeader}>
                    <div>
                      <div className={styles.taskFieldLabel}>确认交付清单</div>
                      <span className={styles.mutedText}>这里决定本轮真正生成哪些文件。BGM/SFX 是高费用项，默认关闭。</span>
                    </div>
                  </div>
                  <div className={styles.deliveryOptionGrid}>
                    <label className={styles.batchOptionToggle}>
                      <input type="checkbox" checked readOnly />
                      <span>多人演播台本 必选</span>
                    </label>
                    <label className={styles.batchOptionToggle}>
                      <input
                        type="checkbox"
                        checked={deliveryOptions.voiceRegistry}
                        onChange={(event) => setDeliveryOptions((current) => ({ ...current, voiceRegistry: event.target.checked }))}
                      />
                      <span>角色音表 建议开启</span>
                    </label>
                    <label className={styles.batchOptionToggle}>
                      <input
                        type="checkbox"
                        checked={deliveryOptions.qualityReview}
                        onChange={(event) => setDeliveryOptions((current) => ({ ...current, qualityReview: event.target.checked }))}
                      />
                      <span>质检报告 建议开启</span>
                    </label>
                    <label className={styles.batchOptionToggle}>
                      <input
                        type="checkbox"
                        checked={deliveryOptions.cvDirections}
                        onChange={(event) => setDeliveryOptions((current) => ({ ...current, cvDirections: event.target.checked }))}
                      />
                      <span>CV 演播指导 可选</span>
                    </label>
                    <label className={`${styles.batchOptionToggle} ${styles.highCostOption}`}>
                      <input
                        type="checkbox"
                        checked={deliveryOptions.bgmSfx}
                        onChange={(event) => setDeliveryOptions((current) => ({ ...current, bgmSfx: event.target.checked }))}
                      />
                      <span>BGM/SFX 建议 高费用项，默认关闭</span>
                    </label>
                  </div>
                </div>

                <div className={styles.executionImpactBox}>
                  <div>
                    <strong>确认后将进入制作队列</strong>
                    <span>下一步 Agent：{analysisReport.executionImpact.nextAgents.join('、')}</span>
                    <span>预计产物：{analysisReport.executionImpact.outputs.join('、')}</span>
                    {selectedStrategy ? <span>当前策略：{selectedStrategy.title}，{selectedStrategy.impact}</span> : null}
                  </div>
                </div>
              </>
            ) : null}

            {!analysisCompleted && !isAnalysisRunning ? (
              <div className={styles.intakeWaitingPanel}>
                <strong>等待第 2 步确认后生成 AI 初读分析</strong>
                <span>确认产品方向和工作范围后，这里会展示文本问题、证据、可修改建议和策略选择。</span>
              </div>
            ) : null}
          </div>
          ) : null}
        </section>

        <aside className={styles.composerSummary}>
          {activeStep === 1 ? (
            <>
              <div className={`${styles.card} ${styles.taskMapCard}`}>
                <div className={styles.composerSectionHeader}>
                  <div>
                    <div className={styles.sidebarSectionLabel}>下一步</div>
                    <h3>确认后会发生什么</h3>
                  </div>
                  <span className={sourceReady ? styles.reviewPill : styles.mutedPill}>
                    {sourceReady ? '可继续' : '待素材'}
                  </span>
                </div>
                <div className={styles.simpleFlowList}>
                  <div className={sourceConfirmed ? styles.simpleFlowItemDone : styles.simpleFlowItemActive}>
                    <span>1</span>
                    <strong>确认这份素材</strong>
                  </div>
                  <div className={sourceConfirmed ? styles.simpleFlowItemActive : styles.simpleFlowItemPending}>
                    <span>2</span>
                    <strong>配置目标和范围</strong>
                  </div>
                  <div className={styles.simpleFlowItemPending}>
                    <span>3</span>
                    <strong>选择修改策略</strong>
                  </div>
                </div>
              </div>

              <details className={`${styles.card} ${styles.technicalDetailsCard}`}>
                <summary>查看后台处理细节</summary>
                <div className={styles.backgroundStepList}>
                  {MOCK_INTAKE_STEPS.map((step, index) => (
                    <div key={step.id} className={getIntakeStepClassName(index)}>
                      <span>{index + 1}</span>
                      <div>
                        <strong>{step.title}</strong>
                        <em>{step.desc}</em>
                      </div>
                    </div>
                  ))}
                </div>
              </details>
            </>
          ) : (
          <>
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
              <div><span>素材</span><strong>{sourceConfirmed ? '已确认 · 已完成解析' : isIntakeRunning ? '正在摄入 · 生成素材对象' : sourceMode === 'library' ? '项目素材库 · 待确认' : sourceMode === 'upload' ? '新上传文件 · 待确认' : '临时文本 · 待确认'}</strong></div>
              <div><span>归属</span><strong>{intakeResult?.sourceProfile.contentCategory ?? '待识别'}</strong></div>
              <div><span>目标</span><strong>{selectedWorkGoal}</strong></div>
              <div><span>范围</span><strong>{getDecisionSummaryValue('scope', '第 1 章')}</strong></div>
              <div><span>本轮</span><strong>{analysisCompleted ? selectedStrategy?.title ?? '待选择方向' : isAnalysisRunning ? 'AI 初读分析中' : goalConfirmationCopy.focus}</strong></div>
              <div><span>草案</span><strong>{sourceConfirmed ? '已生成 TaskDraft' : isIntakeRunning ? '生成中' : '等待生成'}</strong></div>
            </div>
          </div>

          <div className={`${styles.card} ${styles.taskMapCard}`}>
            <div className={styles.sidebarSectionLabel}>后台摄入链路</div>
            <div className={styles.backgroundStepList}>
              {MOCK_INTAKE_STEPS.map((step, index) => (
                <div key={step.id} className={getIntakeStepClassName(index)}>
                  <span>{index + 1}</span>
                  <div>
                    <strong>{step.title}</strong>
                    <em>{step.desc}</em>
                  </div>
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
                  <strong>目标和范围确认</strong>
                  <em>{sourceConfirmed ? '等待确认目标和范围' : isIntakeRunning ? '等待摄入完成' : '等待素材确认'}</em>
                </div>
              </div>
              <div className={analysisCompleted ? styles.gateMapItemActive : isAnalysisRunning ? styles.gateMapItemActive : styles.gateMapItemPending}>
                <span>3</span>
                <div>
                  <strong>修改方向确认</strong>
                  <em>{analysisCompleted ? '等待确认策略' : isAnalysisRunning ? 'AI 初读分析中' : '等待目标和范围'}</em>
                </div>
              </div>
            </div>
          </div>

          <div className={`${styles.card} ${styles.taskMapCard}`}>
            <div className={styles.sidebarSectionLabel}>Agent 队列总览</div>
            <div className={styles.queueSummaryGrid}>
              {agentQueueSummary.map((item) => (
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
            <span>第 2 步只确认目标订单和处理范围；第 3 步才确认修改方向、交付清单和制作 Agent 队列。</span>
          </div>
          </>
          )}
        </aside>
      </main>

      <footer className={styles.composerActionBar}>
        <div>
          <strong>{getFooterTitle()}</strong>
          <span>{getFooterDesc()}</span>
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
            disabled={isFooterButtonDisabled()}
            onClick={handleFooterAction}
          >
            {getFooterButtonText()}
          </button>
        </div>
      </footer>
    </div>
  );
}
