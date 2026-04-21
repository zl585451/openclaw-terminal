/// <reference types="vite/client" />

import type { ElectronAPI, ElectronRequire } from './types/electronAPI';

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
    require?: ElectronRequire;
  }
}

export {};
