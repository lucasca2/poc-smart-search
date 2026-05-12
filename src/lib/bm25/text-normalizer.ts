/**
 * Pipeline de normalização e tokenização para o índice BM25.
 *
 *  1. lowercase
 *  2. remove tags HTML simples (a `answer` pode vir como HTML rico)
 *  3. NFD + descarta combining marks → remove acentos
 *  4. mantém apenas letras Unicode, dígitos e whitespace
 *  5. split por whitespace
 *  6. descarta tokens com menos de 2 chars
 *
 * Stopwords NÃO são removidas aqui — quem decide o peso de uma stopword
 * é o `Bm25Indexer` (multiplicador `STOPWORD_WEIGHT` no scoring). A função
 * `tokenize` deve permanecer "pura": apenas normaliza e quebra o texto.
 */

const HTML_TAG_REGEX = /<[^>]*>/g;
const DIACRITIC_REGEX = /\p{Diacritic}/gu;
const NON_ALPHANUM_REGEX = /[^\p{L}\p{N}\s]+/gu;
const WHITESPACE_REGEX = /\s+/u;

const MIN_TOKEN_LENGTH = 2;

export function normalizeText(input: string | null | undefined): string {
  if (!input) {
    return '';
  }

  return input
    .toLowerCase()
    .replace(HTML_TAG_REGEX, ' ')
    .normalize('NFD')
    .replace(DIACRITIC_REGEX, '')
    .replace(NON_ALPHANUM_REGEX, ' ')
    .trim();
}

export function tokenize(input: string | null | undefined): string[] {
  const normalized = normalizeText(input);

  if (!normalized) {
    return [];
  }

  return normalized
    .split(WHITESPACE_REGEX)
    .filter((token) => token.length >= MIN_TOKEN_LENGTH);
}

/**
 * Tokeniza uma lista de strings (ex.: array de keywords) e concatena.
 */
export function tokenizeMany(inputs: ReadonlyArray<string | null>): string[] {
  const result: string[] = [];

  for (const value of inputs) {
    if (!value) continue;
    for (const token of tokenize(value)) {
      result.push(token);
    }
  }

  return result;
}
