import type { RoleDetectPanelResult } from './roleDetect';
import { scriptStyles } from './styles';

export function ScriptRoleDetectPanel({
  result,
  onClose,
}: {
  result: RoleDetectPanelResult;
  onClose: () => void;
}) {
  return (
    <div style={scriptStyles.roleDetectPanel}>
      <div style={scriptStyles.polishHeader}>
        <div style={scriptStyles.polishHeaderTitle}>
          当前章识别结果
        </div>
        <button
          type="button"
          style={scriptStyles.polishActionBtn}
          onClick={onClose}
        >
          关闭
        </button>
      </div>

      <div style={scriptStyles.roleDetectMeta}>
        {result.chapterTitle || '当前章节'}
      </div>

      <div style={scriptStyles.polishLabel}>已识别角色</div>
      <div style={scriptStyles.roleDetectSection}>
        {result.recognizedRoles.length === 0 ? (
          <div style={scriptStyles.roleDetectEmpty}>本次没有识别出可确认角色。</div>
        ) : (
          result.recognizedRoles.map((role) => (
            <div key={role.name} style={scriptStyles.roleListChip(role.color, true)}>
              <span style={scriptStyles.roleListDot(role.color)} />
              <span>{role.name}</span>
            </div>
          ))
        )}
      </div>

      <div style={scriptStyles.polishLabel}>已归属对白</div>
      <div style={scriptStyles.roleDetectList}>
        {result.attributedLines.length === 0 ? (
          <div style={scriptStyles.roleDetectEmpty}>当前没有归属成功的对白。</div>
        ) : (
          result.attributedLines.map((line) => (
            <div key={`attr-${line.lineIndex}`} style={scriptStyles.roleDetectRow}>
              <div style={scriptStyles.roleDetectRowHeader}>
                <span style={scriptStyles.roleDetectSpeaker(line.confidence)}>{line.speaker}</span>
                <span style={scriptStyles.roleDetectConfidence}>{line.confidence}</span>
                <span style={scriptStyles.roleDetectLineIndex}>line {line.lineIndex + 1}</span>
              </div>
              <div style={scriptStyles.roleDetectText}>{line.text}</div>
            </div>
          ))
        )}
      </div>

      <div style={scriptStyles.polishLabel}>已排除结构化内容</div>
      <div style={scriptStyles.roleDetectList}>
        {result.structuredLines.length === 0 ? (
          <div style={scriptStyles.roleDetectEmpty}>当前没有判定为结构化记录的行。</div>
        ) : (
          result.structuredLines.map((line) => (
            <div key={`structured-${line.lineIndex}`} style={scriptStyles.roleDetectRow}>
              <div style={scriptStyles.roleDetectRowHeader}>
                <span style={scriptStyles.roleDetectSpeaker('medium')}>结构化记录</span>
                <span style={scriptStyles.roleDetectConfidence}>{line.label}</span>
                <span style={scriptStyles.roleDetectLineIndex}>line {line.lineIndex + 1}</span>
              </div>
              <div style={scriptStyles.roleDetectText}>{line.text}</div>
            </div>
          ))
        )}
      </div>

      <div style={scriptStyles.polishLabel}>碎片化角色音 / OS</div>
      <div style={scriptStyles.roleDetectList}>
        {result.voiceFragmentLines.length === 0 ? (
          <div style={scriptStyles.roleDetectEmpty}>当前没有识别到 OS 片段。</div>
        ) : (
          result.voiceFragmentLines.map((line) => (
            <div key={`voice-${line.lineIndex}`} style={scriptStyles.roleDetectRow}>
              <div style={scriptStyles.roleDetectRowHeader}>
                <span style={scriptStyles.roleDetectSpeaker('medium')}>OS片段</span>
                {line.speaker && <span style={scriptStyles.roleDetectConfidence}>{line.speaker}</span>}
                {!line.speaker && line.mentionedNames && line.mentionedNames.length > 0 && (
                  <span style={scriptStyles.roleDetectConfidence}>{line.mentionedNames.join(' / ')}</span>
                )}
                <span style={scriptStyles.roleDetectLineIndex}>line {line.lineIndex + 1}</span>
              </div>
              <div style={scriptStyles.roleDetectText}>{line.text}</div>
            </div>
          ))
        )}
      </div>

      <div style={scriptStyles.polishLabel}>待确认 / 未归属</div>
      <div style={scriptStyles.roleDetectList}>
        {result.unresolvedLines.length === 0 ? (
          <div style={scriptStyles.roleDetectEmpty}>当前候选对白都已完成归属。</div>
        ) : (
          result.unresolvedLines.map((line) => (
            <div key={`unresolved-${line.lineIndex}`} style={scriptStyles.roleDetectRow}>
              <div style={scriptStyles.roleDetectRowHeader}>
                <span style={scriptStyles.roleDetectSpeaker('low')}>待确认</span>
                <span style={scriptStyles.roleDetectLineIndex}>line {line.lineIndex + 1}</span>
              </div>
              <div style={scriptStyles.roleDetectText}>{line.text}</div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
