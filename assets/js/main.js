// Mobile menu
const nav = document.querySelector('.nav');
const menuBtn = document.querySelector('.menu-btn');
if (nav && menuBtn) {
  menuBtn.addEventListener('click', () => {
    const open = nav.classList.toggle('open');
    menuBtn.setAttribute('aria-expanded', String(open));
  });
}

// Reveal on scroll
const io = 'IntersectionObserver' in window
  ? new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
      });
    }, { threshold: 0.12 })
  : null;
document.querySelectorAll('.reveal').forEach((el) => (io ? io.observe(el) : el.classList.add('in')));

// Card spotlight follows cursor
document.querySelectorAll('.card').forEach((card) => {
  card.addEventListener('pointermove', (e) => {
    const r = card.getBoundingClientRect();
    card.style.setProperty('--mx', `${e.clientX - r.left}px`);
    card.style.setProperty('--my', `${e.clientY - r.top}px`);
  });
});

// Footer year
const y = document.getElementById('year');
if (y) y.textContent = new Date().getFullYear();

// Products page category filter
const filterBtns = document.querySelectorAll('[data-filter]');
filterBtns.forEach((btn) => {
  btn.addEventListener('click', () => {
    const f = btn.dataset.filter;
    filterBtns.forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
    document.querySelectorAll('.cat-section').forEach((sec) => { sec.hidden = f !== 'all' && sec.dataset.cat !== f; });
  });
});

// Stacked brand cards: shrink and dim a pinned card as the next one slides over it
const stacks = document.querySelectorAll('.stack');
if (stacks.length && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
  const cards = [];
  stacks.forEach((st) => st.querySelectorAll('.brand-block').forEach((c, i, all) => {
    c.style.setProperty('--i', String(Math.min(i, 6)));
    cards.push({ el: c, next: all[i + 1] || null });
  }));
  let ticking = false;
  const update = () => {
    ticking = false;
    const vh = window.innerHeight;
    cards.forEach(({ el }) => {
      // A card taller than the space below the header would hide its own bottom while pinned
      const top = 92 + (parseInt(el.style.getPropertyValue('--i'), 10) || 0) * 10;
      el.classList.toggle('no-stick', el.offsetHeight > vh - top - 12);
    });
    cards.forEach(({ el, next }) => {
      if (!next || getComputedStyle(el).position !== 'sticky') { el.style.transform = ''; el.style.filter = ''; return; }
      const top = parseFloat(getComputedStyle(next).top) || 0;
      const nTop = next.getBoundingClientRect().top;
      const p = Math.min(1, Math.max(0, 1 - (nTop - top) / (vh - top)));
      el.style.transform = p ? `scale(${1 - p * 0.06})` : '';
      el.style.filter = p ? `brightness(${1 - p * 0.5})` : '';
    });
  };
  const onScroll = () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } };
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
  window.addEventListener('load', onScroll);
  document.querySelectorAll('[data-filter]').forEach((b) => b.addEventListener('click', onScroll));
  update();
}

// Home showcase: shuffle products on every visit, then glide rows sideways with scroll
const showcase = document.querySelector('.showcase');
if (showcase) {
  const rows = [...showcase.querySelectorAll('.sc-row')];
  const items = rows.flatMap((r) => [...r.children]);
  for (let i = items.length - 1; i > 0; i--) {
    const k = Math.floor(Math.random() * (i + 1));
    [items[i], items[k]] = [items[k], items[i]];
  }
  items.forEach((el, i) => rows[i % rows.length].appendChild(el));
  if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    let ticking = false;
    const move = () => {
      ticking = false;
      const r = showcase.getBoundingClientRect();
      const vh = window.innerHeight;
      if (r.bottom < -200 || r.top > vh + 200) return;
      const p = Math.min(1, Math.max(0, (vh - r.top) / (vh + r.height)));
      rows.forEach((row) => {
        const range = Math.max(0, row.scrollWidth - showcase.clientWidth);
        const x = Number(row.dataset.dir) < 0 ? -p * range : -(1 - p) * range;
        row.style.transform = `translate3d(${x.toFixed(1)}px, 0, 0)`;
      });
    };
    const req = () => { if (!ticking) { ticking = true; requestAnimationFrame(move); } };
    window.addEventListener('scroll', req, { passive: true });
    window.addEventListener('resize', req);
    window.addEventListener('load', req);
    move();
  }
}
