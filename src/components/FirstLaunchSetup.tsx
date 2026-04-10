import './FirstLaunchSetup.css';

interface FirstLaunchSetupProps {
  onOpenSettings: () => void;
  onDismiss: () => void;
}

export default function FirstLaunchSetup({ onOpenSettings, onDismiss }: FirstLaunchSetupProps) {
  return (
    <div className="first-launch-overlay">
      <div className="first-launch-card">
        <div className="first-launch-kicker">WELCOME TO OCT</div>
        <h2 className="first-launch-title">先完成一次连接配置，就能开始对话和自动执行。</h2>
        <p className="first-launch-copy">
          推荐先申请一个 <strong>DeepSeek API Key</strong>，接入快、门槛低，适合作为安装后的首个默认服务商。
          如果你已经有阿里云百炼、MiniMax 或硅基流动，也可以直接填自己的 Key。
        </p>

        <div className="first-launch-steps">
          <div className="first-launch-step">
            <span className="first-launch-step-index">1</span>
            <div>
              <div className="first-launch-step-title">推荐先申请 DeepSeek Key</div>
              <div className="first-launch-step-copy">在设置页选择 `DeepSeek`，填写 `deepseek-chat` 或 `deepseek-reasoner` 即可开始。</div>
            </div>
          </div>
          <div className="first-launch-step">
            <span className="first-launch-step-index">2</span>
            <div>
              <div className="first-launch-step-title">保存后 OCT 会自动重启 Gateway</div>
              <div className="first-launch-step-copy">不需要手动折腾环境变量，保存后会自动连上。</div>
            </div>
          </div>
          <div className="first-launch-step">
            <span className="first-launch-step-index">3</span>
            <div>
              <div className="first-launch-step-title">发图和图片生成需要额外能力</div>
              <div className="first-launch-step-copy">图片理解优先走视觉链路，图片生成默认走阿里云百炼/通义万象。</div>
            </div>
          </div>
        </div>

        <div className="first-launch-links">
          <a href="https://platform.deepseek.com/" target="_blank" rel="noreferrer">申请 DeepSeek Key</a>
          <a href="https://bailian.console.aliyun.com/" target="_blank" rel="noreferrer">阿里云百炼</a>
          <a href="https://platform.minimaxi.com/docs/token-plan/intro" target="_blank" rel="noreferrer">MiniMax</a>
        </div>

        <div className="first-launch-actions">
          <button type="button" className="first-launch-btn first-launch-btn-ghost" onClick={onDismiss}>
            稍后再说
          </button>
          <button type="button" className="first-launch-btn first-launch-btn-primary" onClick={onOpenSettings}>
            现在去配置
          </button>
        </div>
      </div>
    </div>
  );
}
