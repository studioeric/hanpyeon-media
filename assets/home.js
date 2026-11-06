import { header, footer, loadTemplates, esc } from './common.js';
import { seriesCard, productsOf, typesOf, bindHoverClips } from './series.js';

header('home');
footer();

// 홈: 행사(카테고리) → 영상 종류 → 템플릿(디자인) 카드. 카드를 누르면 템플릿 페이지에서 샘플을 보고 만든다.
const state = { cat: 'all', type: '', data: null };
const $ = (s) => document.querySelector(s);
const ICON = { dol: '🎂', baby100: '👶', wedding: '💍', parents: '🌸' };

const seriesIn = (cat, type) => state.data.series.filter(s => (cat === 'all' || s.category === cat)
  && productsOf(state.data, s).some(t => !type || t.type === type));

function renderCats() {
  $('#quick').innerHTML = state.data.categories.map(c => {
    const n = seriesIn(c.key).length;
    return `<button class="cat-tile" type="button" data-go="${c.key}">
      <em aria-hidden="true">${ICON[c.key] || '🎬'}</em><b>${esc(c.label)}</b><small>${esc(c.sub || '')}</small>
      <span>${n ? `템플릿 ${n}개` : '준비 중'}</span></button>`;
  }).join('');
}

function render() {
  const { categories } = state.data;
  $('#cats').innerHTML = [{ key: 'all', label: '전체' }, ...categories].map(c =>
    `<button type="button" role="tab" data-cat="${c.key}" aria-selected="${c.key === state.cat}">${esc(c.label)}</button>`).join('');
  document.querySelectorAll('[data-nav-cat]').forEach(a => a.toggleAttribute('aria-current', a.dataset.navCat === state.cat));

  // 영상 종류 (카테고리를 골랐을 때만)
  const types = state.cat === 'all' ? [] : typesOf(state.data, state.cat);
  $('#types').innerHTML = types.length ? [{ key: '', label: '전체' }, ...types].map(t =>
    `<button type="button" data-type="${t.key}" aria-pressed="${t.key === state.type}">${esc(t.label)}</button>`).join('') : '';
  $('#types').classList.toggle('hidden', !types.length);

  const cats = state.cat === 'all' ? categories : categories.filter(c => c.key === state.cat);
  $('#grid').innerHTML = cats.map(c => {
    const list = seriesIn(c.key, state.type);
    const typeName = state.type ? (types.find(t => t.key === state.type) || {}).label : '';
    const body = list.length
      ? `<div class="grid">${list.map(s => seriesCard(state.data, s, state.type)).join('')}</div>`
      : `<p class="empty">${esc(typeName || c.label)} 템플릿을 준비하고 있어요. 곧 만나요.</p>`;
    return `<section class="cat-block">${state.cat === 'all'
      ? `<div class="cat-head"><h3>${esc(c.label)}</h3><span>${list.length}개 템플릿</span><button type="button" class="more" data-go="${c.key}">모두 보기</button></div>` : ''}${body}</section>`;
  }).join('');
  bindHoverClips($('#grid'));
}

function goTo(cat, type = '') {
  state.cat = cat; state.type = type; render();
  history.replaceState(null, '', cat === 'all' ? '/#templates' : `/?cat=${cat}${type ? `&type=${type}` : ''}#templates`);
  $('#templates').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
}

document.addEventListener('click', (e) => {
  const navCat = e.target.closest('a[data-nav-cat]');
  if (navCat && state.data) { e.preventDefault(); goTo(navCat.dataset.navCat); return; }
  const b = e.target.closest('button');
  if (!b || !state.data) return;
  if (b.dataset.go) goTo(b.dataset.go);
  else if (b.dataset.cat) { state.cat = b.dataset.cat; state.type = ''; render(); }
  else if (b.dataset.type != null) { state.type = b.dataset.type; render(); }
});

(async () => {
  try {
    state.data = await loadTemplates();
    const q = new URLSearchParams(location.search);
    if (state.data.categories.some(c => c.key === q.get('cat'))) state.cat = q.get('cat');
    if (state.cat !== 'all' && typesOf(state.data, state.cat).some(t => t.key === q.get('type'))) state.type = q.get('type');
    renderCats();
    render();
    if (q.get('cat') && location.hash === '#templates') $('#templates').scrollIntoView();
  } catch (err) {
    $('#grid').innerHTML = `<p class="error-text">${esc(err.message)}</p>`;
  }
})();
