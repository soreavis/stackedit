// Core sync wire shapes — the minimal surfaces the sync engine touches.
// Providers return arbitrary additional fields (read via `any` at the
// call site); these interfaces type only what syncSvc itself relies on.

export interface SyncData {
  id: string;
  itemId?: string;
  type?: string;
  hash?: number;
  parentIds?: string[];
}

export interface ChangeItem {
  id: string;
  type?: string;
  hash?: number;
  [key: string]: unknown;
}

export interface Change {
  fileId?: string;
  syncDataId: string;
  syncData?: SyncData;
  item?: ChangeItem;
  file?: { name?: string; [key: string]: unknown };
}

export interface SyncedContent {
  id: string;
  v?: number;
  historyData: Record<string, ChangeItem>;
  syncHistory: Record<string, number[]>;
  [key: string]: unknown;
}
