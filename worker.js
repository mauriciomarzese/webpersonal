// Función de Cloudflare: guarda en Notion los contactos de /recursos/<slug>/ (/api/suscribir)
// y los leads del formulario de calificación /diagnostico/ (/api/diagnostico).
// Solo atiende /api/*. El resto del sitio lo sirven los archivos estáticos.
// Requiere el secreto NOTION_TOKEN (Variables y secretos del Worker).

const CONTACTOS_DB = '5047ac4e9e0840188c3e42ace5026d74';
const LEADS_DB = '9b181d3231d74518b6aa3240ae8e2d95';

const redirect = (url, to) => Response.redirect(new URL(to, url).toString(), 303);
const limpiar = (v, max) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/diagnostico') return diagnostico(request, env);
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

// Formulario de calificación del Sistema RITMO.
const OPCIONES = {
  ubicacion: ['Catamarca', 'Otra provincia'],
  precio: ['Menos de $100.000', 'Entre $100.000 y $350.000', 'Más de $350.000'],
  sino: ['Sí', 'No'],
};
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
const elegir = (v, lista) => (lista.includes(v) ? { select: { name: v } } : undefined);

async function diagnostico(request, env) {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: { Allow: 'POST' } });
  let d;
  try { d = await request.json(); } catch { return json({ ok: false }, 400); }
  if (limpiar(d.web, 200)) return json({ ok: true }); // trampa para robots

  const califica = d.resultado === 'Califica';
  const nombre = limpiar(d.nombre, 80);
  const tel = limpiar(d.tel, 30);
  if (califica && (nombre.length < 2 || tel.replace(/\D/g, '').length < 8)) return json({ ok: false }, 400);
  if (!env.NOTION_TOKEN) { console.error('Falta el secreto NOTION_TOKEN'); return json({ ok: false }, 500); }

  const props = {
    Nombre: { title: [{ text: { content: nombre || 'Sin datos' } }] },
    Resultado: { select: { name: califica ? 'Califica' : 'No califica' } },
    Rubro: { rich_text: [{ text: { content: limpiar(d.rubro, 200) } }] },
    Origen: { rich_text: [{ text: { content: limpiar(d.origen, 200) } }] },
    Fecha: { date: { start: new Date().toISOString() } },
  };
  if (tel) props.WhatsApp = { phone_number: tel };
  const sel = {
    'Ubicación': elegir(d.ubicacion, OPCIONES.ubicacion),
    'Precio promedio': elegir(d.precio, OPCIONES.precio),
    'Presupuesto $700.000': elegir(d.presupuesto, OPCIONES.sino),
    'Aparece en videos': elegir(d.camara, OPCIONES.sino),
    'Atención WhatsApp': elegir(d.atencion, OPCIONES.sino),
  };
  for (const k in sel) if (sel[k]) props[k] = sel[k];

  const res = await fetch('https://api.notion.com/v1/pages', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.NOTION_TOKEN}`, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' },
    body: JSON.stringify({ parent: { database_id: env.LEADS_DB || LEADS_DB }, properties: props }),
  });
  if (!res.ok) { console.error('Notion respondió', res.status, await res.text()); return json({ ok: false }, 502); }
  return json({ ok: true });
}
