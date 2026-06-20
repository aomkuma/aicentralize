type NumericVector = number[];

const DIM = 12;

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\u0E00-\u0E7F\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function hashToken(token: string): number {
  let hash = 0;
  for (let i = 0; i < token.length; i += 1) {
    hash = (hash * 31 + token.charCodeAt(i)) >>> 0;
  }
  return hash;
}

export function buildEmbedding(text: string): NumericVector {
  const vec = new Array<number>(DIM).fill(0);
  const tokens = tokenize(text);
  if (!tokens.length) {
    return vec;
  }

  for (const token of tokens) {
    const idx = hashToken(token) % DIM;
    vec[idx] += 1;
  }

  const mag = Math.sqrt(vec.reduce((sum, n) => sum + n * n, 0));
  if (mag === 0) {
    return vec;
  }

  return vec.map((n) => n / mag);
}

export function cosineSimilarity(a: NumericVector, b: NumericVector): number {
  const len = Math.min(a.length, b.length);
  let dot = 0;
  let ma = 0;
  let mb = 0;

  for (let i = 0; i < len; i += 1) {
    dot += a[i] * b[i];
    ma += a[i] * a[i];
    mb += b[i] * b[i];
  }

  if (ma === 0 || mb === 0) {
    return 0;
  }
  return dot / (Math.sqrt(ma) * Math.sqrt(mb));
}
