'use client';

import { useMemo, useState } from 'react';
import faqSeed from '@/data/faq-seed.json';
import linksSeed from '@/data/links-seed.json';
import {
  Bm25Indexer,
  type BM25SearchHit,
  type FaqItem,
  type HyperlinkItem,
  type IndexableItem,
} from '@/lib/bm25/bm25-indexer';
import { FaqEditModal } from './FaqEditModal';
import { HyperlinkEditModal } from './HyperlinkEditModal';

/**
 * Tela "Central de ajuda" — busca ativa.
 *
 * Layout baseado no node 40011958:56854 do Figma "Algar — Entregas".
 * O componente mantém o estado dos items (FAQ + Links) e reconstrói o índice
 * BM25 sempre que algum item é editado, via `useMemo` ancorado em `items`.
 */
const INITIAL_FAQS: ReadonlyArray<FaqItem> = faqSeed as FaqItem[];
const INITIAL_LINKS: ReadonlyArray<HyperlinkItem> = linksSeed as HyperlinkItem[];

const INITIAL_ITEMS: IndexableItem[] = [
  ...INITIAL_FAQS.map<IndexableItem>((item) => ({ kind: 'faq', ...item })),
  ...INITIAL_LINKS.map<IndexableItem>((item) => ({ kind: 'link', ...item })),
];

/**
 * Tamanho mínimo da query (em chars, após trim) para disparar a busca.
 *
 * Com prefix match habilitado, queries muito curtas (1-2 chars) expandem
 * pra muitos termos do índice e poluem o resultado. 3 chars dá um piso
 * razoável: tokens como "pix", "pag", "wif" já são úteis e específicos
 * o bastante pra ranquear bem.
 */
const MIN_QUERY_LENGTH = 3;

