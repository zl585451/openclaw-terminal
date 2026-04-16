import type { WorkbenchCommand, WorkbenchRoundtripContext } from './types';

type CommandListener = (command: WorkbenchCommand) => void;
type ContextGetter = (intent?: WorkbenchRoundtripContext['intent']) => WorkbenchRoundtripContext;

/**
 * 由 WorkbenchPanel 内部组件发出，由 chat 侧监听并转化为 sendMessage 调用。
 */
export interface WorkbenchSendRequest {
  text: string;
  intent?: WorkbenchRoundtripContext['intent'];
}

type SendRequestListener = (request: WorkbenchSendRequest) => void;

class WorkbenchBus {
  private listeners = new Set<CommandListener>();
  private sendListeners = new Set<SendRequestListener>();
  private contextGetter: ContextGetter = (intent = 'continue') => ({
    intent,
    activeDocumentId: null,
    activeDocument: null,
    documents: [],
  });

  // ── 文档命令通道（已有，保持原样）──────────────────────────────
  dispatch(command: WorkbenchCommand) {
    this.listeners.forEach((listener) => listener(command));
  }

  subscribe(listener: CommandListener) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  // ── 回环上下文（已有，保持原样）────────────────────────────────
  setContextGetter(getter: ContextGetter) {
    this.contextGetter = getter;
  }

  getContext(intent: WorkbenchRoundtripContext['intent'] = 'continue') {
    return this.contextGetter(intent);
  }

  // ── 发送请求通道（本次新增）────────────────────────────────────
  /**
   * 由 WorkbenchPanel 内 UI（如 DocumentAppendBar）调用。
   * Chat 侧通过 subscribeSendRequest 监听后转 sendMessage。
   */
  requestSendMessage(request: WorkbenchSendRequest) {
    this.sendListeners.forEach((listener) => listener(request));
  }

  subscribeSendRequest(listener: SendRequestListener) {
    this.sendListeners.add(listener);
    return () => {
      this.sendListeners.delete(listener);
    };
  }
}

export const workbenchBus = new WorkbenchBus();
