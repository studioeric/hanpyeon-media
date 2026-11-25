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
  const spec = [t.duration, t.photos && `사진 ${t.photos}장`, t.videos ? `영상 ${t.videos}개` : '사진만으로 OK', tall && '세로 화면'].filter(Boolean).join(' · ');
  $('#buy').innerHTML = ok
    ? `<div class="price-row"><span>${esc(typeLabel(S.data, t.category, t.type))}</span><b>${won(t.price)}</b>${t.listPrice ? `<s>${won(t.listPrice)}</s>` : ''}</div>
       <p class="small sub">${esc(spec)}</p>
       ${t.uhdPrice ? `<p class="small sub">풀HD 기본 가격이에요. 4K 초고화질은 총 ${won(t.uhdPrice)}</p>` : ''}
       <button class="btn lg block" type="button" id="makeBtn">이 영상 만들기</button>
       <ul class="buy-facts small">
         <li><b>미리보기 무료</b> 내 사진으로 먼저 만들어 봐요 (워터마크가 있어요)</li>
         <li><b>가입 없이</b> 휴대폰 번호로 제작 내역을 다시 찾아요</li>
         <li><b>완성본</b> 결제 후 풀HD는 보통 1시간 안에 화면에서 바로 받아요 (워터마크 없음, MP4)</li>
         <li><b>안심</b> 제작에 실패하거나 24시간 안에 완성되지 않으면 전액 환불</li>
       </ul>
       ${prepGuide(t)}`
    : `<p class="soon-note">곧 출시돼요. 조금만 기다려 주세요.</p>`;
  history.replaceState(null, '', seriesUrl(S.series, t.type === S.items[0].type ? '' : t.type));
}

// 분야별 사진 준비표: 몇 장, 어떤 사진, 세로 사진 가능 여부
const PREP = {
  dol: ['태어난 날부터 지금까지 고르게 골라 주세요. 신생아, 백일, 첫 걸음, 돌 촬영 사진이 있으면 좋아요.', '휴대폰 사진첩 원본으로 넣으면 찍은 날짜순으로 자동 정리돼요.'],
  baby100: ['태어난 날부터 100일까지 사진을 고르게 골라 주세요. 조리원, 첫 목욕, 100일 촬영 사진이 있으면 좋아요.', '휴대폰 사진첩 원본으로 넣으면 찍은 날짜순으로 자동 정리돼요.'],
  wedding: ['처음 만난 무렵, 연애 시절 데이트, 웨딩 촬영 사진을 섞어 주세요. 스튜디오 사진이 없어도 일상 사진으로 충분해요.', '두 사람 얼굴이 잘 보이는 사진일수록 좋아요.'],
  parents: ['부모님의 젊은 시절, 결혼, 자녀와 함께한 날, 최근 가족사진 순서로 골라 주세요.', '앨범 속 옛날 사진은 휴대폰으로 반듯하게 찍어서 넣어도 돼요.']
};
function prepGuide(t) {
  const g = PREP[t.category] || PREP.dol;
  return `<details class="prep small"><summary>사진 준비 안내 (${t.photos ? `사진 ${t.photos}장` : '사진'}${t.videos ? `, 영상 ${t.videos}개` : ''})</summary><ul>
    ${g.map(x => `<li>${esc(x)}</li>`).join('')}
    <li>가로, 세로, 정사각형 어떤 사진이든 괜찮아요. 얼굴이 잘 보이게 자동으로 맞춰요.</li>
    <li>카카오톡으로 받은 사진은 화질이 낮고 찍은 날짜가 지워져 있어요. 되도록 원본을 넣어 주세요.</li>
    <li>미리보기를 보고 사진이나 문구를 바꿔 다시 만들 수 있어요.</li></ul></details>`;
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