export function FaqSearchScreen() {
  const [items, setItems] = useState<IndexableItem[]>(INITIAL_ITEMS);
  const [query, setQuery] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);

  // Recria o indexer sempre que a lista muda. JSON tem ~48 entradas; build
  // leva <2 ms, então rebuild síncrono no main thread é OK.
  const indexer = useMemo(() => {
    const t0 = performance.now();
    const instance = new Bm25Indexer(items);
    if (typeof window !== 'undefined') {
      const ms = (performance.now() - t0).toFixed(2);
      // eslint-disable-next-line no-console
      console.log(
        `[faq-search] index (re)built in ${ms}ms`,
        instance.getStats(),
      );
    }
    return instance;
  }, [items]);

  const hits = useMemo<BM25SearchHit[]>(() => {
    const trimmed = query.trim();
    if (trimmed.length < MIN_QUERY_LENGTH) return [];
    return indexer.search(trimmed, 10);
  }, [query, indexer]);

  const editingItem = useMemo<IndexableItem | null>(() => {
    if (editingId === null) return null;
    return items.find((item) => item.identifier === editingId) ?? null;
  }, [editingId, items]);

  function handleSaveFaq(updated: FaqItem) {
    setItems((prev) =>
      prev.map((item) =>
        item.kind === 'faq' && item.identifier === updated.identifier
          ? { kind: 'faq', ...updated }
          : item,
      ),
    );
    setEditingId(null);
  }

  function handleSaveLink(updated: HyperlinkItem) {
    setItems((prev) =>
      prev.map((item) =>
        item.kind === 'link' && item.identifier === updated.identifier
          ? { kind: 'link', ...updated }
          : item,
      ),
    );
    setEditingId(null);
  }

  function handleHitClick(hit: BM25SearchHit) {
    setEditingId(hit.identifier);
  }

  return (
    <>
      <div className="flex min-h-full flex-col bg-white">
        <StatusBar />
        <Header />

        <div className="flex flex-col items-center px-6 pb-6 pt-7">
          <div className="flex w-full flex-col gap-4">
            {/* Search */}
            <div className="flex items-center gap-2">
              <BackArrowIcon className="size-6 shrink-0 text-gray-900" />
              <div className="flex flex-1 items-center gap-2 rounded-2xl border border-gray-600 bg-white px-2 py-2">
                <SearchIcon className="size-6 shrink-0 text-gray-900" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Buscar"
                  className="flex-1 min-w-0 bg-transparent text-sm font-medium leading-4 text-gray-900 placeholder:text-gray-600 focus:outline-none"
                  autoFocus
                />
                {query.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setQuery('')}
                    className="cursor-pointer text-gray-900"
                    aria-label="Limpar busca"
                  >
                    <CloseIcon className="size-5" />
                  </button>
                )}
              </div>
            </div>

            {/* Label resultados */}
            {query.trim().length >= MIN_QUERY_LENGTH && (
              <p className="text-sm font-semibold leading-4 text-gray-900">
                {hits.length > 0
                  ? 'Resultados da busca'
                  : 'Nenhum resultado encontrado'}
              </p>
            )}

            {/* Lista */}
            {hits.length > 0 && (
              <ul className="flex w-full flex-col overflow-hidden rounded-lg">
                {hits.map((hit, idx) => (
                  <li
                    key={hit.identifier}
                    className={`bg-gray-200 ${idx < hits.length - 1 ? 'border-b border-gray-400' : ''
                      }`}
                  >
                    <button
                      type="button"
                      onClick={() => handleHitClick(hit)}
                      className="flex w-full cursor-pointer items-center gap-3 px-2 py-4 text-left transition-colors hover:bg-gray-400/40"
                    >

                      <div className="flex min-w-0 flex-1 flex-col gap-1">
                        <p className="text-sm font-semibold leading-4 text-gray-900">
                          {hit.kind === 'faq' ? hit.question : hit.label}
                        </p>
                        <p className="font-mono text-[10px] leading-3 text-gray-500">
                          {hit.kind} · score {hit.score.toFixed(3)}
                        </p>
                      </div>
                      {hit.kind === 'link' && (
                        <ExternalLinkIcon className="size-5 shrink-0 text-primary-medium" />
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="mt-auto">
          <NavBar />
        </div>
      </div>

      {editingItem?.kind === 'faq' && (
        <FaqEditModal
          item={editingItem}
          onSave={handleSaveFaq}
          onClose={() => setEditingId(null)}
        />
      )}

      {editingItem?.kind === 'link' && (
        <HyperlinkEditModal
          item={editingItem}
          onSave={handleSaveLink}
          onClose={() => setEditingId(null)}
        />
      )}
    </>
  );
}

/* ---------- Header / StatusBar / NavBar ---------- */

function StatusBar() {
  return (
    <div className="flex h-[44px] items-center justify-between bg-primary-medium px-2 py-[2px] text-white">
      <div className="ml-3 text-[16px] font-semibold leading-[21px] tracking-tight">
        11:39
      </div>
      <div className="mr-3 flex items-center gap-1">
        <SignalIcon className="size-4" />
        <WifiIcon className="size-4" />
        <BatteryIcon className="h-4 w-7" />
      </div>
    </div>
  );
}

function Header() {
  return (
    <div className="flex items-center justify-between bg-primary-medium px-5 py-6 text-white">
      <BackArrowIcon className="size-6 text-white" />
      <p className="text-base font-semibold leading-[1.4]">Central de ajuda</p>
      <div className="size-6" />
    </div>
  );
}

function NavBar() {
  const items = [
    { label: 'Início', icon: HomeIcon },
    { label: 'Faturas', icon: InvoiceIcon },
    { label: 'Loja', icon: StoreIcon },
    { label: 'Vantagens', icon: GiftIcon },
    { label: 'Mais', icon: MoreIcon, active: true },
  ];

  return (
    <>
      <div className="flex h-16 items-center justify-between rounded-t-2xl bg-white px-3 shadow-[0_-4px_12px_0_rgba(60,70,70,0.12)]">
        {items.map(({ label, icon: Icon, active }) => (
          <div
            key={label}
            className="flex h-12 w-[68px] flex-col items-center justify-center gap-1"
          >
            <Icon
              className={`size-6 ${active ? 'text-primary-dark' : 'text-gray-800'}`}
            />
            <span
              className={`text-xs leading-4 ${active
                ? 'font-bold text-primary-dark'
                : 'font-normal text-gray-800'
                }`}
            >
              {label}
            </span>
          </div>
        ))}
      </div>
      <div className="flex h-6 items-center justify-center bg-white">
        <div className="h-1 w-40 rounded-full bg-gray-500" />
      </div>
    </>
  );
}

/* ---------- Ícones inline (POC — sem dep externa) ---------- */

type IconProps = { className?: string };

function BackArrowIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <line x1="19" y1="12" x2="5" y2="12" />
      <polyline points="12 19 5 12 12 5" />
    </svg>
  );
}

function SearchIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <circle cx="11" cy="11" r="7" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function CloseIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function ExternalLinkIcon({ className }: IconProps) {
  // Seta diagonal pra cima/direita — convenção comum pra "abrir tela".
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <line x1="7" y1="17" x2="17" y2="7" />
      <polyline points="7 7 17 7 17 17" />
    </svg>
  );
}

function HomeIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M3 10.5 12 3l9 7.5V21a1 1 0 0 1-1 1h-5v-7h-6v7H4a1 1 0 0 1-1-1z" />
    </svg>
  );
}

function InvoiceIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <rect x="6" y="3" width="12" height="18" rx="1" />
      <line x1="9" y1="7" x2="15" y2="7" />
      <line x1="9" y1="11" x2="15" y2="11" />
      <line x1="9" y1="15" x2="13" y2="15" />
    </svg>
  );
}

function StoreIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M6 7h12l1 4a3 3 0 0 1-6 0 3 3 0 0 1-6 0 3 3 0 0 1-6 0z" />
      <path d="M5 11v9h14v-9" />
    </svg>
  );
}

function GiftIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <rect x="3" y="8" width="18" height="4" />
      <line x1="12" y1="8" x2="12" y2="21" />
      <path d="M5 12v9h14v-9" />
      <path d="M7.5 8a2.5 2.5 0 0 1 0-5C10 3 12 8 12 8s2-5 4.5-5a2.5 2.5 0 0 1 0 5" />
    </svg>
  );
}

function MoreIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <circle cx="6" cy="6" r="1.6" />
      <circle cx="12" cy="6" r="1.6" />
      <circle cx="18" cy="6" r="1.6" />
      <circle cx="6" cy="12" r="1.6" />
      <circle cx="12" cy="12" r="1.6" />
      <path d="M16.5 12 H 21 M18.75 9.75 V 14.25" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" />
      <circle cx="6" cy="18" r="1.6" />
      <circle cx="12" cy="18" r="1.6" />
    </svg>
  );
}

function SignalIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 16" fill="currentColor" className={className}>
      <rect x="0" y="11" width="3" height="4" rx="0.5" />
      <rect x="5" y="8" width="3" height="7" rx="0.5" />
      <rect x="10" y="5" width="3" height="10" rx="0.5" />
      <rect x="15" y="2" width="3" height="13" rx="0.5" />
    </svg>
  );
}

function WifiIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M5 12.55a11 11 0 0 1 14 0" />
      <path d="M8.5 16.05a6 6 0 0 1 7 0" />
      <line x1="12" y1="20" x2="12" y2="20" />
    </svg>
  );
}

function BatteryIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 28 16" fill="none" className={className}>
      <rect
        x="0.5"
        y="2.5"
        width="24"
        height="11"
        rx="3"
        stroke="currentColor"
        opacity="0.5"
      />
      <rect x="2" y="4" width="20" height="8" rx="1.5" fill="currentColor" />
      <rect
        x="25.5"
        y="6"
        width="2"
        height="4"
        rx="1"
        fill="currentColor"
        opacity="0.5"
      />
    </svg>
  );
}
