import type { BatchEstimate } from '../types/batch';
import type { LibraryChapter } from './aiLibraryClient';

const COST_SCRIPT = 0.07;
const COST_VOICE = 0.03;
const COST_REVIEW = 0.03;
const CV_SURCHARGE = 0.02;
const BGM_SFX_SURCHARGE = 0.03;

export function estimateBatchCost(
  chapters: LibraryChapter[],
  selectedChapterIndices: number[],
  options: {
    includeVoiceRegistry: boolean;
    includeQualityReview: boolean;
    includeCvDirections: boolean;
    includeBgmSfx: boolean;
  },
): BatchEstimate {
  const selected = chapters.filter((chapter) => selectedChapterIndices.includes(chapter.chapter_index));
  const chapterCount = selected.length;
  const totalChars = selected.reduce((sum, chapter) => sum + Number(chapter.char_count || 0), 0);
  const basePerChapter = COST_SCRIPT
    + (options.includeVoiceRegistry ? COST_VOICE : 0)
    + (options.includeQualityReview ? COST_REVIEW : 0);
  const baseCostCny = Number((chapterCount * basePerChapter).toFixed(2));
  const cvCostCny = Number((chapterCount * (options.includeCvDirections ? CV_SURCHARGE : 0)).toFixed(2));
  const bgmSfxCostCny = Number((chapterCount * (options.includeBgmSfx ? BGM_SFX_SURCHARGE : 0)).toFixed(2));
  const estimatedCostCny = Number((baseCostCny + cvCostCny + bgmSfxCostCny).toFixed(2));
  const estimatedDurationMinutes = Math.max(
    1,
    Math.ceil(chapterCount * (1 + (options.includeCvDirections ? 0.15 : 0) + (options.includeBgmSfx ? 0.2 : 0))),
  );
  const warnings: string[] = [];

  if (chapterCount > 50) warnings.push('批次较大，建议先跑 5 章样章再扩量。');
  if (selected.some((chapter) => Number(chapter.char_count || 0) > 12000)) {
    warnings.push('已包含超长章节，建议优先确认这些章节是否需要单独处理。');
  }
  if (options.includeCvDirections && chapterCount > 10) {
    warnings.push('已开启 CV 演播指导，费用与耗时会增加。');
  }
  if (options.includeBgmSfx && chapterCount > 5) {
    warnings.push('已开启 BGM/SFX 建议，建议先确认台本质量后再批量生成。');
  }

  return {
    chapterCount,
    totalChars,
    estimatedDurationMinutes,
    estimatedCostCny,
    baseCostCny,
    cvCostCny,
    bgmSfxCostCny,
    warnings,
  };
}
