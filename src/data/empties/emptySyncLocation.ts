export interface SyncLocation {
  id: string | null;
  type: 'syncLocation';
  providerId: string | null;
  fileId: string | null;
  hash: number;
}

export default (id: string | null = null): SyncLocation => ({
  id,
  type: 'syncLocation',
  providerId: null,
  fileId: null,
  hash: 0,
});
