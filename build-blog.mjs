// Genera el blog a partir de una base de datos de Notion.
// Se ejecuta en cada deploy de Cloudflare (comando de build: node build-blog.mjs).
// Requiere la variable de entorno NOTION_TOKEN. Sin token, no hace nada.
import fs from 'node:fs/promises';
import path from 'node:path';

// Primero los recursos gratuitos (/recursos/); si fallan, el blog sigue igual.
try { await import('./build-recursos.mjs'); } catch (e) { console.log('[recursos] Error, se omiten:', e.message); }

const TOKEN = process.env.NOTION_TOKEN;
const DB = (process.env.NOTION_BLOG_DB || '741195c4c9324acabb2591b83d006f57').replace(/-/g, '');
const API = process.env.NOTION_API_BASE || 'https://api.notion.com';
const SITE = 'https://mauriciomarzese.com';
const ROOT = process.cwd();

if (!TOKEN) {
  console.log('[blog] NOTION_TOKEN no está definido: se omite el blog.');
  process.exit(0);
}

/* ---------- Notion ---------- */
async function notion(route, body) {
  for (let intento = 0; intento < 5; intento++) {
    const res = await fetch(API + route, {
      method: body ? 'POST' : 'GET',
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 429) {
      const espera = Number(res.headers.get('retry-after') || 1);
      await new Promise((r) => setTimeout(r, espera * 1000));
      continue;
    }
    if (!res.ok) throw new Error(`Notion ${res.status} en ${route}: ${await res.text()}`);
    return res.json();
  }
  throw new Error(`Notion: demasiados reintentos en ${route}`);
}

async function queryPosts() {
  const out = [];
  let cursor;
  do {
    const r = await notion(`/v1/databases/${DB}/query`, {
      filter: { property: 'Estado', status: { equals: 'Publicado' } },
      sorts: [{ property: 'Fecha', direction: 'descending' }],
      start_cursor: cursor,
      page_size: 100,
    });
    out.push(...r.results);
    cursor = r.has_more ? r.next_cursor : undefined;
  } while (cursor);
  return out;
}

async function getBlocks(id) {
  const out = [];
  let cursor;
  do {
    const r = await notion(`/v1/blocks/${id}/children?page_size=100${cursor ? `&start_cursor=${cursor}` : ''}`);
    out.push(...r.results);
    cursor = r.has_more ? r.next_cursor : undefined;
  } while (cursor);
  for (const b of out) if (b.has_children) b.children = await getBlocks(b.id);
  return out;
}

/* ---------- utilidades ---------- */
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const plain = (rt) => (rt || []).map((t) => t.plain_text).join('');
const slugify = (s) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const fechaLarga = (iso) =>
  new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(iso + 'T12:00:00Z'));

function rich(rt) {
  return (rt || [])
    .map((t) => {
      let s = esc(t.plain_text).replace(/\n/g, '<br>');
      const a = t.annotations || {};
      if (a.code) s = `<code>${s}</code>`;
      if (a.bold) s = `<strong>${s}</strong>`;
      if (a.italic) s = `<em>${s}</em>`;
      if (a.strikethrough) s = `<s>${s}</s>`;
      if (a.underline) s = `<u>${s}</u>`;
      if (t.href) {
        const ext = /^https?:\/\//.test(t.href) && !t.href.startsWith(SITE);
        s = `<a href="${esc(t.href)}"${ext ? ' target="_blank" rel="noopener"' : ''}>${s}</a>`;
      }
      return s;
    })
    .join('');
}

/* ---------- imágenes ---------- */
let imgCount = 0;
async function saveImage(url, slug) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`No se pudo bajar la imagen (${res.status}): ${url.slice(0, 80)}`);
  const type = (res.headers.get('content-type') || '').split(';')[0];
  const mapa = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/svg+xml': 'svg', 'image/avif': 'avif' };
  let ext = mapa[type] || path.extname(new URL(url).pathname).replace('.', '').toLowerCase() || 'jpg';
  const name = `${slug}-${++imgCount}.${ext}`;
  await fs.mkdir(path.join(ROOT, 'blog', 'img'), { recursive: true });
  await fs.writeFile(path.join(ROOT, 'blog', 'img', name), Buffer.from(await res.arrayBuffer()));
  return `/blog/img/${name}`;
}
const fileUrl = (f) => (f?.type === 'file' ? f.file.url : f?.external?.url);

