'use client';

import { useEffect, useState } from 'react';
import type { HyperlinkItem } from '@/lib/bm25/bm25-indexer';

/**
 * Modal de edição de um atalho (HyperlinkItem). Análogo ao `FaqEditModal`,
 * mas com os campos próprios do tipo: label, link e keywords. Ao salvar, o
 * pai reconstrói o índice via `useMemo` ancorado em `items`.
 */
export function HyperlinkEditModal({
  item,
  onSave,
  onClose,
}: {
  item: HyperlinkItem;
  onSave: (updated: HyperlinkItem) => void;
  onClose: () => void;
}) {
  const [label, setLabel] = useState(item.label);
  const [link, setLink] = useState(item.link);
  const [keywords, setKeywords] = useState(
    (item.keywords ?? []).join(', '),
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsedKeywords = keywords
      .split(',')
      .map((k) => k.trim())
      .filter((k) => k.length > 0);

    onSave({
      ...item,
      label: label.trim(),
      link: link.trim(),
      keywords: parsedKeywords.length > 0 ? parsedKeywords : null,
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Editar atalho"
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
        className="flex w-full max-w-xl flex-col gap-4 rounded-2xl bg-white p-6 shadow-2xl"
      >
        <header className="flex items-start justify-between gap-4">
          <div className="flex flex-col">
            <h2 className="text-lg font-semibold text-gray-900">
              Editar atalho
            </h2>
            <p className="font-mono text-xs text-gray-500">
              {item.identifier} · {item.category.title}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="cursor-pointer text-2xl leading-none text-gray-700 hover:text-gray-900"
          >
            ×
          </button>
        </header>

        <label className="flex flex-col gap-1">
          <span className="text-sm font-semibold text-gray-900">Label</span>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            required
            className="rounded-md border border-gray-400 px-3 py-2 text-sm text-gray-900 focus:border-primary-medium focus:outline-none"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm font-semibold text-gray-900">Link</span>
          <input
            value={link}
            onChange={(e) => setLink(e.target.value)}
            required
            placeholder="/tabs/invoices"
            className="rounded-md border border-gray-400 px-3 py-2 font-mono text-sm text-gray-900 focus:border-primary-medium focus:outline-none"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm font-semibold text-gray-900">
            Keywords{' '}
            <span className="font-normal text-gray-700">
              (separe por vírgula)
            </span>
          </span>
          <input
            value={keywords}
            onChange={(e) => setKeywords(e.target.value)}
            placeholder="ex.: fatura, boleto, segunda via"
            className="rounded-md border border-gray-400 px-3 py-2 text-sm text-gray-900 focus:border-primary-medium focus:outline-none"
          />
        </label>

        <footer className="flex items-center justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer rounded-full border border-gray-400 px-4 py-2 text-sm font-semibold text-gray-900 hover:bg-gray-200"
          >
            Cancelar
          </button>
          <button
            type="submit"
            className="cursor-pointer rounded-full bg-primary-medium px-4 py-2 text-sm font-semibold text-white hover:bg-primary-dark"
          >
            Salvar e reindexar
          </button>
        </footer>
      </form>
    </div>
  );
}
