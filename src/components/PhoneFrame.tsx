import { ReactNode } from 'react';

/**
 * Moldura "celular fake" para POC — apenas para enquadrar a tela do app no
 * meio do desktop. Largura interna 393px (iPhone 14/15 width), altura fixa.
 */
export function PhoneFrame({ children }: { children: ReactNode }) {
  return (
    <div className="relative rounded-[48px] bg-black p-[10px] shadow-[0_30px_80px_-20px_rgba(15,42,40,0.45),_0_0_0_2px_rgba(255,255,255,0.05)_inset]">
      {/* Notch (Dynamic Island simplificada) */}
      <div className="pointer-events-none absolute left-1/2 top-[18px] z-30 h-[28px] w-[110px] -translate-x-1/2 rounded-full bg-black" />

      <div className="relative w-[393px] overflow-hidden rounded-[38px] bg-white">
        <div className="relative h-[800px] overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