/* ---------- bloques -> HTML ---------- */
async function renderBlocks(blocks, slug, title) {
  let html = '';
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    const d = b[b.type];
    const kids = b.children ? await renderBlocks(b.children, slug, title) : '';
    switch (b.type) {
      case 'paragraph':
        html += plain(d.rich_text).trim() || kids ? `<p>${rich(d.rich_text)}</p>${kids}\n` : '';
        break;
      case 'heading_1': html += `<h2>${rich(d.rich_text)}</h2>\n`; break;
      case 'heading_2': html += `<h3>${rich(d.rich_text)}</h3>\n`; break;
      case 'heading_3': html += `<h4>${rich(d.rich_text)}</h4>\n`; break;
      case 'bulleted_list_item':
      case 'numbered_list_item':
      case 'to_do': {
        const tag = b.type === 'numbered_list_item' ? 'ol' : 'ul';
        let items = '';
        while (i < blocks.length && (blocks[i].type === b.type)) {
          const x = blocks[i];
          const k = x.children ? await renderBlocks(x.children, slug, title) : '';
          items += `<li>${rich(x[x.type].rich_text)}${k}</li>`;
          i++;
        }
        i--;
        html += `<${tag}>${items}</${tag}>\n`;
        break;
      }
      case 'quote': html += `<blockquote>${rich(d.rich_text)}${kids}</blockquote>\n`; break;
      case 'callout': html += `<aside class="callout">${d.icon?.emoji ? `<span aria-hidden="true">${esc(d.icon.emoji)}</span>` : ''}<div>${rich(d.rich_text)}${kids}</div></aside>\n`; break;
      case 'divider': html += '<hr>\n'; break;
      case 'code': html += `<pre><code>${esc(plain(d.rich_text))}</code></pre>\n`; break;
      case 'toggle': html += `<details><summary>${rich(d.rich_text)}</summary>${kids}</details>\n`; break;
      case 'image': {
        const src = await saveImage(fileUrl(d), slug);
        const cap = plain(d.caption);
        html += `<figure><img src="${src}" alt="${esc(cap || title)}" loading="lazy">${cap ? `<figcaption>${esc(cap)}</figcaption>` : ''}</figure>\n`;
        break;
      }
      case 'bookmark':
      case 'embed':
      case 'link_preview':
        html += d.url ? `<p><a href="${esc(d.url)}" target="_blank" rel="noopener">${esc(plain(d.caption) || d.url)}</a></p>\n` : '';
        break;
      case 'table': {
        const rows = (b.children || []).map((r, ri) => {
          const tag = ri === 0 && d.has_column_header ? 'th' : 'td';
          return `<tr>${r.table_row.cells.map((c) => `<${tag}>${rich(c)}</${tag}>`).join('')}</tr>`;
        });
        html += `<div class="tbl"><table>${rows.join('')}</table></div>\n`;
        break;
      }
      case 'column_list':
      case 'column': html += kids; break;
      default:
        console.warn(`[blog] Bloque no soportado (${b.type}) en "${title}": se omite.`);
    }
  }
  return html;
}

/* ---------- plantilla ---------- */
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
const WA = '#wa';

function headerFor(current) {
  let h = HEADER.replace(/ aria-current="page"/g, '');
  if (!h.includes('href="/blog/"')) h = h.replace('</ul>', `<li><a href="/blog/"${current === 'blog' ? ' aria-current="page"' : ''}>Blog</a></li></ul>`);
  return h;
}
const footerWithBlog = () => (FOOTER.includes('href="/blog/"') ? FOOTER : FOOTER.replace('</nav>', '<a href="/blog/">Blog</a></nav>'));

