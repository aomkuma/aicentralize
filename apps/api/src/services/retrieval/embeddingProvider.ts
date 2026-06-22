import { buildEmbedding } from "../embeddingService";

export type EmbeddingProvider = {
  providerName: string;
  dimensions: number;
  embed: (text: string) => Promise<number[]>;
};

class LocalHashEmbeddingProvider implements EmbeddingProvider {
  providerName = "local-hash-v1";
  dimensions = 12;

  async embed(text: string): Promise<number[]> {
    return buildEmbedding(text);
  }
}

const defaultProvider = new LocalHashEmbeddingProvider();

export function getEmbeddingProvider(): EmbeddingProvider {
  return defaultProvider;
}
