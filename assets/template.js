import { header, footer, api, loadTemplates, won, esc, remember, toast, projectUrl } from './common.js';
import { productsOf, typeLabel, seriesCard, seriesUrl, bindHoverClips } from './series.js';

header();
footer();

// 템플릿 페이지: 디자인 하나의 샘플을 영상 종류별로 보고, 고른 종류로 만들기를 시작한다
const $ = (s) => document.querySelector(s);
const S = { data: null, series: null, items: [], cur: null };

function play(t) {
  S.cur = t;
  const tall = t.aspect === '9:16';
  const player = $('#player');
  player.classList.toggle('portrait', tall);
  player.innerHTML = t.sample
    ? `<video src="${esc(t.sample)}" poster="${esc(t.thumb || '')}" controls playsinline preload="metadata"></video>`
    : `<div class="wait"><b>샘플 영상을 준비하고 있어요</b></div>`;
  document.querySelectorAll('#kinds [data-code]').forEach(b => b.setAttribute('aria-checked', String(b.dataset.code === t.code)));
  const ok = t.status === 'available';
  const spec = [t.duration, t.photos && `사진 ${t.photos}장`, tall && '세로 화면'].filter(Boolean).join(' · ');
  $('#buy').innerHTML = ok
    ? `<div class="price-row"><span>${esc(typeLabel(S.data, t.category, t.type))}</span><b>${won(t.price)}</b>${t.listPrice ? `<s>${won(t.listPrice)}</s>` : ''}</div>
       <p class="small sub">${esc(spec)}</p>
       ${t.uhdPrice ? `<p class="small sub">풀HD 기본, 4K 초고화질은 ${won(t.uhdPrice)}</p>` : ''}
       <button class="btn lg block" type="button" id="makeBtn">이 영상 만들기</button>`
    : `<p class="soon-note">곧 출시돼요. 조금만 기다려 주세요.</p>`;
  history.replaceState(null, '', seriesUrl(S.series, t.type === S.items[0].type ? '' : t.type));
}

function renderKinds() {
  $('#kinds').innerHTML = S.items.map(t => {
    const ok = t.status === 'available';
    return `<button type="button" role="radio" class="kind" data-code="${t.code}" aria-checked="false">
      <span class="k-name"><b>${esc(typeLabel(S.data, t.category, t.type))}</b><small>${esc([t.duration, t.aspect === '9:16' ? '세로' : ''].filter(Boolean).join(' · '))}</small></span>
      <span class="k-price">${ok ? won(t.price) : '곧 출시'}</span></button>`;
  }).join('');
}

async function make(btn) {
  btn.disabled = true;
  try {
    const t = S.cur;
    const p = await api('/api/projects', { method: 'POST', body: { template: t.code } });
    remember({ id: p.id, token: p.token, template: t.code, name: t.name });
    location.href = projectUrl('make.html', p.id, p.token);
  } catch (err) { toast(err.message); btn.disabled = false; }
}

document.addEventListener('click', (e) => {
  const k = e.target.closest('#kinds [data-code]');
  if (k) { play(S.items.find(t => t.code === k.dataset.code)); const v = $('#player video'); if (v) v.play().catch(() => {}); return; }
  if (e.target.closest('#makeBtn')) make(e.target.closest('#makeBtn'));
});

(async () => {
  try {
    S.data = await loadTemplates();
    const q = new URLSearchParams(location.search);
    S.series = S.data.series.find(s => s.key === q.get('s'));
    if (!S.series) { location.replace('/#templates'); return; }
    S.items = productsOf(S.data, S.series);
    const cat = S.data.categories.find(c => c.key === S.series.category) || {};
    document.title = `${S.series.name} · ${cat.label} · 한편 필름`;
    $('#crumb').innerHTML = `<a href="/">홈</a><span aria-hidden="true">›</span><a href="/?cat=${esc(cat.key)}#templates">${esc(cat.label)}</a><span aria-hidden="true">›</span><b>${esc(S.series.name)}</b>`;
    $('#name').textContent = S.series.name;
    $('#tagline').textContent = S.series.tagline || '';
    $('#desc').textContent = S.series.desc || '';
    renderKinds();
    play(S.items.find(t => t.type === q.get('type')) || S.items[0]);
    const others = S.data.series.filter(s => s.key !== S.series.key && s.category === S.series.category && productsOf(S.data, s).length);
    $('#otherGrid').innerHTML = others.map(s => seriesCard(S.data, s)).join('');
    $('#others').classList.toggle('hidden', !others.length);
    bindHoverClips($('#otherGrid'));
  } catch (err) {
    $('#player').innerHTML = `<p class="error-text">${esc(err.message)}</p>`;
  }
})();
