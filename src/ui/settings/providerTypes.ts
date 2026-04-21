/**
 * 设置面板与网关 provider 列表的共享类型（单一来源）。
 */

export interface ProviderModelOption {
  id: string;
  label: string;
  tools: boolean;
  thinking: boolean;
  /** 高级面板「自定义模型」行等 */
  custom?: boolean;
}

export interface ProviderEntry {
  id: string;
  name: string;
  baseUrl: string;
  keyLink: string;
  keyPlaceholder: string;
  defaultModel: string;
  models: ProviderModelOption[];
  allowCustomModel?: boolean;
}

export type ProvidersState = Record<string, ProviderEntry>;
