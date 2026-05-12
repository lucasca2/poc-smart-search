import { PORTUGUESE_STOP_WORDS } from './stop-words.pt';

/**
 * Pipeline de normalização e tokenização para o índice BM25.
 *
 *  1. lowercase
 *  2. remove tags HTML simples (a `answer` pode vir como HTML rico)
 *  3. NFD + descarta combining marks → remove acentos
 *  4. mantém apenas letras Unicode, dígitos e whitespace
 *  5. split por whitespace
 *  6. descarta tokens com menos de 2 chars
 *  7. descarta stopwords pt-BR
 *
 * Importante: as stopwords são comparadas **após** a remoção de acentos,
 * portanto a lista também precisa estar sem acento.
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
    .filter(
      (token) =>
        token.length >= MIN_TOKEN_LENGTH && !PORTUGUESE_STOP_WORDS.has(token),
    );
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
