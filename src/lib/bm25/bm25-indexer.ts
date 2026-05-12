import { PORTUGUESE_STOP_WORDS } from './stop-words.pt';
import { tokenize, tokenizeMany } from './text-normalizer';

/**
 * BM25 (variante BM25+) com índice invertido em memória.
 *
 * Suporta dois tipos de documento no MESMO índice:
 *   - `faq`  → campos: question (primary), keywords, answer (secondary)
 *   - `link` → campos: label (primary), keywords; sem secondary
 *
 * Cada `kind` tem seu próprio conjunto de pesos por campo. Isso permite que
 * FAQ e Link convivam no mesmo ranking — útil porque links são atalhos com
 * pouco texto, mas alta intenção de navegação quando as keywords casam.
 *
 * Stopwords:
 *   O índice **não filtra** stopwords — elas são indexadas normalmente. O
 *   peso de uma stopword é reduzido em duas camadas:
 *     1. **IDF natural do BM25** — stopwords aparecem em muitos docs, logo
 *        têm IDF baixo automaticamente.
 *     2. **Multiplicador explícito** (`STOPWORD_WEIGHT`) aplicado no
 *        `matchWeight` de qualquer match onde a query OU o termo indexado
 *        é stopword.
 *
 *   Vantagem dessa abordagem: queries como "como" continuam funcionando
 *   (não precisamos de fallback nem flags); queries longas com stopwords
 *   ("como pagar a fatura") ficam dominadas pelos termos significativos
 *   sem precisar filtrar nada. Comportamento uniforme e previsível.
 *
 * Construção: O(N × T) — N docs, T tokens médios.
 * Busca: O(|query_tokens| × |posting_list|).
 *
 * Referências: Robertson & Zaragoza (2009); Lv & Zhai (2011) para BM25+.
 */

export interface FaqItem {
  identifier: string;
  question: string;
  answer: string | null;
  keywords: string[] | null;
  category: {
    identifier: string;
    title: string;
  };
}

export interface HyperlinkItem {
  identifier: string;
  label: string;
  link: string;
  keywords: string[] | null;
  category: {
    identifier: string;
    title: string;
  };
}

export type IndexableItem =
  | ({ kind: 'faq' } & FaqItem)
  | ({ kind: 'link' } & HyperlinkItem);

export type BM25SearchHit =
  | {
      kind: 'faq';
      identifier: string;
      question: string;
      category: { identifier: string; title: string };
      score: number;
    }
  | {
      kind: 'link';
      identifier: string;
      label: string;
      link: string;
      category: { identifier: string; title: string };
      score: number;
    };

export interface BM25IndexStats {
  totalDocs: number;
  totalFaqDocs: number;
  totalLinkDocs: number;
  totalTerms: number;
  buildTimeMs: number;
  builtAt: string;
}

const BM25_K1 = 1.5;
const BM25_B = 0.75;

/**
 * Configuração do prefix match (match parcial morfológico).
 *
 * Quando um token da query não tem match exato no índice — ou mesmo quando
 * tem, queremos somar variações morfológicas próximas — fazemos um lookup
 * bidirecional: termo do índice é prefixo do token da query, ou vice-versa.
 *
 * Os comprimentos mínimos são **assimétricos**:
 *
 *  - `MIN_PREFIX_QUERY_LENGTH` (= 2): comprimento mínimo do token da query
 *    quando ELE é o menor dos dois. Tipicamente o caso "usuário digitou
 *    abreviado" (ex.: `"pa"` querendo `"pagar"`). Aceitar tokens de query
 *    curtos melhora o recall em queries incompletas — comum quando há
 *    stopwords precedendo ("o pa", "como wi") e o token "útil" fica curto.
 *
 *  - `MIN_PREFIX_INDEX_LENGTH` (= 3): comprimento mínimo do termo indexado
 *    quando ELE é o menor dos dois. Mais restritivo porque um termo curto
 *    no índice (raro em texto natural) casaria muitas queries longas e
 *    geraria ruído (ex.: `"co"` indexado puxando `"comunicação"`).
 *
 *  - `PARTIAL_MATCH_FACTOR`: fator base aplicado à contribuição do BM25
 *    quando o match é parcial. Penalidade adicional é proporcional à
 *    diferença de tamanho (`shorter/longer`).
 *
 * Exemplos (`PARTIAL_MATCH_FACTOR = 0.5`):
 *   - "pa"     ↔ "pagar"     → 2/5  × 0.5 = 0.20  (query abreviada)
 *   - "fatura" ↔ "faturas"   → 6/7  × 0.5 = 0.43
 *   - "paga"   ↔ "pagar"     → 4/5  × 0.5 = 0.40
 *   - "paga"   ↔ "pagamento" → 4/9  × 0.5 = 0.22
 *
 * Match exato vale 1.0, então um doc com o termo exato continua vencendo
 * um doc com variação morfológica.
 */
