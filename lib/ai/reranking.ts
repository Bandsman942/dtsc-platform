export type RerankCandidate<T> = {
  id: string;
  score: number;
  value: T;
};

export type RerankerDefinition = {
  code: string;
  version: string;
  maximumCandidates: number;
};

export type Reranker<T> = {
  definition: RerankerDefinition;
  rerank: (query: string, candidates: RerankCandidate<T>[]) => Promise<RerankCandidate<T>[]>;
};

let configuredReranker: Reranker<unknown> | null = null;

export function registerReranker<T>(reranker: Reranker<T>) {
  configuredReranker = reranker as Reranker<unknown>;
}

export function clearReranker() {
  configuredReranker = null;
}

export async function rerankKnowledgeCandidates<T>({
  query,
  candidates,
  limit,
}: {
  query: string;
  candidates: RerankCandidate<T>[];
  limit: number;
}) {
  const stable = [...candidates].sort((left, right) => right.score - left.score || left.id.localeCompare(right.id));
  if (!configuredReranker) return stable.slice(0, limit);
  try {
    const bounded = stable.slice(0, configuredReranker.definition.maximumCandidates);
    const reranked = await (configuredReranker as Reranker<T>).rerank(query, bounded);
    return reranked.slice(0, limit);
  } catch (error) {
    console.error("Optional RAG reranker failed; using hybrid score", error);
    return stable.slice(0, limit);
  }
}
