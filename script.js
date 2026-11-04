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

/* Fondo animado: puntos y líneas que se conectan (secciones oscuras) */
(function () {
  var secs = document.querySelectorAll('.s-blue');
  if (!secs.length || !window.requestAnimationFrame) return;
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var RGB = '169,211,143';
  secs.forEach(function (sec) {
    var cv = document.createElement('canvas');
    cv.className = 'net';
    cv.setAttribute('aria-hidden', 'true');
    var fx = sec.querySelector('.fx');
    sec.insertBefore(cv, fx ? fx.nextSibling : sec.firstChild);
    var ctx = cv.getContext('2d');
    if (!ctx) return;
    var w = 0, h = 0, pts = [], raf = 0, visible = false;
    function size() {
      var r = sec.getBoundingClientRect();
      w = r.width; h = r.height;
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      var n = Math.round(Math.min(36, Math.max(10, (w * h) / 30000)));
      if (w < 700) n = Math.round(n * 0.6);
      while (pts.length < n) pts.push({ x: Math.random() * w, y: Math.random() * h, vx: (Math.random() - 0.5) * 0.16, vy: (Math.random() - 0.5) * 0.16 });
      pts.length = n;
      draw();
    }
    function step() {
      for (var i = 0; i < pts.length; i++) {
        var p = pts[i];
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0 || p.x > w) p.vx *= -1;
        if (p.y < 0 || p.y > h) p.vy *= -1;
      }
    }
    function draw() {
      ctx.clearRect(0, 0, w, h);
      var L = w < 700 ? 110 : 150, i, j;
      ctx.lineWidth = 1;
      for (i = 0; i < pts.length; i++) {
        for (j = i + 1; j < pts.length; j++) {
          var dx = pts[i].x - pts[j].x, dy = pts[i].y - pts[j].y, d = Math.sqrt(dx * dx + dy * dy);
          if (d < L) {
            ctx.strokeStyle = 'rgba(' + RGB + ',' + ((1 - d / L) * 0.15).toFixed(3) + ')';
            ctx.beginPath(); ctx.moveTo(pts[i].x, pts[i].y); ctx.lineTo(pts[j].x, pts[j].y); ctx.stroke();
          }
        }
      }
      ctx.fillStyle = 'rgba(' + RGB + ',.28)';
      for (i = 0; i < pts.length; i++) {
        ctx.beginPath(); ctx.arc(pts[i].x, pts[i].y, 1.4, 0, 6.2832); ctx.fill();
      }
    }
    function loop() {
      if (!visible) { raf = 0; return; }
      step(); draw();
      raf = requestAnimationFrame(loop);
    }
    size();
    if (reduce) return;
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (es) {
        visible = es[0].isIntersecting;
        if (visible && !raf) raf = requestAnimationFrame(loop);
      }).observe(sec);
    } else { visible = true; raf = requestAnimationFrame(loop); }
    var t;
    window.addEventListener('resize', function () { clearTimeout(t); t = setTimeout(size, 200); });
  });
})();

/* Pasos interactivos */
(function () {
  var flow = document.getElementById('flow');
  if (!flow) return;
  var items = [].slice.call(flow.querySelectorAll('.fs'));
  function setProg(i) {
    var last = items[i].querySelector('.fn'), first = items[0].querySelector('.fn');
    var h = last.getBoundingClientRect().top - first.getBoundingClientRect().top;
    flow.style.setProperty('--prog', Math.max(0, h) + 'px');
  }
  function open(i) {
    items.forEach(function (li, k) {
      li.classList.toggle('on', k === i);
      li.classList.toggle('done', k < i);
      li.querySelector('button').setAttribute('aria-expanded', k === i ? 'true' : 'false');
    });
    setProg(i);
    setTimeout(function () { setProg(i); }, 650);
  }
  var canHover = window.matchMedia && matchMedia('(hover:hover)').matches;
  items.forEach(function (li, i) {
    var b = li.querySelector('button');
    b.addEventListener('click', function () { open(i); });
    if (canHover) b.addEventListener('mouseenter', function () { open(i); });
  });
  open(0);
  window.addEventListener('resize', function () {
    var k = items.findIndex(function (l) { return l.classList.contains('on'); });
    setProg(k < 0 ? 0 : k);
  });
})();