function cta() {
  return `<section class="final s-white">
  <div class="wrap">
    <h2>¿Hablamos de tu <span class="hl">negocio</span>?</h2>
    <p>Contame qué querés lograr y te digo cómo seguimos.</p>
    <a class="btn main wa" data-msg="Hola Mauricio, leí tu blog y quiero que charlemos sobre mi negocio."><svg viewBox="0 0 24 24" aria-hidden="true"><use href="${WA}"/></svg>Quiero que charlemos</a>
  </div>
</section>`;
}

function layout({ url, title, desc, ogImage, ogType, ld, current, body }) {
  return `<!DOCTYPE html>
<html lang="es-AR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="color-scheme" content="light">
<meta name="theme-color" content="#171A18">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<link rel="canonical" href="${url}">
<meta property="og:type" content="${ogType}">
<meta property="og:locale" content="es_AR">
<meta property="og:site_name" content="Mauricio Marzese">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${url}">
${ogImage ? `<meta property="og:image" content="${ogImage}">\n` : ''}<script type="application/ld+json">
${JSON.stringify(ld)}
</script>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:ital,wght@0,400;0,500;0,600;0,700;0,800;1,700;1,800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/styles.css">
<link rel="stylesheet" href="/blog.css">
</head>
<body>

${SPRITE}

${headerFor(current)}

<main>

${body}

</main>

${footerWithBlog()}

${FAB}

<script src="/script.js"></script>
</body>
</html>
`;
}

/* ---------- proceso ---------- */
const pages = await queryPosts();
console.log(`[blog] Posts publicados en Notion: ${pages.length}`);
if (!pages.length) {
  console.log('[blog] No hay posts publicados: no se genera el blog.');
  process.exit(0);
}

await fs.rm(path.join(ROOT, 'blog'), { recursive: true, force: true });
const posts = [];
const usados = new Set();

for (const pg of pages) {
  const p = pg.properties;
  const title = plain(p['Título']?.title).trim();
  if (!title) { console.warn('[blog] Post sin título: se omite.'); continue; }
  let slug = slugify(plain(p.Slug?.rich_text) || title);
  if (usados.has(slug)) throw new Error(`Slug repetido: "${slug}". Cada post necesita un Slug distinto.`);
  usados.add(slug);
  const desc = plain(p['Descripción']?.rich_text).trim();
  if (!desc) console.warn(`[blog] "${title}" no tiene Descripción: Google va a mostrar un texto automático.`);
  const fecha = p.Fecha?.date?.start?.slice(0, 10) || pg.created_time.slice(0, 10);
  const categoria = p['Categoría']?.select?.name || '';
  const portadaUrl = fileUrl(p.Portada?.files?.[0]);
  const portada = portadaUrl ? await saveImage(portadaUrl, `${slug}-portada`) : '';
  const blocks = await getBlocks(pg.id);
  const content = await renderBlocks(blocks, slug, title);
  const words = content.replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length;
  posts.push({ title, slug, desc, fecha, categoria, portada, content, minutos: Math.max(1, Math.round(words / 200)), editado: pg.last_edited_time.slice(0, 10) });
}

/* páginas de cada post */
for (const x of posts) {
  const url = `${SITE}/blog/${x.slug}/`;
  const ld = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: x.title,
    description: x.desc,
    datePublished: x.fecha,
    dateModified: x.editado,
    inLanguage: 'es-AR',
    mainEntityOfPage: url,
    author: { '@type': 'Person', name: 'Mauricio Marzese', url: SITE + '/' },
    publisher: { '@type': 'Person', name: 'Mauricio Marzese' },
    ...(x.portada ? { image: SITE + x.portada } : {}),
  };
  const body = `<section class="s-blue post-head">
  <div class="fx" aria-hidden="true"><i></i><i></i><i></i></div>
  <div class="wrap">
    <a class="back" href="/blog/">&larr; Blog</a>
    ${x.categoria ? `<span class="pill">${esc(x.categoria)}</span>` : ''}
    <h1>${esc(x.title)}</h1>
    <p class="meta">${fechaLarga(x.fecha)} · ${x.minutos} min de lectura</p>
  </div>
</section>

<section class="s-white post-body">
  <article class="wrap post">
    ${x.portada ? `<img class="cover" src="${x.portada}" alt="${esc(x.title)}" width="1000" height="560">` : ''}
    ${x.content}
  </article>
</section>

${cta()}`;
  const dir = path.join(ROOT, 'blog', x.slug);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'index.html'), layout({ url, title: `${x.title} | Mauricio Marzese`, desc: x.desc, ogImage: x.portada ? SITE + x.portada : '', ogType: 'article', ld, current: 'blog', body }));
}

