// Manual check: `pnpm exec tsx tests/manual/embeddings-smoke.ts` (downloads the model the first time).
import { createLocalEmbeddings } from '../../server/infrastructure/embeddings';

const provider = createLocalEmbeddings();
const cos = (a: number[], b: number[]) => a.reduce((s, x, i) => s + x * b[i]!, 0);
const t0 = Date.now();
const doc = await provider.embedPassage('Payment amounts are integers in cents; currency is EUR or XAF. An Idempotency-Key header is required.');
const other = await provider.embedPassage('The login page uses a dark theme with a purple accent color.');
const query = await provider.embedQuery('comment formater le montant d’un paiement ?');
console.log({ dims: doc.length, loadAndEmbedMs: Date.now() - t0, related: cos(query, doc).toFixed(3), unrelated: cos(query, other).toFixed(3) });
