import type { WorkbenchCommand, WorkbenchRoundtripContext } from './types';

type CommandListener = (command: WorkbenchCommand) => void;
type ContextGetter = (intent?: WorkbenchRoundtripContext['intent']) => WorkbenchRoundtripContext;

class WorkbenchBus {
  private listeners = new Set<CommandListener>();
  private contextGetter: ContextGetter = (intent = 'continue') => ({
    intent,
    activeDocumentId: null,
    activeDocument: null,
    documents: [],
  });

  dispatch(command: WorkbenchCommand) {
    this.listeners.forEach((listener) => listener(command));
  }

  subscribe(listener: CommandListener) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  setContextGetter(getter: ContextGetter) {
    this.contextGetter = getter;
  }

  getContext(intent: WorkbenchRoundtripContext['intent'] = 'continue') {
    return this.contextGetter(intent);
  }
}

export const workbenchBus = new WorkbenchBus();
