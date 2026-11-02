/* Pliage — animation d'ouverture : une feuille carrée se plie et devient l'oiseau du logo. */
(function () {
  // Quatre triangles : corps, aile, tête, bec
  const SQUARE = [[[30, 90], [90, 90], [60, 60]], [[60, 60], [90, 90], [90, 30]], [[30, 90], [30, 30], [60, 60]], [[30, 30], [90, 30], [60, 60]]];
  const FOLD = [[[30, 90], [90, 90], [60, 60]], [[60, 60], [90, 90], [90, 30]], [[30, 90], [90, 90], [60, 60]], [[90, 90], [90, 30], [60, 60]]];
  const BIRD = [[[39, 87], [97, 87], [67, 59]], [[67, 59], [97, 87], [93, 33]], [[39, 87], [29, 59], [51, 77]], [[29, 59], [23, 63], [33, 65]]];

  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const back = (t) => { const c1 = 1.5, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
  const lerp = (a, b, t) => a.map((tri, i) => tri.map((p, j) => [p[0] + (b[i][j][0] - p[0]) * t, p[1] + (b[i][j][1] - p[1]) * t]));

  function play() {
    const root = document.getElementById('intro');
    if (!root) return;
    const dark = document.documentElement.dataset.theme === 'dark';
    const c1 = dark ? '#EDE6DA' : '#7B1E2B', c2 = dark ? '#B8AEA2' : '#5A1520';
    root.innerHTML = `<div class="intro-in"><svg viewBox="0 0 120 120" aria-hidden="true">${[0, 1, 2, 3].map((i) => `<polygon data-i="${i}"/>`).join('')}</svg><div class="intro-w">Pliage</div></div>`;
    const polys = [...root.querySelectorAll('polygon')];
    const svgEl = root.querySelector('svg');
    const word = root.querySelector('.intro-w');
    const draw = (shape, shade) => polys.forEach((p, i) => {
      p.setAttribute('points', shape[i].map((q) => q[0].toFixed(2) + ',' + q[1].toFixed(2)).join(' '));
      const dk = i === 1 || i === 3;
      p.setAttribute('fill', dk && shade ? c2 : c1);
      if (dk) p.setAttribute('fill-opacity', shade ? 1 : 1);
    });
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      root.classList.add('out');
      setTimeout(() => root.remove(), 380);
    };
    root.addEventListener('click', finish);
    if (reduce) {
      draw(BIRD, true);
      word.style.opacity = 1;
      setTimeout(finish, 600);
      return;
    }
    const t0 = performance.now();
    const frame = (now) => {
      if (done) return;
      const t = now - t0;
      if (t < 320) {
        const k = ease(t / 320);
        svgEl.style.transform = `scale(${0.7 + 0.3 * k}) rotate(${(1 - k) * -8}deg)`;
        svgEl.style.opacity = k;
        draw(SQUARE, false);
      } else if (t < 760) {
        svgEl.style.transform = '';
        svgEl.style.opacity = 1;
        draw(lerp(SQUARE, FOLD, ease((t - 320) / 440)), t > 500);
      } else if (t < 860) {
        draw(FOLD, true);
      } else if (t < 1400) {
        draw(lerp(FOLD, BIRD, back((t - 860) / 540)), true);
      } else {
        draw(BIRD, true);
        const k = Math.min(1, (t - 1400) / 350);
        word.style.opacity = k;
        word.style.transform = `translateY(${(1 - ease(k)) * 10}px)`;
      }
      if (t < 2150) requestAnimationFrame(frame);
      else finish();
    };
    requestAnimationFrame(frame);
  }

  function skip() {
    const root = document.getElementById('intro');
    if (root) root.remove();
  }

  window.Intro = { play, skip };
})();
