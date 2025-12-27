import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

function html(specUrl: string) {
  // Classic Swagger UI via CDN, with a cleaner look via CSS overrides.
  return `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>NossoCRM Public API — Swagger</title>
    <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" />
    <style>
      :root {
        --bg: #f6f7fb;
        --card: #ffffff;
        --border: rgba(15, 23, 42, 0.10);
        --muted: rgba(15, 23, 42, 0.60);
        --text: #0f172a;
        --shadow: 0 10px 30px rgba(2, 8, 23, 0.06);
        --radius: 14px;
      }

      body { margin: 0; background: var(--bg); }

      /* Hide Swagger top bar (we already have app nav) */
      .topbar { display: none; }

      /* Typography + layout */
      .swagger-ui { color: var(--text); font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; }
      .swagger-ui .wrapper { padding: 24px 16px; max-width: 1120px; }

      /* Page header */
      .swagger-ui .info { margin: 18px 0 22px; }
      .swagger-ui .info .title { color: var(--text); font-weight: 650; letter-spacing: -0.02em; }
      .swagger-ui .info .description { color: var(--muted); }
      .swagger-ui .info a { color: #4f46e5; }

      /* Cards */
      .swagger-ui .scheme-container {
        background: var(--card);
        border: 1px solid var(--border);
        box-shadow: var(--shadow);
        border-radius: var(--radius);
        padding: 14px 16px;
      }
      .swagger-ui .opblock {
        border-radius: var(--radius);
        overflow: hidden;
        border: 1px solid var(--border);
        box-shadow: none;
      }
      .swagger-ui .opblock .opblock-summary {
        border-bottom: 1px solid var(--border);
      }
      .swagger-ui .opblock .opblock-summary-description { color: var(--muted); }

      /* Buttons */
      .swagger-ui .btn {
        border-radius: 12px;
        border: 1px solid var(--border);
        box-shadow: none;
      }
      .swagger-ui .btn.authorize { border-radius: 999px; }
      .swagger-ui .btn.execute { border-radius: 12px; }

      /* Inputs */
      .swagger-ui input[type="text"],
      .swagger-ui input[type="password"],
      .swagger-ui textarea,
      .swagger-ui select {
        border-radius: 12px;
        border: 1px solid var(--border);
        box-shadow: none;
      }

      /* Schemas (Models) — make it less "old tool" */
      .swagger-ui section.models {
        background: var(--card);
        border: 1px solid var(--border);
        border-radius: var(--radius);
        box-shadow: var(--shadow);
        padding: 6px 12px 12px;
      }
      .swagger-ui section.models h4 {
        color: var(--text);
        font-weight: 650;
        letter-spacing: -0.01em;
      }
      .swagger-ui section.models .model-box {
        background: #fbfbfd;
        border: 1px solid var(--border);
        border-radius: 12px;
        box-shadow: none;
        margin: 10px 0;
      }
      .swagger-ui section.models .model-box:hover {
        background: #f8fafc;
      }
      .swagger-ui section.models .model-box .model-box-control {
        padding: 10px 12px;
      }
      .swagger-ui section.models .model-box .model-box-control span {
        color: var(--text);
      }
      .swagger-ui section.models .model-box .model-box-control .model-toggle:after {
        opacity: 0.65;
      }
      .swagger-ui section.models .model-box .model-title__text {
        font-weight: 600;
      }
      .swagger-ui section.models .model-box .model .property-row {
        border-top: 1px solid var(--border);
      }
      .swagger-ui section.models .model-box .model .property.primitive { color: var(--muted); }
    </style>
  </head>
  <body>
    <div id="swagger-ui"></div>

    <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
    <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-standalone-preset.js"></script>
    <script>
      window.ui = SwaggerUIBundle({
        url: ${JSON.stringify(specUrl)},
        dom_id: '#swagger-ui',
        deepLinking: true,
        presets: [SwaggerUIBundle.presets.apis, SwaggerUIStandalonePreset],
        layout: "BaseLayout",
      });
    </script>
  </body>
</html>`;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const specUrl = url.searchParams.get('spec') || '/api/public/v1/openapi.json';

  return new NextResponse(html(specUrl), {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=60',
    },
  });
}

