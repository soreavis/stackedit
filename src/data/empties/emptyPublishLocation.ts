export interface PublishLocation {
  id: string | null;
  type: 'publishLocation';
  providerId: string | null;
  fileId: string | null;
  templateId: string | null;
  hash: number;
}

export default (id: string | null = null): PublishLocation => ({
  id,
  type: 'publishLocation',
  providerId: null,
  fileId: null,
  templateId: null,
  hash: 0,
});
