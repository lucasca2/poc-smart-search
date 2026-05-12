import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Permite acessar o dev server via tunnel/IP/origem diferente de localhost.
  // Sem isso, o Next 15+ bloqueia requests cross-origin no dev e a hydration
  // do client falha silenciosamente (a página renderiza via SSR, mas o React
  // não monta — o input aceita texto mas nada reage).
  //
  // Wildcards cobrem os tunnels mais comuns; ajuste se usar outro provedor.
  allowedDevOrigins: [
    "*.lhr.life",
    "*.loca.lt",
    "*.trycloudflare.com",
    "*.ngrok-free.app",
    "*.ngrok.io",
    "*.vercel.app",
  ],
};

export default nextConfig;
