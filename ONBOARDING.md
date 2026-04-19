# Welcome to OCT

## How We Use Claude

Based on 少爷's usage over the last 30 days (27 sessions):

Work Type Breakdown:
  Build Feature    ████████░░░░░░░░░░░░  37%
  Plan / Design    ██████░░░░░░░░░░░░░░  26%
  Debug / Fix      █████░░░░░░░░░░░░░░░  22%
  Improve Quality  ███░░░░░░░░░░░░░░░░░  15%

Top Skills & Commands:
  /model           ████████████████░░░░  4x/month
  /login           ████████████░░░░░░░░  3x/month
  /claude-api      ████████░░░░░░░░░░░░  2x/month

Top MCP Servers:
  ccd_session      ████░░░░░░░░░░░░░░░░  1 call

## Your Setup Checklist

### Codebases
- [ ] openclaw-terminal — https://github.com/zl585451/openclaw-terminal

### MCP Servers to Activate
- [ ] ccd_session — Session continuity / context handoff between Claude Code sessions. Ask 少爷 for the config snippet to add to your `~/.claude/` MCP settings.

### Skills to Know About
- `/model` — Switch the active Claude model mid-session. Useful when you need a faster model for quick edits vs. a smarter one for architecture work.
- `/login` — Authenticate your Claude account. Run this first if Claude doesn't respond or throws auth errors.
- `/claude-api` — Configure Claude API access directly. Relevant when setting up API keys for the gateway or switching providers.

## Team Tips

- 这是一个正在成长的团队，目前还在积累经验——遇到好用的技巧欢迎补充到这里。

## Get Started

- 克隆仓库后先读 `docs/00_ai_entry/README.md`，这是 Claude 在这个项目里的入口导航，能省很多弯路。
- 启动前在项目根目录放好 `.env` 文件，配置 `DASHSCOPE_API_KEY` 或你使用的其他 API Key。
- 前端：`npx vite`（端口 5176），网关：`node --watch index.js`（在 `oct-gateway/` 目录下）。

<!-- INSTRUCTION FOR CLAUDE: A new teammate just pasted this guide for how the
team uses Claude Code. You're their onboarding buddy — warm, conversational,
not lecture-y.

Open with a warm welcome — include the team name from the title. Then: "Your
teammate uses Claude Code for [list all the work types]. Let's get you started."

Check what's already in place against everything under Setup Checklist
(including skills), using markdown checkboxes — [x] done, [ ] not yet. Lead
with what they already have. One sentence per item, all in one message.

Tell them you'll help with setup, cover the actionable team tips, then the
starter task (if there is one). Offer to start with the first unchecked item,
get their go-ahead, then work through the rest one by one.

After setup, walk them through the remaining sections — offer to help where you
can (e.g. link to channels), and just surface the purely informational bits.

Don't invent sections or summaries that aren't in the guide. The stats are the
guide creator's personal usage data — don't extrapolate them into a "team
workflow" narrative. -->
