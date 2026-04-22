import type React from 'react';
import { DEFAULT_CHARACTER_COLORS } from '../../../utils/characterExtractor';
import { scriptStyles } from './styles';

export function ScriptCharacterBar({
  characters,
  selectedCharacters,
  editingCharacter,
  effectiveColors,
  pickerContainerRef,
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
  onClearCharacterFilter,
  onToggleCharacterFilter,
  onToggleEditingCharacter,
  onChangeCharacterColor,
}: {
  characters: string[];
  selectedCharacters: Set<string>;
  editingCharacter: string | null;
  effectiveColors: Record<string, string>;
  pickerContainerRef: React.RefObject<HTMLDivElement | null>;
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
  onClearCharacterFilter: () => void;
  onToggleCharacterFilter: (name: string) => void;
  onToggleEditingCharacter: (name: string) => void;
  onChangeCharacterColor: (name: string, color: string) => void;
}) {
  if (characters.length === 0) return null;

  return (
    <div style={scriptStyles.characterBar}>
      <div style={scriptStyles.characterBarLeft}>
        <span
          style={scriptStyles.filterAllChip(selectedCharacters.size === 0)}
          onClick={(e) => {
            e.stopPropagation();
            onClearCharacterFilter();
          }}
          title="清除筛选，显示全部角色"
        >
          全部
        </span>

        {characters.map((name) => {
          const chipColor = effectiveColors[name] || 'var(--text-secondary)';
          const isEditing = editingCharacter === name;
          const isSelected = selectedCharacters.has(name);
          const isDimmed = selectedCharacters.size > 0 && !isSelected;

          return (
            <span
              key={name}
              style={scriptStyles.characterChipInteractive(chipColor, {
                selected: isSelected,
                dimmed: isDimmed,
                editing: isEditing,
              })}
              onClick={(e) => {
                e.stopPropagation();
                onToggleCharacterFilter(name);
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onToggleEditingCharacter(name);
              }}
              title="左键：筛选角色；右键：修改颜色"
            >
              {name}
              {isEditing && (
                <div
                  ref={pickerContainerRef as React.RefObject<HTMLDivElement>}
                  style={scriptStyles.colorPickerPopover}
                  onClick={(e) => e.stopPropagation()}
                >
                  {DEFAULT_CHARACTER_COLORS.map((color) => (
                    <button
                      key={`${name}-${color}`}
                      type="button"
                      style={scriptStyles.colorOptionBtn(color, chipColor === color)}
                      onClick={() => onChangeCharacterColor(name, color)}
                      aria-label={`将 ${name} 颜色设为 ${color}`}
                      title={color}
                    />
                  ))}
                </div>
              )}
            </span>
          );
        })}
      </div>

      <div style={scriptStyles.characterBarRight}>
        {formatStatus && (
          <span style={scriptStyles.formatStatusText} title={formatStatus}>{formatStatus}</span>
        )}
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
          title={selectedText ? '对当前选中文本进行 AI 润色' : '请先在正文中选中文本'}
        >
          {isPolishing ? '润色中...' : '✨ AI 润色'}
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
  );
}
