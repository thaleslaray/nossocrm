import path from "path";
import { fileURLToPath } from "url";
import type { NextConfig } from "next";

const configDir = path.dirname(fileURLToPath(import.meta.url));
// When running from a git worktree inside .claude/worktrees/, node_modules live
// 3 levels up at the repo root. Turbopack needs an explicit root to resolve them.
const repoRoot = configDir.includes('/.claude/worktrees/')
  ? path.resolve(configDir, '../../../')
  : configDir;

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '*.supabase.co' },
    ],
  },
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
    root: repoRoot,
  },
  async rewrites() {
    return [{ source: '/api/chat', destination: '/api/ai/chat' }];
  },
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache" },
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
        ],
      },
      {
        source: "/api/mcp",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Access-Control-Allow-Methods", value: "GET, POST, OPTIONS" },
          { key: "Access-Control-Allow-Headers", value: "Authorization, Content-Type, X-Api-Key" },
        ],
      },
    ];
  },
};

export default nextConfig;
