// 템플릿(디자인) 묶음 도우미: 한 디자인 안에 본편·오프닝·감사 영상·초대장 같은 영상 종류가 들어 있다
import { esc, won } from './common.js';

export const typesOf = (data, cat) => ((data.categories.find(c => c.key === cat) || {}).types) || data.types;
export const typeLabel = (data, cat, type) => (typesOf(data, cat).find(x => x.key === type) || {}).label || '';
export const shownOf = (t) => t.status === 'available' || !!t.sample;

// 디자인 하나에 딸린 상품들 (영상 종류 순서대로)
export function productsOf(data, s) {
  const order = typesOf(data, s.category).map(x => x.key);
  return data.templates.filter(t => t.series === s.key && shownOf(t))
    .sort((a, b) => order.indexOf(a.type) - order.indexOf(b.type) || (a.code < b.code ? -1 : 1));
}

export function seriesUrl(s, type) {
  return `/template?s=${encodeURIComponent(s.key)}${type ? `&type=${encodeURIComponent(type)}` : ''}`;
}

// 목록 카드: type이 정해지면 그 종류의 상품을, 아니면 디자인 대표(본편)를 보여 준다
export function seriesCard(data, s, type) {
  const items = productsOf(data, s);
  const p = (type && items.find(t => t.type === type)) || items.find(t => t.code === s.cover) || items[0];
  if (!p) return '';
  const ok = items.some(t => t.status === 'available');
  const tall = p.aspect === '9:16';
  const kinds = items.map(t => typeLabel(data, s.category, t.type)).filter((v, i, a) => v && a.indexOf(v) === i);
  const min = Math.min(...items.filter(t => t.status === 'available').map(t => t.price || Infinity));
  const price = type ? (p.status === 'available' ? won(p.price) : '') : (isFinite(min) ? `${won(min)}부터` : '');
  return `<a class="card tcard" href="${seriesUrl(s, type || '')}" data-clip="${esc(p.clip || '')}">
      <span class="th${tall ? ' tall' : ''}">
        ${p.thumb ? `<img src="${esc(p.thumb)}" alt="" decoding="async">` : ''}
        ${s.badge ? `<span class="badge">${esc(s.badge)}</span>` : ''}
        <span class="play" aria-hidden="true">▶ 샘플 보기</span>
      </span>
      <h3>${esc(s.name)}</h3>
      <p class="tag">${esc(type ? `${typeLabel(data, s.category, p.type)} · ${p.duration || ''}` : s.tagline || '')}</p>
      ${type ? '' : `<p class="kinds">${kinds.map(k => `<span>${esc(k)}</span>`).join('')}</p>`}
      ${ok && price ? `<span class="pill">${price}</span>` : `<span class="pill soon">곧 출시</span>`}
    </a>`;
}

// PC에서 마우스를 올리면 짧은 장면이 움직인다
export function bindHoverClips(root) {
  if (!window.matchMedia('(hover: hover)').matches) return;
  root.querySelectorAll('.tcard[data-clip]').forEach(card => {
    const clip = card.dataset.clip, box = card.querySelector('.th');
    if (!clip || !box) return;
    let vid;
    card.addEventListener('mouseenter', () => {
      if (!vid) {
        vid = document.createElement('video');
        Object.assign(vid, { src: clip, muted: true, loop: true, playsInline: true });
        vid.setAttribute('aria-hidden', 'true');
        box.insertBefore(vid, box.querySelector('.badge'));
      }
      vid.style.display = 'block';
      vid.play().catch(() => {});
    });
    card.addEventListener('mouseleave', () => { if (vid) { vid.pause(); vid.style.display = 'none'; } });
  });
}
