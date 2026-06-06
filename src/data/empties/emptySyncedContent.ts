export interface SyncedContent {
  id: string | null;
  type: 'syncedContent';
  historyData: Record<string, any>;
  syncHistory: Record<string, any>;
  v: number;
  hash: number;
}

export default (id: string | null = null): SyncedContent => ({
  id,
  type: 'syncedContent',
  historyData: {},
  syncHistory: {},
  v: 0,
  hash: 0,
});
