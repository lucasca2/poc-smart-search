# Smart Search POC — Algar

POC do spike **AA-1796**: busca por relevância no FAQ usando **BM25** com
índice invertido in-memory. O objetivo aqui é o time conseguir **testar a
funcionalidade** (qualidade dos resultados) num app web simples, sem depender
do BFF.

A medição de performance/memória já foi feita anteriormente dentro do
`proxy-algar` — essa POC foca apenas em UX.

## Como rodar

```bash
npm install
npm run dev
```

Abra http://localhost:3000 — o "celular fake" centralizado simula a tela
"Central de ajuda" do app. Digite na barra de busca e veja os resultados
ranqueados em tempo real.

## Onde mexer

- **Dataset**: [src/data/faq-seed.json](src/data/faq-seed.json) — mesmo shape
  retornado por `CmsService.getAllFaqItemsForSearch()` no BFF. Para testar com
  outros conteúdos, é só editar esse JSON.
- **Lógica BM25**: [src/lib/bm25/](src/lib/bm25/) — `text-normalizer`,
  `stop-words.pt` e `bm25-indexer`. Portado 1:1 do BFF (sem o lifecycle do
  NestJS).
- **Helper**: [src/lib/faq-search.ts](src/lib/faq-search.ts) — singleton que
  constrói o índice na primeira chamada.
- **UI**: [src/components/FaqSearchScreen.tsx](src/components/FaqSearchScreen.tsx)
  baseada no design do Figma (node `40011958:56854`).

## Parâmetros do BM25

Definidos como `readonly` em [src/lib/bm25/bm25-indexer.ts](src/lib/bm25/bm25-indexer.ts):

| Parâmetro | Valor | Observação |
|---|---|---|
| `k1` | 1.5 | Saturação da TF (range usual: 1.2–2.0) |
| `b` | 0.75 | Normalização por tamanho do campo (range: 0.5–0.8) |
| Peso `question` | 3× | Match na pergunta vale mais |
| Peso `keywords` | 2× | Keywords curadas no CMS |
| Peso `answer` | 1× | Texto da resposta |

A variante usada é **BM25+** (IDF garantidamente não-negativo).

## Debug

Cada resultado mostra um `<details>` com o score BM25 — útil pra entender por
que um item ficou acima do outro.
