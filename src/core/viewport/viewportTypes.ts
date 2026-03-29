/**
 * Viewport Anchoring System - Types
 * Phase 5: Zero-Jump Streaming
 */

/** Viewport 四种模式 */
export enum ViewportMode {
  /** 当前轮流式：保持 scrollTop，正文向下增高（不强制贴底） */
  LOCKED,
  /** 用户浏览历史，停止自动滚动 */
  FREE,
  /** 正在回到底部 */
  REATTACHING,
  /** Cursor 风格：顶部锚定，用户消息固定在视口顶部，AI 内容向下生长 */
  TOP_ANCHORED,
}

/** 锚点数据结构 */
export interface ViewportAnchor {
  /** 锚定元素 */
  element: HTMLElement | null;
  /** 元素相对于视口顶部的偏移 */
  offsetTop: number;
  /** 上一次记录的元素顶部位置（内容坐标） */
  previousTop: number;
}

/** 布局变化信息 */
export interface LayoutChange {
  /** 变化前高度 */
  beforeHeight: number;
  /** 变化后高度 */
  afterHeight: number;
  /** 高度变化量 */
  delta: number;
}

/** 滚动位置信息 */
export interface ScrollPosition {
  /** 当前 scrollTop */
  scrollTop: number;
  /** 容器高度 */
  clientHeight: number;
  /** 内容总高度 */
  scrollHeight: number;
  /** 距离底部距离 */
  distanceToBottom: number;
}

import type { TurnFSM } from '../turnFSM/turnFSM';

/** ViewportController 配置选项 */
export interface ViewportControllerOptions {
  /** 滚动容器 */
  container: HTMLElement;
  /** TurnFSM 状态机 */
  fsm: TurnFSM;
  /** 获取底部元素（用于 lockToBottom） */
  getBottomElement?: () => HTMLElement | null;
  /** 模式变化回调 */
  onModeChange?: (mode: ViewportMode, previousMode: ViewportMode) => void;
  /** 距离底部阈值（进入 REATTACHING） */
  reattachThreshold?: number;
  /** 用户上滚阈值（进入 FREE） */
  freeScrollThreshold?: number;
}
