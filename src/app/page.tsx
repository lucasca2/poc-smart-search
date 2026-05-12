import { FaqSearchScreen } from '@/components/FaqSearchScreen';
import { PhoneFrame } from '@/components/PhoneFrame';

export default function Home() {
  return (
    <main className="flex min-h-screen w-full items-center justify-center bg-[#e9eef1] p-6">
      <div className="flex flex-col items-center gap-6">
        <div className="text-center">
          <h1 className="text-xl font-semibold text-gray-900">
            Smart Search POC — Algar
          </h1>
          <p className="mt-1 text-sm text-gray-700">
            Busca BM25 em memória sobre o FAQ. Digite para testar.
          </p>
        </div>

        <PhoneFrame>
          <FaqSearchScreen />
        </PhoneFrame>

        <p className="text-xs text-gray-700">
          spike AA-1796 · index construído no client a partir de{' '}
          <code className="rounded bg-white px-1 py-0.5 font-mono text-[11px]">
            src/data/faq-seed.json
          </code>
        </p>
      </div>
    </main>
  );
}
