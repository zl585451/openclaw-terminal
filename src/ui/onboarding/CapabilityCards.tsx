import React from 'react'

export interface CardDef {
  id: string
  icon: string
  title: string
  prompt: string
  capabilityId: string
}

export const DEFAULT_CARDS: CardDef[] = [
  {
    id: 'chat',
    icon: '\u{1F4AC}',
    title: '对话',
    prompt: '帮我写一段悬疑广播剧的开头,氛围阴冷',
    capabilityId: 'chat',
  },
  {
    id: 'task',
    icon: '\u{1F3C3}',
    title: '跑腿',
    prompt: '帮我搜一下今天的 AI 新闻,整理成要点',
    capabilityId: 'background_task',
  },
  {
    id: 'canvas',
    icon: '\u{1F4CA}',
    title: '画布',
    prompt: '给我画一个桌面 AI 应用的架构流程图',
    capabilityId: 'canvas',
  },
  {
    id: 'image',
    icon: '\u{1F5BC}',
    title: '生图',
    prompt: '生成一张赛博朋克风格的终端海报',
    capabilityId: 'image_gen',
  },
]

interface Props {
  onCardClick: (prompt: string, capabilityId: string) => void
  cards?: CardDef[]
}

export const CapabilityCards: React.FC<Props> = ({
  onCardClick,
  cards = DEFAULT_CARDS,
}) => {
  return (
    <div className="oct-cap-cards">
      {cards.map(card => (
        <button
          key={card.id}
          className="oct-cap-card"
          onClick={() => onCardClick(card.prompt, card.capabilityId)}
          type="button"
        >
          <div className="oct-cap-card-icon">{card.icon}</div>
          <div className="oct-cap-card-title">{card.title}</div>
          <div className="oct-cap-card-prompt">{card.prompt}</div>
        </button>
      ))}
    </div>
  )
}
