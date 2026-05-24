export interface RenderBlockItem {
  id?: string;
  label: string;
  value?: string;
}

export type RenderBlock =
  | { type: 'markdown'; id?: string; content: string }
  | { type: 'code'; id?: string; language?: string; content: string }
  | { type: 'table'; id?: string; columns: string[]; rows: string[][] }
  | { type: 'tasklist'; id?: string; title?: string; prompt?: string; items: RenderBlockItem[] }
  | { type: 'pills'; id?: string; title?: string; prompt?: string; items: RenderBlockItem[] }
  | { type: 'checkbox'; id?: string; title?: string; prompt?: string; items: RenderBlockItem[] }
  | { type: 'question'; id?: string; title?: string; prompt?: string; items: RenderBlockItem[] }
  | { type: 'clarify_card'; id?: string; title?: string; fields: unknown[] }
  | { type: 'notice'; id?: string; variant?: 'info' | 'success' | 'warning' | 'error'; content: string };

