import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Otimiza imports de bibliotecas com barrel files (index.js que re-exporta tudo)
  // Isso evita carregar módulos não utilizados, reduzindo o bundle em 15-25KB
  // Ref: https://vercel.com/blog/how-we-optimized-package-imports-in-next-js
  experimental: {
    optimizePackageImports: [
      'lucide-react',      // 1500+ ícones, carrega só os usados
      'recharts',          // Biblioteca de gráficos pesada
      'date-fns',          // Utilitários de data
      '@radix-ui/react-icons',
    ],
  },
  turbopack: {
    root: process.cwd(),
  },
  async headers() {
    const securityHeaders = [
      { key: "X-Frame-Options",           value: "DENY" },
      { key: "X-Content-Type-Options",    value: "nosniff" },
      { key: "Referrer-Policy",           value: "strict-origin-when-cross-origin" },
      { key: "Permissions-Policy",        value: "camera=(), microphone=(), geolocation=()" },
      {
        key: "Strict-Transport-Security",
        value: "max-age=63072000; includeSubDomains; preload",
      },
      {
        key: "Content-Security-Policy",
        // frame-ancestors replaces X-Frame-Options for modern browsers
        value: [
          "default-src 'self'",
          "script-src 'self' 'unsafe-eval' 'unsafe-inline'",
          "style-src 'self' 'unsafe-inline'",
          "img-src 'self' data: https:",
          "font-src 'self' data:",
          "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
          "frame-ancestors 'none'",
        ].join("; "),
      },
    ];

    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache" },
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
        ],
      },
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
