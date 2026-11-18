/** Text → vector port. Implementations must return L2-normalized vectors of `dimensions` length. */
export interface EmbeddingProvider {
  readonly model: string;
  readonly dimensions: number;
  embedQuery(text: string): Promise<number[]>;
  embedPassage(text: string): Promise<number[]>;
}

/** Text embedded for a knowledge item: title and summary first, content truncated. */
export function passageText(item: {
  title: string;
  summary?: string | null;
  content: string;
  tags?: string[];
}): string {
  return [
    item.title,
    item.summary ?? '',
    item.tags?.length ? `Tags: ${item.tags.join(', ')}` : '',
    item.content,
  ]
    .filter(Boolean)
    .join('\n')
    .slice(0, 4000);
}

export const toVectorLiteral = (vector: number[]): string =>
  `[${vector.map((v) => (Number.isFinite(v) ? v.toFixed(6) : '0')).join(',')}]`;
