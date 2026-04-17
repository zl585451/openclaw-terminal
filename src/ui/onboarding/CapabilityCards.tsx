import React from 'react'
import { useCapabilities } from '../../hooks/useCapabilities'
import { CapabilityId, CapabilityStatus } from '../../core/capabilities/types'

export type CardAction =
  | { type: 'send_prompt'; prompt: string }
  | { type: 'open_panel'; panelId: 'image_studio'; prefill?: string }

export interface CardDef {
  id: string
  icon: string
  title: string
  subtitle: string
  capabilityId: CapabilityId
  action: CardAction
}

export const DEFAULT_CARDS: CardDef[] = [
  {
    id: 'chat',
    icon: '\u{1F4AC}',
    title: '对话',
    subtitle: '写故事、问问题、让 AI 帮你思考',
    capabilityId: 'chat',
    action: { type: 'send_prompt', prompt: '帮我写一段悬疑广播剧的开头,氛围阴冷' },
  },
  {
    id: 'task',
    icon: '\u{1F3C3}',
    title: '跑腿',
    subtitle: '搜资料、查新闻、后台自动执行',
    capabilityId: 'background_task',
    action: { type: 'send_prompt', prompt: '帮我搜一下今天的 AI 新闻,整理成要点' },
  },
  {
    id: 'canvas',
    icon: '\u{1F4CA}',
    title: '画布',
    subtitle: '图表、流程图、结构化产物',
    capabilityId: 'canvas',
    action: { type: 'send_prompt', prompt: '给我画一个桌面 AI 应用的架构流程图' },
  },
  {
    id: 'image',
    icon: '\u{1F5BC}\uFE0F',
    title: '生图',
    subtitle: '输入描述，生成你想要的画面',
    capabilityId: 'image_gen',
    action: {
      type: 'open_panel',
      panelId: 'image_studio',
      prefill: '赛博朋克风格的终端海报，暗色调，霓虹灯光',
    },
  },
]

interface Props {
  onAction: (card: CardDef, capabilityStatus: CapabilityStatus) => void
  onRequestSetup: (capabilityId: CapabilityId, afterSetup: () => void) => void
  cards?: CardDef[]
}

export const CapabilityCards: React.FC<Props> = ({ onAction, onRequestSetup, cards = DEFAULT_CARDS }) => {
  const { getCapability } = useCapabilities()
  const handleClick = (card: CardDef) => {
    const cap = getCapability(card.capabilityId)
    if (cap.status === 'available') {
      onAction(card, cap.status)
      return
    }
    if (cap.status === 'missing_key') {
      if (card.action.type === 'open_panel') {
        // 面板型能力在缺配置时交给上层做“可解释提示”，避免用户点了没反应
        onAction(card, cap.status)
        return
      }
      onRequestSetup(card.capabilityId, () => onAction(card, 'available'))
      return
    }
    onAction(card, cap.status)
  }
  return (
    <div className="oct-cap-cards">
      {cards.map(card => {
        const needsSetup = getCapability(card.capabilityId).status === 'missing_key'
        return (
          <button
            key={card.id}
            className={`oct-cap-card ${needsSetup ? 'needs-setup' : ''}`}
            onClick={() => handleClick(card)}
            data-action={card.action.type}
            type="button"
          >
            <div className="oct-cap-card-icon">{card.icon}</div>
            <div className="oct-cap-card-title">{card.title}</div>
            <div className="oct-cap-card-prompt">{card.subtitle}</div>
            {card.action.type === 'open_panel' && !needsSetup && (
              <div className="oct-cap-card-hint">打开工作台 →</div>
            )}
            {needsSetup && <div className="oct-cap-card-hint">需先开通 →</div>}
          </button>
        )
      })}
    </div>
  )
}
