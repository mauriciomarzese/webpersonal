// Función de Cloudflare: recibe el formulario de /recursos/<slug>/ y guarda el contacto en Notion.
// Solo atiende /api/*. El resto del sitio lo sirven los archivos estáticos.
// Requiere el secreto NOTION_TOKEN (Variables y secretos del Worker).

const CONTACTOS_DB = '5047ac4e9e0840188c3e42ace5026d74';

const redirect = (url, to) => Response.redirect(new URL(to, url).toString(), 303);
const limpiar = (v, max) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname !== '/api/suscribir') return new Response('Not found', { status: 404 });
    if (request.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: { Allow: 'POST' } });

    let form;
    try { form = await request.formData(); } catch { return redirect(url, '/recursos/'); }

    const slug = limpiar(form.get('r'), 80).toLowerCase().replace(/[^a-z0-9-]/g, '');
    const volver = (e) => redirect(url, slug ? `/recursos/${slug}/?e=${e}` : '/recursos/');

    // Campo trampa para robots: si viene completo, se ignora sin avisar.
    if (limpiar(form.get('web'), 200)) return redirect(url, `/recursos/gracias/?r=${slug}`);

    const nombre = limpiar(form.get('nombre'), 80);
    const correo = limpiar(form.get('correo'), 120).toLowerCase();
    const titulo = limpiar(form.get('t'), 120) || slug;
    const okRe = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
    if (!slug || nombre.length < 2 || !okRe.test(correo) || form.get('ok') !== '1') return volver(1);
    if (!env.NOTION_TOKEN) { console.error('Falta el secreto NOTION_TOKEN'); return volver(2); }

    const res = await fetch('https://api.notion.com/v1/pages', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.NOTION_TOKEN}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        parent: { database_id: env.CONTACTOS_DB || CONTACTOS_DB },
        properties: {
          Nombre: { title: [{ text: { content: nombre } }] },
          Correo: { email: correo },
          Recurso: { rich_text: [{ text: { content: titulo } }] },
          Fecha: { date: { start: new Date().toISOString() } },
        },
      }),
    });
    if (!res.ok) {
      console.error('Notion respondió', res.status, await res.text());
      return volver(2);
    }
    return redirect(url, `/recursos/gracias/?r=${slug}`);
  },
};
