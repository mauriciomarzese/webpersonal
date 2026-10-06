  // Poné tu número con código de país, sin + ni espacios. Ej.: "549383XXXXXXX"
  var WHATSAPP_NUMBER = "+5493834464529";

  document.querySelectorAll('.wa').forEach(function (el) {
    var msg = encodeURIComponent(el.getAttribute('data-msg') || '');
    var base = WHATSAPP_NUMBER ? 'https://wa.me/' + WHATSAPP_NUMBER : 'https://wa.me/';
    el.setAttribute('href', base + '?text=' + msg);
    el.setAttribute('target', '_blank');
    el.setAttribute('rel', 'noopener');
  });

  // Carrusel con puntos
  var track = document.getElementById('track');
  var cards = track.querySelectorAll('.work');
  var dotsBox = document.getElementById('dots');
  var dots = [];
  cards.forEach(function (c, i) {
    var b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('aria-label', 'Ir al trabajo ' + (i + 1));
    b.addEventListener('click', function () { track.scrollTo({ left: c.offsetLeft - track.offsetLeft, behavior: 'smooth' }); });
    dotsBox.appendChild(b); dots.push(b);
  });
  function current() {
    var best = 0, d = Infinity;
    cards.forEach(function (c, i) {
      var diff = Math.abs((c.offsetLeft - track.offsetLeft) - track.scrollLeft);
      if (diff < d) { d = diff; best = i; }
    });
    if (track.scrollLeft + track.clientWidth >= track.scrollWidth - 4) best = cards.length - 1;
    return best;
  }
  function paint() { var cur = current(); dots.forEach(function (b, i) { b.setAttribute('aria-current', i === cur ? 'true' : 'false'); }); }
  track.addEventListener('scroll', function () { window.requestAnimationFrame(paint); });
  function go(dir) {
    var cur = current(), next = cur + dir;
    if (next >= cards.length) next = 0;
    if (next < 0) next = cards.length - 1;
    track.scrollTo({ left: cards[next].offsetLeft - track.offsetLeft, behavior: 'smooth' });
  }
  document.getElementById('prev').addEventListener('click', function () { go(-1); });
  document.getElementById('next').addEventListener('click', function () { go(1); });
  paint();

  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var paused = false;
  ['mouseenter', 'focusin', 'touchstart'].forEach(function (e) { track.addEventListener(e, function () { paused = true; }); });
  ['mouseleave', 'focusout'].forEach(function (e) { track.addEventListener(e, function () { paused = false; }); });
  if (!reduce) { setInterval(function () { if (!paused && !document.hidden && !document.querySelector('.vid.playing')) go(1); }, 4500); }

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
