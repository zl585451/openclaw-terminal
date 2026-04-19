/**
 * ClarifyCard 澄清卡片系统 - 类型定义
 *
 * AMY 需要向用户收集结构化信息时，输出 [clarify_card] 标签；
 * 前端解析后弹出浮层，收集完信息后以 [澄清回执] 格式回发给 AMY。
 */

/** 字段类型 */
export type FieldType =
  | 'single'    // 单选（Type A 底层）
  | 'multi'     // 多选（多 checkbox）
  | 'text'      // 自由文本（Type C 底层）
  | 'confirm';  // 确认选项（仅 yes/no 风格）

/** 单个字段定义 */
export interface ClarifyField {
  /** 字段 ID，回执中作为 key */
  id: string;
  /** 字段显示名 */
  label: string;
  /** 字段类型 */
  type: FieldType;
  /** 选项列表（single/multi/confirm 必填） */
  options?: string[];
  /** 是否允许自填（Type A：末位追加"其他"项） */
  allow_custom?: boolean;
  /** 自填项的显示文字（默认"其他"） */
  custom_label?: string;
  /** 自填输入框占位符 */
  custom_placeholder?: string;
  /** 灵感提示（Type C：点击可一键填入文本框） */
  inspirations?: string[];
  /** text 类型的占位符 */
  placeholder?: string;
  /** 是否必填（默认 false，所有字段都可跳过） */
  required?: boolean;
}

/** 澄清卡片完整定义 */
export interface ClarifyCardSpec {
  /** 卡片标题（可选；InlineInquiry 渲染时每页用 field.label 作为标题，不依赖此字段） */
  title?: string;
  /** 可选副标题/说明 */
  subtitle?: string;
  /** 字段列表 */
  fields: ClarifyField[];
  /** 提交按钮文案（默认"提交"） */
  submit_label?: string;
  /** 跳过按钮文案（默认"跳过"） */
  skip_label?: string;
  /** 卡片子类型：normal（默认表单）| confirm（轻确认，用于越界场景） */
  variant?: 'normal' | 'confirm';
}

/** 单字段的回执值 */
export interface ClarifyFieldReply {
  fieldId: string;
  label: string;
  value: string | string[];
  /** 是否用户自填（用于 AMY 调整信任度） */
  isCustom: boolean;
}

/** 整张卡片的回执 */
export interface ClarifyReply {
  cardTitle: string;
  fields: ClarifyFieldReply[];
  skipped: boolean;
}
