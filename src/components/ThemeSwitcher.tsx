// components/ThemeSwitcher.tsx
// 放在标题栏右侧，3 个色球一键切换，不需要设置页面
import { useTheme } from '../themes/ThemeProvider';
import { allThemes } from '../themes/themes';

export function ThemeSwitcher() {
  const { themeId, setTheme } = useTheme();

  return (
    <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
      {Object.values(allThemes).map((t) => {
        const isActive = themeId === t.id;
        return (
          <button
            key={t.id}
            onClick={() => setTheme(t.id)}
            title={t.name}
            aria-label={`切换到${t.name}主题`}
            style={{
              width: 28,
              height: 28,
              borderRadius: '50%',
              background: t.preview.bg,
              border: isActive
                ? '2px solid var(--accent-primary)'
                : '2px solid transparent',
              cursor: 'pointer',
              padding: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'border-color 0.2s, transform 0.15s',
              boxShadow: isActive
                ? '0 0 0 2px var(--bg-base)'
                : 'none',
              transform: isActive ? 'scale(1.1)' : 'scale(1)',
              outline: 'none',
            }}
          >
            <span
              style={{
                width: 10,
                height: 10,
                borderRadius: '50%',
                background: t.preview.accent,
                display: 'block',
              }}
            />
          </button>
        );
      })}
    </div>
  );
}

// 可选：极简版 —— 单个按钮循环切换
export function ThemeCycleButton() {
  const { theme, cycleTheme } = useTheme();

  return (
    <button
      onClick={cycleTheme}
      title={`当前: ${theme.name}（点击切换）`}
      style={{
        width: 28,
        height: 28,
        borderRadius: '50%',
        background: theme.preview.bg,
        border: '2px solid var(--accent-primary)',
        cursor: 'pointer',
        padding: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'all 0.2s',
        outline: 'none',
      }}
    >
      <span
        style={{
          width: 10,
          height: 10,
          borderRadius: '50%',
          background: theme.preview.accent,
          display: 'block',
        }}
      />
    </button>
  );
}

