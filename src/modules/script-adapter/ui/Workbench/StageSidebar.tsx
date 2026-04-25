import { useScriptAdapterStore } from '../../store/scriptAdapterStore';
import { scriptAdapterActions } from '../../store/actions';
import { StatusDot } from '../shared/StatusDot';
import styles from '../../styles/scriptAdapter.module.css';

function formatProjectType(sourceType: string, templateType: string): string {
  return `${sourceType} -> ${templateType}`;
}

export function StageSidebar() {
  const currentProjectId = useScriptAdapterStore((state) => state.currentProjectId);
  const project = useScriptAdapterStore((state) =>
    currentProjectId ? state.projects[currentProjectId] : null,
  );
  const stages = useScriptAdapterStore((state) =>
    currentProjectId ? state.stages[currentProjectId] ?? [] : [],
  );
  const chapters = useScriptAdapterStore((state) =>
    currentProjectId ? state.chapters[currentProjectId] ?? [] : [],
  );
  const selectedStageIdx = useScriptAdapterStore((state) => state.selectedStageIdx);
  const template = useScriptAdapterStore((state) =>
    project ? state.templates[project.templateId] : null,
  );

  if (!project || !currentProjectId) {
    return <div className={`${styles.card} ${styles.placeholderCard}`}>等待项目加载。</div>;
  }

  return (
    <aside className={styles.sidebar}>
      <div className={`${styles.card} ${styles.projectCard}`}>
        <div className={styles.projectCardTitle}>{project.name}</div>
        <div className={styles.projectCardMeta}>
          <div className={styles.projectCardItem}>
            <span className={styles.projectCardLabel}>章节数</span>
            <span className={styles.projectCardValue}>{project.meta.totalChapters}</span>
          </div>
          <div className={styles.projectCardItem}>
            <span className={styles.projectCardLabel}>总字数</span>
            <span className={styles.projectCardValue}>{project.meta.totalChars}</span>
          </div>
          <div className={styles.projectCardItem}>
            <span className={styles.projectCardLabel}>模板</span>
            <span className={styles.projectCardValue}>
              {template?.name ?? formatProjectType(project.sourceType, project.templateType)}
            </span>
          </div>
          <div className={styles.projectCardItem}>
            <span className={styles.projectCardLabel}>题材</span>
            <span className={styles.projectCardValue}>{project.meta.genre ?? '未设置'}</span>
          </div>
        </div>
      </div>

      <div className={`${styles.card} ${styles.chapterCard}`}>
        <div className={styles.sectionTitleSmall}>章节</div>
        <div className={styles.chapterList}>
          {chapters.slice(0, 8).map((chapter) => (
            <div
              key={chapter.id}
              className={`${styles.chapterItem} ${
                chapter.id === project.meta.currentChapterId ? styles.chapterItemActive : ''
              }`}
            >
              <span className={styles.chapterIndex}>第{chapter.index}章</span>
              <span className={styles.chapterName}>{chapter.title}</span>
            </div>
          ))}
        </div>
      </div>

      <div className={styles.stageList}>
        {stages.map((stage) => (
          <button
            key={stage.id}
            type="button"
            className={`${styles.stageItem} ${selectedStageIdx === stage.idx ? styles.stageItemActive : ''}`}
            onClick={() => scriptAdapterActions.selectStage(stage.idx)}
          >
            <span className={styles.stageIndex}>{stage.idx}</span>
            <StatusDot status={stage.status} />
            <span className={styles.stageName}>{stage.name}</span>
          </button>
        ))}
      </div>
    </aside>
  );
}