const MIN_PREFIX_QUERY_LENGTH = 2;
const MIN_PREFIX_INDEX_LENGTH = 3;
const PARTIAL_MATCH_FACTOR = 0.5;

/**
 * Multiplicador aplicado ao `matchWeight` quando query OU termo indexado é
 * stopword. Combinado com o IDF naturalmente baixo das stopwords (aparecem
 * em quase todos os docs), isso garante que stopwords contribuam pouco no
 * ranking sem precisar removê-las do pipeline.
 *
 * Valor escolhido (0.1) deixa stopwords ≈ 1 ordem de magnitude abaixo de
 * termos significativos. Tunar pra cima se queries com stopwords parecerem
 * "perder demais"; pra baixo se elas dominarem (improvável dado o IDF).
 */
const STOPWORD_WEIGHT = 0.1;

/**
 * Pesos por campo, por tipo de documento.
 *
 * FAQ → question domina (texto natural rico em sinais).
 * Link → keywords domina (curadas e único material textual relevante,
 *        já que `label` é tipicamente uma frase muito curta).
 *
 * Como ambos os tipos vivem no mesmo índice, a escala dos pesos importa
 * para o ranking misto: keywords=4 num link tende a derrotar question=3
 * num FAQ quando a query bate uma keyword curada — comportamento desejado
 * (atalho > artigo longo).
 */
const FIELD_WEIGHTS = {
  faq: { primary: 3, keywords: 2, secondary: 1 },
  link: { primary: 2, keywords: 4, secondary: 0 },
} as const;

type FieldKey = 'primary' | 'keywords' | 'secondary';
type DocKind = 'faq' | 'link';

interface FieldFrequency {
  primary: number;
  keywords: number;
  secondary: number;
}

type IndexedDocument =
  | {
      kind: 'faq';
      identifier: string;
      question: string;
      category: { identifier: string; title: string };
      fieldLengths: { primary: number; keywords: number; secondary: number };
    }
  | {
      kind: 'link';
      identifier: string;
      label: string;
      link: string;
      category: { identifier: string; title: string };
      fieldLengths: { primary: number; keywords: number; secondary: number };
    };

export class Bm25Indexer {
  private invertedIndex = new Map<string, Map<number, FieldFrequency>>();
  private documents: IndexedDocument[] = [];
  private averageFieldLengths = { primary: 0, keywords: 0, secondary: 0 };
  private stats: BM25IndexStats | null = null;
  private ready = false;

  readonly bm25K1 = BM25_K1;
  readonly bm25B = BM25_B;
  readonly fieldWeights = FIELD_WEIGHTS;

  constructor(items?: ReadonlyArray<IndexableItem>) {
    if (items) {
      this.build(items);
    }
  }

