import { useState } from 'react';
import { useScriptAdapterStore } from '../../store/scriptAdapterStore';
import { scriptAdapterActions } from '../../store/actions';
import styles from '../../styles/scriptAdapter.module.css';

const TASK_STEPS = [
  { label: '上传文本', desc: '导入原文或粘贴章节内容', status: 'done' },
  { label: '编辑任务', desc: '说明想改成什么形态', status: 'done' },
  { label: 'AI 初读分析', desc: '先找问题，不急着改', status: 'running' },
  { label: '确认方向', desc: '采纳建议或补充要求', status: 'pending' },
  { label: '执行改写', desc: '按确认方案生成台本', status: 'pending' },
] as const;

export function WorkbenchView() {
  const [userNote, setUserNote] = useState('先做第1章前半段样章，重点提升旁白口语流畅度，并补充多人演播需要的角色音、BGM、音效和CV情绪标注。');

  const currentProjectId = useScriptAdapterStore((state) => state.currentProjectId);
  const project = useScriptAdapterStore((state) =>
    currentProjectId ? state.projects[currentProjectId] : null,
  );
  const chapters = useScriptAdapterStore((state) =>
    currentProjectId ? state.chapters[currentProjectId] ?? [] : [],
  );
  const artifacts = useScriptAdapterStore((state) =>
    currentProjectId ? state.artifacts[currentProjectId] ?? [] : [],
  );

  const currentChapter = chapters.find((chapter) => chapter.id === project?.meta.currentChapterId) ?? chapters[0];
  const sceneBreakdown = artifacts.find((artifact) => artifact.type === 'scene_breakdown');
  const adaptedScript = artifacts.find((artifact) => artifact.type === 'adapted_script');

  return (
    <div className={styles.taskWorkbench}>
      <aside className={styles.taskRail}>
        <div className={`${styles.card} ${styles.taskProjectCard}`}>
          <div className={styles.sidebarSectionLabel}>当前任务</div>
          <div className={styles.projectCardTitle}>{project?.name ?? '未命名项目'}</div>
          <div className={styles.taskProjectMeta}>
            <span>{currentChapter ? `第${currentChapter.index}章：${currentChapter.title}` : '未选择章节'}</span>
            <span>{project?.meta.genre ?? '题材待确认'}</span>
          </div>
        </div>

        <div className={styles.taskStepList}>
          {TASK_STEPS.map((step, index) => (
            <div
              key={step.label}
              className={`${styles.taskStep} ${
                step.status === 'running' ? styles.taskStepActive : ''
              }`}
            >
              <span className={styles.taskStepIndex}>{index + 1}</span>
              <div className={styles.taskStepText}>
                <strong>{step.label}</strong>
                <span>{step.desc}</span>
              </div>
            </div>
          ))}
        </div>

        <button
          type="button"
          className={styles.secondaryWideButton}
          onClick={() => scriptAdapterActions.setViewMode('pipeline')}
        >
          查看 Agent 流程
        </button>
      </aside>

      <main className={styles.taskMain}>
        <section className={`${styles.card} ${styles.heroTaskCard}`}>
          <div className={styles.heroTaskCopy}>
            <div className={styles.detailEyebrow}>下一步</div>
            <h2>先确认 AI 的第一轮分析，再决定怎么改。</h2>
            <p>
              系统已经拿到文本并完成初读。现在不直接重写，而是先把问题、原文对照和建议方向摆出来，
              你可以一键采纳，也可以补充自己的修改要求。
            </p>
          </div>
          <div className={styles.heroTaskActions}>
            <button
              type="button"
              className={styles.primaryButton}
              onClick={() => scriptAdapterActions.openStageInWorkbench(3)}
            >
              采纳建议并生成方案
            </button>
            <button
              type="button"
              className={styles.ghostButton}
              onClick={() => scriptAdapterActions.openStageInWorkbench(2)}
            >
              只查看分析详情
            </button>
          </div>
        </section>

        <section className={styles.taskGrid}>
          <div className={`${styles.card} ${styles.taskInputCard}`}>
            <div className={styles.sectionTitle}>任务内容</div>
            <label className={styles.taskFieldLabel} htmlFor="script-adapter-task-note">
              你希望 AI 怎么处理这段文本？
            </label>
            <textarea
              id="script-adapter-task-note"
              className={styles.taskTextarea}
              value={userNote}
              onChange={(event) => setUserNote(event.target.value)}
            />
            <div className={styles.inlineActionRow}>
              <button type="button" className={styles.primaryButton}>
                更新任务说明
              </button>
              <button type="button" className={styles.ghostButton}>
                重新上传文本
              </button>
            </div>
          </div>

          <div className={`${styles.card} ${styles.analysisCard}`}>
            <div className={styles.sectionTitle}>AI 初读结论</div>
            <div className={styles.analysisList}>
              <div>
                <strong>当前问题 1：旁白偏书面。</strong>
                <span>适合阅读，但直接演播时气口较长，CV容易读成平铺直叙。</span>
              </div>
              <div>
                <strong>当前问题 2：演播信息缺席。</strong>
                <span>原文已经把事情讲清楚，但缺少BGM、SFX、情绪、气息和动作提示。</span>
              </div>
              <div>
                <strong>当前问题 3：角色音需要提前占位。</strong>
                <span>文件、记录、OS类对白不能粗暴归旁白，需要给统筹留出未定角色音。</span>
              </div>
            </div>
          </div>
        </section>

        <section className={styles.compareGrid}>
          <div className={`${styles.card} ${styles.compareCard}`}>
            <div className={styles.sectionTitle}>原文/结构依据</div>
            <div className={styles.compareText}>
              {sceneBreakdown?.contentPreview ??
                '等待 AI 完成章节拆分后，这里展示原文段落、场景依据和关键剧情锁定。'}
            </div>
          </div>

          <div className={`${styles.card} ${styles.compareCard}`}>
            <div className={styles.sectionTitle}>建议改法预览</div>
            <div className={styles.compareText}>
              {adaptedScript?.contentPreview ??
                '等待用户确认方向后，这里展示改写样张、角色音标注和演播提示。'}
            </div>
          </div>
        </section>

        <section className={`${styles.card} ${styles.directionCard}`}>
          <div>
            <div className={styles.sectionTitle}>推荐执行方向</div>
            <p>
              保留剧情事实和章节顺序，只把表达改成更适合听的台本；旁白负责顺畅叙事，角色对白单独标注，
              未确认来源的声音用“未定角色音/OS候选”占位，交给后续统筹确认。
            </p>
          </div>
          <div className={styles.directionActions}>
            <button type="button" className={styles.primaryButton}>
              按这个方向执行
            </button>
            <button type="button" className={styles.ghostButton}>
              我要补充意见
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}
