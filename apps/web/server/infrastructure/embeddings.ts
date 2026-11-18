import { homedir } from 'node:os';
import { join } from 'node:path';
import type { EmbeddingProvider } from '../services/embeddings';

export const DEFAULT_EMBEDDING_MODEL = 'Xenova/multilingual-e5-small';

type Extractor = (text: string, options: { pooling: 'mean'; normalize: boolean }) => Promise<{ data: Float32Array }>;

/**
 * Local embeddings with transformers.js (ONNX on CPU): no API key, no content sent to a third party.
 * multilingual-e5-small expects "query: " / "passage: " prefixes. The model (~120 MB) is downloaded once
 * into DEVSYNC_MODELS_DIR (default ~/.cache/devsync-models).
 */
export function createLocalEmbeddings(model = process.env.EMBEDDING_MODEL ?? DEFAULT_EMBEDDING_MODEL): EmbeddingProvider {
  let extractor: Promise<Extractor> | undefined;
  const load = () => {
    extractor ??= (async () => {
      const transformers = await import('@huggingface/transformers');
      transformers.env.cacheDir = process.env.DEVSYNC_MODELS_DIR ?? join(homedir(), '.cache', 'devsync-models');
      try {
        return (await transformers.pipeline('feature-extraction', model, { dtype: 'q8' })) as unknown as Extractor;
      } catch (error) {
        // onnxruntime-node ships no binary for some platforms (e.g. Intel Macs): use WebAssembly instead.
        if (!String((error as Error).message).includes('onnxruntime')) throw error;
        return (await transformers.pipeline('feature-extraction', model, { dtype: 'q8', device: 'wasm' })) as unknown as Extractor;
      }
    })();
    return extractor;
  };
  const embed = async (text: string) => {
    const output = await (await load())(text, { pooling: 'mean', normalize: true });
    return Array.from(output.data);
  };
  return {
    model,
    dimensions: 384,
    embedQuery: (text) => embed(`query: ${text}`),
    embedPassage: (text) => embed(`passage: ${text}`),
  };
}
