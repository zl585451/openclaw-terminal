/** 时间格式化工具 */

/** HH:mm 格式 */
export const formatTime = (timestamp: string | number | null | undefined): string => {
  if (timestamp === undefined || timestamp === null) return '';
  const d = new Date(timestamp);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
};

/** 完整日期时间 */
export const formatFullTime = (timestamp: string | number | undefined): string => {
  if (timestamp === undefined || timestamp === null) return '';
  const d = new Date(timestamp);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleString('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
};

/** 适配 OmniRoute 的格式 (HH:mm:ss) */
export const formatTimestamp = (ts: number): string => {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
};

/** TaskBoard 用的日期显示 (YYYY-MM-DD 周X) */
export const formatDateDisplay = (dateStr: string): string => {
  const d = new Date(dateStr);
  const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const wd = weekdays[d.getDay()];
  return `${y}-${m}-${day} ${wd}`;
};
