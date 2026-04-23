import { scriptStyles } from './styles';
import type { ScriptCharacterProfile } from '../../../workbench/types';

export function ScriptCharacterBar({
  roleLibrary,
  currentChapterRoleNames,
  roleListOpen,
  onToggleRoleList,
  roleDetectStatus,
  isDetectingRoles,
  onDetectRoles,
  formatStatus,
  isFormatting,
  onAIFormat,
  contentFontSize,
  onDecreaseFontSize,
  onIncreaseFontSize,
  selectedText,
  isPolishing,
  onPolish,
  replaceHistoryLength,
  onUndoLastApply,
}: {
  roleLibrary: ScriptCharacterProfile[];
  currentChapterRoleNames: string[];
  roleListOpen: boolean;
  onToggleRoleList: () => void;
  roleDetectStatus: string;
  isDetectingRoles: boolean;
  onDetectRoles: () => void;
  formatStatus: string;
  isFormatting: boolean;
  onAIFormat: () => void;
  contentFontSize: number;
  onDecreaseFontSize: () => void;
  onIncreaseFontSize: () => void;
  selectedText: string;
  isPolishing: boolean;
  onPolish: () => void;
  replaceHistoryLength: number;
  onUndoLastApply: () => void;
}) {
  const currentRoleSet = new Set(currentChapterRoleNames);

  return (
    <div style={scriptStyles.characterBarStack}>
      <div style={scriptStyles.characterBar}>
        <div style={scriptStyles.characterBarRight}>
          {roleDetectStatus && (
            <span style={scriptStyles.formatStatusText} title={roleDetectStatus}>{roleDetectStatus}</span>
          )}
          {formatStatus && (
            <span style={scriptStyles.formatStatusText} title={formatStatus}>{formatStatus}</span>
          )}
          <button
            type="button"
            style={scriptStyles.polishToolbarButton(roleLibrary.length === 0)}
            onClick={onToggleRoleList}
            disabled={roleLibrary.length === 0}
            title={roleLibrary.length > 0 ? '查看当前文档已识别角色列表' : '先识别当前章角色'}
          >
            {roleListOpen ? '隐藏角色列表' : `角色列表 (${roleLibrary.length})`}
          </button>
          <button
            type="button"
            style={scriptStyles.polishToolbarButton(isDetectingRoles)}
            onClick={onDetectRoles}
            disabled={isDetectingRoles}
            title="只识别当前章节里的对话角色，并把结果加入当前文档角色库"
          >
            {isDetectingRoles ? '识别中...' : '识别当前章角色'}
          </button>
          <button
            type="button"
            style={scriptStyles.polishToolbarButton(isFormatting)}
            onClick={onAIFormat}
            disabled={isFormatting}
            title="使用 AI 仅对当前章节做格式规范化（只改缓存副本）"
          >
            {isFormatting ? '格式化中...' : '🔄 AI 格式化当前章'}
          </button>
          <div style={scriptStyles.fontSizeGroup}>
            <button
              type="button"
              style={scriptStyles.polishToolbarButton(contentFontSize <= 13)}
              onClick={onDecreaseFontSize}
              disabled={contentFontSize <= 13}
              title="减小正文字号"
            >
              A-
            </button>
            <span style={scriptStyles.fontSizeValue}>{contentFontSize}px</span>
            <button
              type="button"
              style={scriptStyles.polishToolbarButton(contentFontSize >= 24)}
              onClick={onIncreaseFontSize}
              disabled={contentFontSize >= 24}
              title="增大正文字号"
            >
              A+
            </button>
          </div>
          <button
            type="button"
            style={scriptStyles.polishToolbarButton(!selectedText || isPolishing)}
            onClick={onPolish}
            disabled={!selectedText || isPolishing}
            title={selectedText ? '打开当前选区的编辑面板' : '请先在正文中选中文本'}
          >
            {isPolishing ? '润色中...' : '打开编辑面板'}
          </button>
          <button
            type="button"
            style={scriptStyles.polishToolbarButton(replaceHistoryLength === 0)}
            onClick={onUndoLastApply}
            disabled={replaceHistoryLength === 0}
            title={replaceHistoryLength > 0 ? '撤销最近一次“应用到原文”' : '暂无可撤销的替换'}
          >
            撤销替换
          </button>
        </div>
      </div>

      {roleListOpen && (
        <div style={scriptStyles.roleListPanel}>
          {roleLibrary.length === 0 ? (
            <div style={scriptStyles.roleListEmpty}>当前还没有识别到角色。</div>
          ) : (
            roleLibrary.map((role) => {
              const isCurrent = currentRoleSet.has(role.name);
              return (
                <div
                  key={role.name}
                  style={scriptStyles.roleListChip(role.color, isCurrent)}
                  title={isCurrent ? '当前章节命中此角色' : '已在角色库中，但当前章节未命中'}
                >
                  <span style={scriptStyles.roleListDot(role.color)} />
                  <span>{role.name}</span>
                  {isCurrent && <span style={scriptStyles.roleListBadge}>当前章</span>}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
