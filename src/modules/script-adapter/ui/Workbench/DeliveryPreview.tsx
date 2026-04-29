import { useState } from 'react';
import type {
  AdaptedScriptPayload,
  ArtifactEnvelope,
  DeliveryPackagePayload,
  PerformanceDesignPayload,
  ReviewReportPayload,
  TaskExecutionSheet,
  VoiceRoleMarkersPayload,
} from '../../types/execution';
import { exportDeliveryAsDocx, exportDeliveryAsMarkdown } from '../../services/exportClient';
import styles from '../../styles/scriptAdapter.module.css';

const CONCLUSION_LABEL: Record<string, string> = {
  pass: '可直接交付',
  pass_with_changes: '带条件交付',
  reject: '需返工',
};

interface DeliveryPreviewProps {
  sheet: TaskExecutionSheet;
}

export function DeliveryPreview({ sheet }: DeliveryPreviewProps) {
  const [copied, setCopied] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportingDocx, setExportingDocx] = useState(false);
  if (sheet.overallStatus !== 'completed') return null;

  const artifacts = Object.values(sheet.artifacts);
  const adapted = findArtifact<AdaptedScriptPayload>(artifacts, 'adapted_script');
  const voices = findArtifact<VoiceRoleMarkersPayload>(artifacts, 'voice_registry');
  const performance = findArtifact<PerformanceDesignPayload>(artifacts, 'performance_design');
  const review = findArtifact<ReviewReportPayload>(artifacts, 'review_report');
  const pack = findArtifact<DeliveryPackagePayload>(artifacts, 'final_package');
  const packagedAdapted = pack?.payload?.adapted_script;
  const packagedVoices = pack?.payload?.voice_markers || pack?.payload?.voice_registry;
  const packagedReview = pack?.payload?.basic_qc_report || pack?.payload?.review_report;
  const fullPackage = {
    versionTag: pack?.payload?.versionTag,
    adapted_script: packagedAdapted || adapted?.payload,
    voice_markers: packagedVoices || voices?.payload,
    performance_design: pack?.payload?.performance_design || performance?.payload,
    basic_qc_report: packagedReview || review?.payload,
    manifest: pack?.payload?.manifest,
    notes: pack?.payload?.notes,
  };

  const handleCopyAll = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(fullPackage, null, 2));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch (error: unknown) {
      window.alert(`复制失败：${error instanceof Error ? error.message : '未知错误'}`);
    }
  };

  const handleExportMarkdown = async () => {
    setExporting(true);
    try {
      const result = await exportDeliveryAsMarkdown(sheet);
      if (result.success) {
        window.alert(`已导出到：${result.filePath}`);
      } else if (result.error !== 'cancelled') {
        window.alert(`导出失败：${result.error || '未知错误'}`);
      }
    } finally {
      setExporting(false);
    }
  };

  const handleExportDocx = async () => {
    setExportingDocx(true);
    try {
      const result = await exportDeliveryAsDocx(sheet);
      if (result.success) {
        window.alert(`已导出到：${result.filePath}`);
      } else if (result.error !== 'cancelled') {
        window.alert(`导出失败：${result.error || '未知错误'}`);
      }
    } finally {
      setExportingDocx(false);
    }
  };

  const segments = packagedAdapted?.segments || adapted?.payload?.segments || [];
  const registry = packagedVoices?.registry || voices?.payload?.registry || [];
  const sfxCount = performance?.payload?.sfxList?.length || 0;
  const cvCount = performance?.payload?.cvDirections?.length || 0;
  const issueCount = packagedReview?.issues?.length || review?.payload?.issues?.length || 0;

  return (
    <section className={`${styles.card} ${styles.deliveryPreviewCard}`}>
      <header>
        <div>
          <span className={styles.workOrderKicker}>交付预览</span>
          <h3>{adapted?.payload?.chapterTitle || sheet.taskTitle || '本轮制作'} · 多人演播样章交付包</h3>
        </div>
        <code>{pack?.payload?.versionTag || '-'}</code>
      </header>

      <div className={styles.deliverySection}>
        <strong>改编台本预览</strong>
        <div className={styles.scriptPreviewScroll}>
          {segments.slice(0, 8).map((segment) => (
            <p key={segment.segmentId} className={styles[`scriptLine--${segment.type}`]}>
              <em>[{segment.speaker || (segment.type === 'narration' ? '旁白' : '内心')}]</em>
              {' '}{segment.text}
            </p>
          ))}
          {segments.length > 8 ? <small>还有 {segments.length - 8} 段,可在下方产物卡展开查看。</small> : null}
          {segments.length === 0 ? <small>暂无台本片段。</small> : null}
        </div>
      </div>

      <div className={styles.deliveryGrid}>
        <div>
          <strong>角色音({registry.length})</strong>
          <p>{registry.map((role) => role.roleName).join(' / ') || '-'}</p>
        </div>
        <div>
          <strong>演播设计</strong>
          <p>BGM:{performance?.payload?.bgmTrack?.mood || '-'} · SFX {sfxCount} 条 · CV {cvCount} 条</p>
        </div>
        <div>
          <strong>质检结论</strong>
          <p>{CONCLUSION_LABEL[packagedReview?.conclusion || review?.payload?.conclusion || ''] || '-'}({issueCount} 条问题)</p>
        </div>
      </div>

      <footer>
        <div className={styles.deliveryActions}>
          <button type="button" className={styles.confirmStartButton} onClick={handleExportDocx} disabled={exportingDocx}>
            {exportingDocx ? '导出中…' : '导出 Word DOCX'}
          </button>
          <button type="button" className={styles.confirmStartButton} onClick={handleExportMarkdown} disabled={exporting}>
            {exporting ? '导出中…' : '导出 Markdown'}
          </button>
          <button type="button" className={styles.ghostButton} onClick={handleCopyAll}>
            {copied ? '已复制完整 JSON' : '复制完整交付包 JSON'}
          </button>
        </div>
        <small>{pack?.payload?.notes || '交付包未生成完整 notes,请展开 final_package 查看。'}</small>
      </footer>
    </section>
  );
}

function findArtifact<T>(artifacts: ArtifactEnvelope[], type: string): ArtifactEnvelope<T> | undefined {
  return artifacts.find((artifact) => artifact.artifactType === type) as ArtifactEnvelope<T> | undefined;
}
