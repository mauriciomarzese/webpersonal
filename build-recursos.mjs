// Genera /recursos/ (listado), /recursos/<slug>/ (formulario) y /recursos/gracias/
// a partir de la base "Recursos" de Notion. Lo ejecuta build-blog.mjs en cada deploy.
// Requiere NOTION_TOKEN. Sin token o sin recursos publicados, no genera nada.
import fs from 'node:fs/promises';
import path from 'node:path';

const TOKEN = process.env.NOTION_TOKEN;
const DB = (process.env.NOTION_RECURSOS_DB || 'c9062b0aa21f4816b841f5a9af473f8c').replace(/-/g, '');
const API = process.env.NOTION_API_BASE || 'https://api.notion.com';
const SITE = 'https://mauriciomarzese.com';
const ROOT = process.cwd();


async function notion(route, body) {
  for (let intento = 0; intento < 5; intento++) {
    const res = await fetch(API + route, {
      method: body ? 'POST' : 'GET',
      headers: { Authorization: `Bearer ${TOKEN}`, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 429) {
      await new Promise((r) => setTimeout(r, Number(res.headers.get('retry-after') || 1) * 1000));
      continue;
    }
    if (!res.ok) throw new Error(`Notion ${res.status} en ${route}: ${await res.text()}`);
    return res.json();
  }
  throw new Error(`Notion: demasiados reintentos en ${route}`);
}

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const txt = (p) => (p?.rich_text || p?.title || []).map((t) => t.plain_text).join('').trim();
const slugify = (s) =>
  String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);

async function main() {
  let results = [];
  let cursor;
  do {
    const r = await notion(`/v1/databases/${DB}/query`, {
      filter: { property: 'Estado', select: { equals: 'Publicado' } },
      sorts: [{ timestamp: 'created_time', direction: 'ascending' }],
      start_cursor: cursor,
      page_size: 100,
    });
    results.push(...r.results);
    cursor = r.has_more ? r.next_cursor : undefined;
  } while (cursor);

  const items = [];
  const vistos = new Set();
  for (const pg of results) {
    const p = pg.properties;
    const title = txt(p['Título']);
    const enlace = (p['Enlace']?.url || '').trim();
    if (!title) continue;
    if (!/^https?:\/\//i.test(enlace)) {
      console.log(`[recursos] "${title}" no tiene Enlace válido: se omite.`);
      continue;
    }
    const slug = slugify(txt(p['Slug']) || title);
    if (vistos.has(slug)) throw new Error(`Slug repetido en Recursos: ${slug}`);
    vistos.add(slug);
    items.push({ title, slug, enlace, desc: txt(p['Descripción']), formato: p['Formato']?.select?.name || '' });
  }
  console.log(`[recursos] Recursos publicados en Notion: ${items.length}`);
  if (!items.length) return;

  /* ---------- plantilla (de index.html) ---------- */
  const indexHtml = await fs.readFile(path.join(ROOT, 'index.html'), 'utf8');
  const grab = (re, what) => {
    const m = indexHtml.match(re);
    if (!m) throw new Error(`No encuentro ${what} en index.html`);
    return m[0];
  };
  const SPRITE = grab(/<svg width="0" height="0"[\s\S]*?<\/svg>/, 'el sprite SVG');
  const HEADER = grab(/<header class="top">[\s\S]*?<\/header>/, 'el header');
  const FOOTER = grab(/<footer>[\s\S]*?<\/footer>/, 'el footer');
  const FAB = grab(/<a class="fab wa"[\s\S]*?<\/a>/, 'el botón de WhatsApp');

  const headerFor = (current) => {
    let h = HEADER.replace(/ aria-current="page"/g, '');
    if (!h.includes('href="/recursos/"')) h = h.replace('</ul>', '<li><a href="/recursos/">Recursos</a></li></ul>');
    if (current === 'recursos') h = h.replace('<a href="/recursos/">', '<a href="/recursos/" aria-current="page">');
    return h;
  };
  const footerWith = () => (FOOTER.includes('href="/recursos/"') ? FOOTER : FOOTER.replace('</nav>', '<a href="/recursos/">Recursos</a></nav>'));

  const layout = ({ url, title, desc, body, index = true, extraScript = '' }) => `<!DOCTYPE html>
<html lang="es-AR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="color-scheme" content="light">
<meta name="theme-color" content="#171A18">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
${index ? '' : '<meta name="robots" content="noindex, nofollow">\n'}<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<link rel="canonical" href="${url}">
<meta property="og:type" content="website">
<meta property="og:locale" content="es_AR">
<meta property="og:site_name" content="Mauricio Marzese">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${url}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:ital,wght@0,400;0,500;0,600;0,700;0,800;1,700;1,800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/styles.css">
<link rel="stylesheet" href="/blog.css">
</head>
<body>

${SPRITE}

${headerFor('recursos')}

<main>

${body}

</main>

${footerWith()}

${FAB}

<script src="/script.js"></script>
${extraScript}
</body>
</html>
`;

  const head = (pill, h1, sub) => `<section class="s-blue blog-head">
  <div class="fx" aria-hidden="true"><i></i><i></i><i></i></div>
  <div class="wrap center-head">
    <span class="pill">${pill}</span>
    <h1>${h1}</h1>
    ${sub ? `<p class="sub">${sub}</p>` : ''}
  </div>
</section>`;

  await fs.mkdir(path.join(ROOT, 'recursos', 'gracias'), { recursive: true });

  /* ---------- listado ---------- */
  const cards = items
    .map(
      (x) => `<a class="bcard rcard" href="/recursos/${x.slug}/">
      <div class="bbody">
        ${x.formato ? `<span class="bcat">${esc(x.formato)}</span>` : ''}
        <h2>${esc(x.title)}</h2>
        ${x.desc ? `<p>${esc(x.desc)}</p>` : ''}
        <span class="rgo">Quiero este recurso &rarr;</span>
      </div>
    </a>`
    )
    .join('\n    ');
  await fs.writeFile(
    path.join(ROOT, 'recursos', 'index.html'),
    layout({
      url: SITE + '/recursos/',
      title: 'Recursos gratuitos para tu negocio | Mauricio Marzese',
      desc: 'Guías, plantillas y checklists gratuitos sobre contenido, anuncios y ventas por WhatsApp para negocios.',
      body: `${head('Recursos', 'Recursos gratuitos <span class="hl">para tu negocio</span>', 'Dejá tu nombre y correo y descargalo al instante.')}

<section class="s-white">
  <div class="wrap">
    <div class="bgrid">
    ${cards}
    </div>
  </div>
</section>`,
    })
  );

  /* ---------- una página por recurso (formulario) ---------- */
  const formScript = `<script>
(function () {
  var f = document.getElementById('rform'); if (!f) return;
  var m = document.getElementById('rmsg');
  var e = new URLSearchParams(location.search).get('e');
  if (e) { m.textContent = e === '2' ? 'No pudimos registrar tu pedido. Probá de nuevo en unos minutos.' : 'Revisá tu nombre y tu correo e intentá de nuevo.'; m.hidden = false; }
  f.addEventListener('submit', function () { var b = f.querySelector('button[type=submit]'); if (b) { b.disabled = true; b.textContent = 'Enviando…'; } });
})();
</script>`;
  for (const x of items) {
    const dir = path.join(ROOT, 'recursos', x.slug);
    await fs.mkdir(dir, { recursive: true });
    const body = `${head('Recurso gratuito', esc(x.title), '')}

<section class="s-white">
  <div class="wrap rwrap">
    <div class="rinfo">
      ${x.formato ? `<span class="bcat">${esc(x.formato)}</span>` : ''}
      ${x.desc ? `<p class="rdesc">${esc(x.desc)}</p>` : ''}
      <a class="back-l" href="/recursos/">&larr; Ver todos los recursos</a>
    </div>
    <form class="rform" id="rform" method="post" action="/api/suscribir">
      <h2>Recibí el recurso</h2>
      <p id="rmsg" class="rerr" role="alert" hidden></p>
      <label>Nombre<input type="text" name="nombre" autocomplete="name" required maxlength="80"></label>
      <label>Correo<input type="email" name="correo" autocomplete="email" required maxlength="120"></label>
      <div class="hp" aria-hidden="true"><label>No completar<input type="text" name="web" tabindex="-1" autocomplete="off"></label></div>
      <label class="chk"><input type="checkbox" name="ok" value="1" required><span>Acepto que me envíen el recurso y novedades por correo. Podés pedir que borre tus datos cuando quieras.</span></label>
      <input type="hidden" name="r" value="${esc(x.slug)}">
      <input type="hidden" name="t" value="${esc(x.title)}">
      <button class="btn main" type="submit">Quiero el recurso</button>
    </form>
  </div>
</section>`;
    await fs.writeFile(
      path.join(dir, 'index.html'),
      layout({
        url: `${SITE}/recursos/${x.slug}/`,
        title: `${x.title} | Recursos | Mauricio Marzese`,
        desc: x.desc || `Recurso gratuito: ${x.title}`,
        body,
        extraScript: formScript,
      })
    );
  }

  /* ---------- gracias ---------- */
  const data = {};
  for (const x of items) data[x.slug] = { t: x.title, u: x.enlace };
  const lista = items.map((x) => `<li><a href="/recursos/${x.slug}/">${esc(x.title)}</a></li>`).join('');
  const graciasBody = `${head('Listo', '¡Gracias! <span class="hl">Acá está tu recurso</span>', '')}

<section class="s-white">
  <div class="wrap gwrap">
    <div id="gok" hidden>
      <p class="gtit" id="gtit"></p>
      <a class="btn main" id="gbtn" href="#" target="_blank" rel="noopener">Abrir recurso</a>
      <p class="gnote">Guardá el enlace para tenerlo a mano.</p>
    </div>
    <div id="gno">
      <p class="gtit">Elegí el recurso que querés:</p>
      <ul class="glist">${lista}</ul>
    </div>
    <a class="back-l" href="/recursos/">&larr; Ver todos los recursos</a>
  </div>
</section>`;
  const gScript = `<script>
(function () {
  var D = ${JSON.stringify(data).replace(/</g, '\\u003c')};
  var r = new URLSearchParams(location.search).get('r');
  var d = r && Object.prototype.hasOwnProperty.call(D, r) ? D[r] : null;
  if (!d) return;
  document.getElementById('gtit').textContent = d.t;
  document.getElementById('gbtn').href = d.u;
  document.getElementById('gok').hidden = false;
  document.getElementById('gno').hidden = true;
})();
</script>`;
  await fs.writeFile(
    path.join(ROOT, 'recursos', 'gracias', 'index.html'),
    layout({ url: SITE + '/recursos/gracias/', title: 'Gracias | Mauricio Marzese', desc: 'Tu recurso gratuito.', body: graciasBody, index: false, extraScript: gScript })
  );

  /* ---------- menú y footer del resto del sitio ---------- */
  for (const f of ['index.html', 'publicidad-digital/index.html', 'diseno-web/index.html', 'mentoria/index.html']) {
    const fp = path.join(ROOT, f);
    let t;
    try { t = await fs.readFile(fp, 'utf8'); } catch { continue; }
    if (t.includes('href="/recursos/"')) continue;
    t = t
      .replace('</ul>\n        <a class="btn green sm wa"', '<li><a href="/recursos/">Recursos</a></li></ul>\n        <a class="btn green sm wa"')
      .replace('</nav>\n  </div>\n</footer>', '<a href="/recursos/">Recursos</a></nav>\n  </div>\n</footer>');
    await fs.writeFile(fp, t);
  }

  /* ---------- sitemap ---------- */
  const smPath = path.join(ROOT, 'sitemap.xml');
  let sm = await fs.readFile(smPath, 'utf8');
  sm = sm.replace(/\s*<url>\s*<loc>[^<]*\/recursos\/[^<]*<\/loc>[\s\S]*?<\/url>/g, '');
  const hoy = new Date().toISOString().slice(0, 10);
  const locs = ['/recursos/', ...items.map((x) => `/recursos/${x.slug}/`)];
  sm = sm.replace('</urlset>', locs.map((l) => `  <url>\n    <loc>${SITE}${l}</loc>\n    <lastmod>${hoy}</lastmod>\n  </url>\n`).join('') + '</urlset>');
  await fs.writeFile(smPath, sm);

  console.log(`[recursos] Listo: ${items.length} recurso(s) generados en /recursos/.`);
}

if (!TOKEN) {
  console.log('[recursos] NOTION_TOKEN no está definido: se omiten los recursos.');
} else {
  await main();
}
