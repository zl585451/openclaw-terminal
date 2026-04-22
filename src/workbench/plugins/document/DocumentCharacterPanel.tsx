import { documentWorkbenchStyles } from './styles';

export interface DocumentCharacterItem {
  name: string;
  count: number;
  color: string;
  firstChapterId: string | null;
}

export function DocumentCharacterPanel({
  characters,
  activeCharacter,
  onSelectCharacter,
  collapsed,
  onToggleCollapsed,
}: {
  characters: DocumentCharacterItem[];
  activeCharacter: string | null;
  onSelectCharacter: (name: string) => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
}) {
  if (collapsed) {
    return (
      <aside style={documentWorkbenchStyles.asideCollapsed}>
        <button
          type="button"
          style={documentWorkbenchStyles.railButton}
          onClick={onToggleCollapsed}
          title="展开角色侧栏"
        >
          角色
        </button>
      </aside>
    );
  }

  return (
    <aside style={documentWorkbenchStyles.aside}>
      <div style={documentWorkbenchStyles.asideBlock}>
        <div style={documentWorkbenchStyles.asideTitle}>角色侧栏</div>
        <button
          type="button"
          style={documentWorkbenchStyles.railButton}
          onClick={onToggleCollapsed}
          title="收起角色侧栏"
        >
          收起
        </button>
        {characters.length === 0 ? (
          <div style={documentWorkbenchStyles.emptyText}>
            当前文档还没有识别出稳定角色。后续我们可以继续加强小说正文的人名抽取规则。
          </div>
        ) : (
          characters.map((character) => (
            <button
              key={character.name}
              type="button"
              style={documentWorkbenchStyles.characterItem(activeCharacter === character.name)}
              onClick={() => onSelectCharacter(character.name)}
              title={character.firstChapterId ? '点击跳转到该角色首次出现章节' : character.name}
            >
              <span style={documentWorkbenchStyles.characterDot(character.color)} />
              <span style={documentWorkbenchStyles.characterName}>{character.name}</span>
              <span style={documentWorkbenchStyles.characterCount}>{character.count}</span>
            </button>
          ))
        )}
      </div>
    </aside>
  );
}
