// Poné tu número con código de país. Se limpian solos el "+", los espacios y los guiones.
// Formato Argentina celular: 549 + código de área + número. Ej.: "5493834464529"
var WHATSAPP_NUMBER = "5493834464529";

(function () {
  // Botones de WhatsApp
  var num = String(WHATSAPP_NUMBER).replace(/\D/g, '');
  document.querySelectorAll('.wa').forEach(function (el) {
    var msg = encodeURIComponent(el.getAttribute('data-msg') || '');
    var base = num ? 'https://wa.me/' + num : 'https://wa.me/';
    el.setAttribute('href', base + '?text=' + msg);
    el.setAttribute('target', '_blank');
    el.setAttribute('rel', 'noopener');
  });
})();

// Menú acordeón (celular y tablet)
(function () {
  var toggle = document.getElementById('menuToggle');
  var menu = document.getElementById('menu');
  if (!toggle || !menu) return;
  var mq = window.matchMedia('(max-width:1100px)');

  function set(open) {
    menu.classList.toggle('open', open);
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    toggle.setAttribute('aria-label', open ? 'Cerrar menú' : 'Abrir menú');
  }

  toggle.addEventListener('click', function () { set(!menu.classList.contains('open')); });
  menu.querySelectorAll('a').forEach(function (a) {
    a.addEventListener('click', function () { set(false); });
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && menu.classList.contains('open')) { set(false); toggle.focus(); }
  });
  document.addEventListener('click', function (e) {
    if (menu.classList.contains('open') && !menu.contains(e.target) && !toggle.contains(e.target)) set(false);
  });
  function sync() { if (!mq.matches) menu.classList.remove('open'); set(menu.classList.contains('open')); }
  if (mq.addEventListener) mq.addEventListener('change', sync); else mq.addListener(sync);
  sync();
})();

// Carrusel con puntos
(function () {
  var track = document.getElementById('track');
  if (!track) return;
  var cards = track.querySelectorAll('.work');
  var dotsBox = document.getElementById('dots');
  var dots = [];

  function posOf(c) { return c.offsetLeft - track.offsetLeft; }
  cards.forEach(function (c, i) {
    var b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('aria-label', 'Ir al trabajo ' + (i + 1));
    b.addEventListener('click', function () { track.scrollTo({ left: posOf(c), behavior: 'smooth' }); });
    dotsBox.appendChild(b); dots.push(b);
  });
  function current() {
    var best = 0, d = Infinity;
    cards.forEach(function (c, i) {
      var diff = Math.abs(posOf(c) - track.scrollLeft);
      if (diff < d) { d = diff; best = i; }
    });
    if (track.scrollLeft + track.clientWidth >= track.scrollWidth - 4) best = cards.length - 1;
    return best;
  }
  function paint() {
    var cur = current();
    dots.forEach(function (b, i) { b.setAttribute('aria-current', i === cur ? 'true' : 'false'); });
  }
  track.addEventListener('scroll', function () { window.requestAnimationFrame(paint); });
  function go(dir) {
    var cur = current(), next = cur + dir;
    if (next >= cards.length) next = 0;
    if (next < 0) next = cards.length - 1;
    track.scrollTo({ left: posOf(cards[next]), behavior: 'smooth' });
  }
  document.getElementById('prev').addEventListener('click', function () { go(-1); });
  document.getElementById('next').addEventListener('click', function () { go(1); });
  paint();

  // Autoplay: se pausa al tocar o pasar el mouse, y se retoma solo
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var paused = false, resumeTimer;
  function pause() { paused = true; clearTimeout(resumeTimer); }
  function resume(ms) { clearTimeout(resumeTimer); resumeTimer = setTimeout(function () { paused = false; }, ms || 0); }
  ['mouseenter', 'focusin', 'touchstart'].forEach(function (e) { track.addEventListener(e, pause, { passive: true }); });
  ['mouseleave', 'focusout'].forEach(function (e) { track.addEventListener(e, function () { resume(0); }); });
  ['touchend', 'touchcancel'].forEach(function (e) { track.addEventListener(e, function () { resume(6000); }, { passive: true }); });
  if (!reduce) {
    setInterval(function () {
      if (!paused && !document.hidden && !document.querySelector('.vid.playing')) go(1);
    }, 4500);
  }
})();

// Videos: reproducir con botón, un solo video a la vez y botón de sonido
(function () {
  var OFF = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M16 9.5l5 5M21 9.5l-5 5"/></svg>';
  var ON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4.2 4.2 0 0 1 0 6"/><path d="M18.3 6.5a8 8 0 0 1 0 11"/></svg>';
  var items = [];

  function paint(it) {
    var muted = it.video.muted;
    it.snd.setAttribute('aria-pressed', muted ? 'false' : 'true');
    it.snd.innerHTML = (muted ? OFF : ON) + '<span>' + (muted ? 'Activar sonido' : 'Silenciar') + '</span>';
  }

  document.querySelectorAll('.vid').forEach(function (box) {
    var video = box.querySelector('video');
    if (!video) return;
    function hasSrc() { return video.getAttribute('src') || video.querySelector('source'); }
    if (hasSrc()) box.classList.add('live');

    var play = document.createElement('button');
    play.type = 'button';
    play.className = 'pbtn';
    play.setAttribute('aria-label', 'Reproducir video');
    var snd = document.createElement('button');
    snd.type = 'button';
    snd.className = 'snd';
    box.appendChild(play);
    box.appendChild(snd);

    var it = { box: box, video: video, snd: snd };
    items.push(it);
    video.muted = false;
    paint(it);

    function start() {
      if (!hasSrc()) return;
      var p = video.play();
      if (p && p.catch) p.catch(function () {});
    }
    play.addEventListener('click', start);
    video.addEventListener('click', function () { if (video.paused) start(); else video.pause(); });

    video.addEventListener('play', function () {
      items.forEach(function (o) { if (o !== it) o.video.pause(); });
      box.classList.add('playing');
      paint(it);
    });
    video.addEventListener('pause', function () { box.classList.remove('playing'); });
    video.addEventListener('ended', function () { box.classList.remove('playing'); });

    snd.addEventListener('click', function () { video.muted = !video.muted; paint(it); });
  });
})();