  build(items: ReadonlyArray<IndexableItem>): void {
    const t0 = performance.now();

    this.invertedIndex = new Map();
    this.documents = [];

    let totalPrimaryLen = 0;
    let totalKeywordsLen = 0;
    let totalSecondaryLen = 0;
    let faqCount = 0;
    let linkCount = 0;

    items.forEach((item, docIdx) => {
      const primaryText = item.kind === 'faq' ? item.question : item.label;
      const secondaryText = item.kind === 'faq' ? item.answer : null;

      // O índice contém tudo (incluindo stopwords). O peso das stopwords
      // é controlado no scoring via `STOPWORD_WEIGHT`, combinado com o IDF
      // naturalmente baixo (stopwords aparecem em quase todos os docs).
      const primaryTokens = tokenize(primaryText);
      const keywordsTokens = tokenizeMany(item.keywords ?? []);
      const secondaryTokens = tokenize(secondaryText);

      totalPrimaryLen += primaryTokens.length;
      totalKeywordsLen += keywordsTokens.length;
      totalSecondaryLen += secondaryTokens.length;

      const fieldLengths = {
        primary: primaryTokens.length,
        keywords: keywordsTokens.length,
        secondary: secondaryTokens.length,
      };

      if (item.kind === 'faq') {
        faqCount += 1;
        this.documents.push({
          kind: 'faq',
          identifier: item.identifier,
          question: item.question,
          category: item.category,
          fieldLengths,
        });
      } else {
        linkCount += 1;
        this.documents.push({
          kind: 'link',
          identifier: item.identifier,
          label: item.label,
          link: item.link,
          category: item.category,
          fieldLengths,
        });
      }

      this.updatePostings(docIdx, primaryTokens, 'primary');
      this.updatePostings(docIdx, keywordsTokens, 'keywords');
      this.updatePostings(docIdx, secondaryTokens, 'secondary');
    });

    const docCount = items.length || 1;
    this.averageFieldLengths = {
      primary: totalPrimaryLen / docCount,
      keywords: totalKeywordsLen / docCount,
      secondary: totalSecondaryLen / docCount,
    };

    const t1 = performance.now();
    this.stats = {
      totalDocs: items.length,
      totalFaqDocs: faqCount,
      totalLinkDocs: linkCount,
      totalTerms: this.invertedIndex.size,
      buildTimeMs: Number((t1 - t0).toFixed(3)),
      builtAt: new Date().toISOString(),
    };
    this.ready = items.length > 0;
  }

  isReady(): boolean {
    return this.ready;
  }

  getStats(): BM25IndexStats | null {
    return this.stats;
  }

  /**
   * Busca BM25 com pesos por campo (dinâmicos por kind), prefix match
   * bidirecional para variações morfológicas (paga ↔ pagar, fatura ↔
   * faturas) e penalidade automática para stopwords via `STOPWORD_WEIGHT`.
   *
   * Sem modos especiais: o pipeline é uniforme — tokeniza, expande cada
   * token via `findMatches` (que já aplica a penalidade de stopword
   * quando aplicável), e soma contribuições BM25.
   */
  search(query: string, limit = 10): BM25SearchHit[] {
    if (!this.ready) return [];

    const queryTokens = tokenize(query);
    if (queryTokens.length === 0) return [];

    const N = this.documents.length;
    const scores = new Map<number, number>();

    for (const queryToken of queryTokens) {
      const matches = this.findMatches(queryToken);
      if (matches.length === 0) continue;

      for (const { term, matchWeight } of matches) {
        const postings = this.invertedIndex.get(term);
        if (!postings) continue;

        const df = postings.size;
        // BM25+ IDF: garante valor não-negativo.
        const idf = Math.log((N - df + 0.5) / (df + 0.5) + 1);

        for (const [docIdx, freq] of postings) {
          const doc = this.documents[docIdx];
          const weights = this.fieldWeights[doc.kind];

          const rawContribution =
            this.fieldScore(
              freq.primary,
              doc.fieldLengths.primary,
              this.averageFieldLengths.primary,
              weights.primary,
            ) +
            this.fieldScore(
              freq.keywords,
              doc.fieldLengths.keywords,
              this.averageFieldLengths.keywords,
              weights.keywords,
            ) +
            this.fieldScore(
              freq.secondary,
              doc.fieldLengths.secondary,
              this.averageFieldLengths.secondary,
              weights.secondary,
            );

          if (rawContribution === 0) continue;

          const contribution = matchWeight * rawContribution;
          scores.set(docIdx, (scores.get(docIdx) ?? 0) + idf * contribution);
        }
      }
    }

    if (scores.size === 0) return [];

    return Array.from(scores.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([docIdx, score]) => this.toHit(docIdx, score));
  }

