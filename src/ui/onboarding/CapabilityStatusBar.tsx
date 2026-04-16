import React from 'react'
import { useCapabilities } from '../../hooks/useCapabilities'
import { CapabilityId } from '../../core/capabilities/types'

const CAPS: Array<{id: CapabilityId, label: string}> = [
  { id: 'chat', label: '对话' }, { id: 'canvas', label: '画布' },
  { id: 'background_task', label: '后台任务' }, { id: 'image_gen', label: '生图' },
  { id: 'web_search', label: '联网搜索' },
]

interface Props { onRequestSetup: (capabilityId: CapabilityId) => void }

export const CapabilityStatusBar: React.FC<Props> = ({ onRequestSetup }) => {
  const { getCapability } = useCapabilities()
  const available = CAPS.filter(c => getCapability(c.id).status === 'available')
  const missing = CAPS.filter(c => getCapability(c.id).status === 'missing_key')
  return (
    <div className="oct-cap-status-bar">
      {available.length > 0 && <div className="oct-cap-status-line available"><span className="oct-cap-dot available">●</span><span>已就绪 · {available.map(c => c.label).join(' / ')}</span></div>}
      {missing.length > 0 && <div className="oct-cap-status-line missing"><span className="oct-cap-dot missing">○</span><span>未配置: {missing.map(c => c.label).join(' / ')}</span><button className="oct-cap-status-action" onClick={() => onRequestSetup(missing[0].id)} type="button">开启 →</button></div>}
    </div>
  )
}