/* índice del blog */
const cards = posts
  .map(
    (x) => `<a class="bcard" href="/blog/${x.slug}/">
      ${x.portada ? `<img src="${x.portada}" alt="" loading="lazy" width="1000" height="560">` : '<div class="noimg" aria-hidden="true"></div>'}
      <div class="bbody">
        ${x.categoria ? `<span class="bcat">${esc(x.categoria)}</span>` : ''}
        <h2>${esc(x.title)}</h2>
        ${x.desc ? `<p>${esc(x.desc)}</p>` : ''}
        <span class="bdate">${fechaLarga(x.fecha)} · ${x.minutos} min</span>
      </div>
    </a>`
  )
  .join('\n    ');
const indexBody = `<section class="s-blue blog-head">
  <div class="fx" aria-hidden="true"><i></i><i></i><i></i></div>
  <div class="wrap center-head">
    <span class="pill">Blog</span>
    <h1>Artículos para <span class="hl">tu negocio</span></h1>
    <p class="sub">Contenido, anuncios y ventas por WhatsApp.</p>
  </div>
</section>

<section class="s-white">
  <div class="wrap">
    <div class="bgrid">
    ${cards}
    </div>
  </div>
</section>

${cta()}`;
await fs.writeFile(
  path.join(ROOT, 'blog', 'index.html'),
  layout({
    url: SITE + '/blog/',
    title: 'Blog de Marketing Digital | Mauricio Marzese',
    desc: 'Artículos sobre contenido, anuncios en Meta Ads y ventas por WhatsApp para negocios.',
    ogImage: '',
    ogType: 'website',
    ld: { '@context': 'https://schema.org', '@type': 'Blog', name: 'Blog de Mauricio Marzese', url: SITE + '/blog/', inLanguage: 'es-AR' },
    current: 'blog',
    body: indexBody,
  })
);

/* menú y footer del resto del sitio: agrega "Blog" */
for (const f of ['index.html', 'publicidad-digital/index.html', 'diseno-web/index.html', 'consultoria/index.html']) {
  const fp = path.join(ROOT, f);
  let t;
  try { t = await fs.readFile(fp, 'utf8'); } catch { continue; }
  if (t.includes('href="/blog/"')) continue;
  t = t.replace('</ul>\n        <a class="btn green sm wa"', '<li><a href="/blog/">Blog</a></li></ul>\n        <a class="btn green sm wa"').replace('</nav>\n  </div>\n</footer>', '<a href="/blog/">Blog</a></nav>\n  </div>\n</footer>');
  await fs.writeFile(fp, t);
}

/* sitemap */
const smPath = path.join(ROOT, 'sitemap.xml');
let sm = await fs.readFile(smPath, 'utf8');
sm = sm.replace(/\s*<url>\s*<loc>[^<]*\/blog\/[^<]*<\/loc>[\s\S]*?<\/url>/g, '');
const entradas = [{ loc: '/blog/', lastmod: posts[0].editado }, ...posts.map((x) => ({ loc: `/blog/${x.slug}/`, lastmod: x.editado }))];
sm = sm.replace('</urlset>', entradas.map((e) => `  <url>\n    <loc>${SITE}${e.loc}</loc>\n    <lastmod>${e.lastmod}</lastmod>\n  </url>\n`).join('') + '</urlset>');
await fs.writeFile(smPath, sm);

console.log(`[blog] Listo: ${posts.length} post(s) generados en /blog/.`);