  /**
   * Expande um token da query em todos os termos do índice que casam com
   * ele, com seus pesos respectivos.
   *
   * Estratégia:
   *  - Match exato: adicionado com `matchWeight = 1.0`.
   *  - Match parcial (prefix bidirecional): adicionado para todo termo do
   *    índice onde um é prefixo do outro, com regras assimétricas de
   *    comprimento mínimo (ver comentário em `MIN_PREFIX_*`).
   *  - Em qualquer dos dois, se a query OU o termo indexado é stopword,
   *    aplica `STOPWORD_WEIGHT` por cima (uma vez, não acumula).
   *
   * Custo: O(|terms|) por token. Para o volume do POC (~700 termos) é
   * trivial; se virar feature de verdade, dá pra otimizar com Trie.
   */
  private findMatches(
    queryToken: string,
  ): Array<{ term: string; matchWeight: number }> {
    const matches: Array<{ term: string; matchWeight: number }> = [];
    const queryIsStopword = PORTUGUESE_STOP_WORDS.has(queryToken);

    if (this.invertedIndex.has(queryToken)) {
      const weight = queryIsStopword ? STOPWORD_WEIGHT : 1.0;
      matches.push({ term: queryToken, matchWeight: weight });
    }

    for (const indexedTerm of this.invertedIndex.keys()) {
      if (indexedTerm === queryToken) continue; // já tratado acima

      const shorterLen = Math.min(indexedTerm.length, queryToken.length);
      const longerLen = Math.max(indexedTerm.length, queryToken.length);

      // Limite mínimo assimétrico: aceita queries curtas (user digitando
      // abreviado), mas é mais conservador com termos curtos do índice
      // (caso raro e fonte de ruído).
      const queryIsShorter = queryToken.length < indexedTerm.length;
      const minRequired = queryIsShorter
        ? MIN_PREFIX_QUERY_LENGTH
        : MIN_PREFIX_INDEX_LENGTH;
      if (shorterLen < minRequired) continue;

      const isPrefix =
        indexedTerm.startsWith(queryToken) ||
        queryToken.startsWith(indexedTerm);

      if (!isPrefix) continue;

      const baseWeight = (shorterLen / longerLen) * PARTIAL_MATCH_FACTOR;
      const isStopwordMatch =
        queryIsStopword || PORTUGUESE_STOP_WORDS.has(indexedTerm);
      const matchWeight = isStopwordMatch
        ? baseWeight * STOPWORD_WEIGHT
        : baseWeight;

      matches.push({ term: indexedTerm, matchWeight });
    }

    return matches;
  }

  private toHit(docIdx: number, score: number): BM25SearchHit {
    const doc = this.documents[docIdx];
    const roundedScore = Number(score.toFixed(4));

    if (doc.kind === 'faq') {
      return {
        kind: 'faq',
        identifier: doc.identifier,
        question: doc.question,
        category: doc.category,
        score: roundedScore,
      };
    }

    return {
      kind: 'link',
      identifier: doc.identifier,
      label: doc.label,
      link: doc.link,
      category: doc.category,
      score: roundedScore,
    };
  }

  private fieldScore(
    termFreq: number,
    fieldLength: number,
    avgFieldLength: number,
    weight: number,
  ): number {
    if (termFreq === 0 || avgFieldLength === 0 || weight === 0) return 0;

    const numerator = termFreq * (this.bm25K1 + 1);
    const denominator =
      termFreq +
      this.bm25K1 *
        (1 - this.bm25B + this.bm25B * (fieldLength / avgFieldLength));

    return weight * (numerator / denominator);
  }

  private updatePostings(
    docIdx: number,
    tokens: ReadonlyArray<string>,
    field: FieldKey,
  ): void {
    for (const token of tokens) {
      let postings = this.invertedIndex.get(token);
      if (!postings) {
        postings = new Map();
        this.invertedIndex.set(token, postings);
      }

      let freq = postings.get(docIdx);
      if (!freq) {
        freq = { primary: 0, keywords: 0, secondary: 0 };
        postings.set(docIdx, freq);
      }

      freq[field] += 1;
    }
  }
}

// Suprime aviso de tipo não-usado em alguns lints — `DocKind` é re-derivado
// internamente, mas mantemos exportável caso o consumidor precise.
export type { DocKind };
