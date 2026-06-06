export interface Content {
  id: string | null;
  type: 'content';
  text: string;
  properties: string;
  discussions: Record<string, any>;
  comments: Record<string, any>;
  hash: number;
}

export default (id: string | null = null): Content => ({
  id,
  type: 'content',
  text: '\n',
  properties: '\n',
  discussions: {},
  comments: {},
  hash: 0,
});
