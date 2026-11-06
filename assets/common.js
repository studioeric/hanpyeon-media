// 한편 필름 공통 스크립트: 머리말·바닥글, API 호출, 제작 내역 저장
export const BIZ = {
  name: '쿼브',
  ceo: '이동성',
  bizNo: '309-05-67693',
  // 비어 있는 칸은 바닥글에 나오지 않아요. 정해지면 채우고 다시 배포하세요.
  mailOrderNo: '',   // 통신판매업 신고번호
  address: '',       // 사업장 주소
  kakao: '',         // 카카오톡 채널 이름
  email: '',         // 고객센터 이메일
  effective: ''      // 약관 시행일 (예: 2026년 11월 1일)
};

export const STATUS = {
  draft: { label: '만드는 중', tone: '' },
  preview_queued: { label: '미리보기 대기', tone: '' },
  preview_rendering: { label: '미리보기 만드는 중', tone: '' },
  preview_ready: { label: '미리보기 완성', tone: 'ok' },
  failed: { label: '미리보기 실패', tone: 'warn' },
  final_queued: { label: '결제 완료 · 대기', tone: 'ok' },
  final_rendering: { label: '완성 영상 만드는 중', tone: 'ok' },
  final_failed: { label: '완성 영상 확인 중', tone: 'warn' },
  delivered: { label: '완성', tone: 'ok' },
  expired: { label: '보관 기간 끝남', tone: '' }
};

const MARK = `<svg class="logo-mark" viewBox="0 0 32 32" aria-hidden="true"><rect x="3" y="5" width="26" height="22" rx="4" fill="#3A1427"/><g fill="#fff"><rect x="6" y="7.5" width="3" height="2.4" rx=".8"/><rect x="11.2" y="7.5" width="3" height="2.4" rx=".8"/><rect x="16.4" y="7.5" width="3" height="2.4" rx=".8"/><rect x="21.6" y="7.5" width="3" height="2.4" rx=".8"/><rect x="6" y="22.1" width="3" height="2.4" rx=".8"/><rect x="11.2" y="22.1" width="3" height="2.4" rx=".8"/><rect x="16.4" y="22.1" width="3" height="2.4" rx=".8"/><rect x="21.6" y="22.1" width="3" height="2.4" rx=".8"/></g><path d="M16 19.6s-4-2.4-4-5.1a2.2 2.2 0 0 1 4-1.3 2.2 2.2 0 0 1 4 1.3c0 2.7-4 5.1-4 5.1z" fill="#E8708F"/></svg>`;

const CATS = [['dol', '돌잔치'], ['baby100', '백일'], ['wedding', '웨딩'], ['parents', '환갑·칠순']];

export function header(active) {
  const el = document.querySelector('[data-site-head]');
  if (!el) return;
  el.className = 'site-head';
  el.innerHTML = `
    <div class="wrap">
      <a class="logo" href="/">한편<i>필름</i></a>
      <nav class="nav-cats" aria-label="행사 종류">
        ${CATS.map(([k, l]) => `<a href="/?cat=${k}#templates" data-nav-cat="${k}">${l}</a>`).join('')}
        <a class="hide-m" href="/faq"${active === 'faq' ? ' aria-current="page"' : ''}>자주 묻는 질문</a>
      </nav>
      <nav class="nav" aria-label="주 메뉴">
        <a href="/orders"${active === 'orders' ? ' aria-current="page"' : ''}>제작 내역</a>
      </nav>
    </div>`;
}

export function bizLines() {
  const row = (items) => items.filter(([, v]) => v).map(([k, v]) => `${k} ${esc(v)}`).join(' · ');
  return [
    row([['상호', BIZ.name], ['대표', BIZ.ceo], ['사업자등록번호', BIZ.bizNo]]),
    row([['통신판매업 신고', BIZ.mailOrderNo], ['주소', BIZ.address]]),
    row([['고객센터', [BIZ.kakao, BIZ.email].filter(Boolean).join(' · ')]])
  ].filter(Boolean).join('<br>');
}

export function footer() {
  const contact = [BIZ.kakao && `카카오톡 ${BIZ.kakao}`, BIZ.email].filter(Boolean).join(' · ');
  document.querySelectorAll('[data-biz]').forEach(n => { const v = n.dataset.biz === 'contact' ? contact : BIZ[n.dataset.biz]; if (v) n.textContent = v; });
  document.querySelectorAll('[data-biz-show]').forEach(n => { if (!BIZ[n.dataset.bizShow]) n.hidden = true; });
  // 사업자 정보는 바닥글 대신 이용약관과 결제 화면에만 보여 준다
  document.querySelectorAll('[data-biz-info]').forEach(n => { n.innerHTML = bizLines(); });
  const el = document.querySelector('[data-site-foot]');
  if (!el) return;
  el.className = 'site-foot';
  el.innerHTML = `
    <div class="wrap">
      <span class="brand">한편<i>필름</i></span>
      <nav class="foot-links" aria-label="안내">
        <a href="/terms">이용약관</a>
        <a href="/privacy"><b>개인정보처리방침</b></a>
        <a href="/refund">환불 규정</a>
        <a href="/faq">자주 묻는 질문</a>
        <a href="/partner">제휴문의</a>
        <a href="/credits">샘플 소재 출처</a>
      </nav>
    </div>`;
}

export class ApiError extends Error {
  constructor(message, code, status, data) { super(message); this.code = code; this.status = status; this.data = data; }
}

export async function api(path, { method = 'GET', body, token, headers = {} } = {}) {
  const url = new URL(path, location.origin);
  if (token) url.searchParams.set('token', token);
  let res;
  try {
    res = await fetch(url, {
      method,
      headers: body !== undefined ? { 'content-type': 'application/json', ...headers } : headers,
      body: body !== undefined ? JSON.stringify(body) : undefined
    });
  } catch (e) {
    throw new ApiError('인터넷 연결을 확인해 주세요.', 'network', 0);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.error || '잠시 후 다시 시도해 주세요.', data.code, res.status, data);
  return data;
}

export const params = () => Object.fromEntries(new URLSearchParams(location.search));

export const won = (n) => (n == null ? '' : Number(n).toLocaleString('ko-KR') + '원');

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// 이 기기에서 만든 제작 목록 (가입 없이 제작 내역을 보여 주기 위해)
const HKEY = 'hanpyeon.history.v1';
export function history() {
  try { return JSON.parse(localStorage.getItem(HKEY) || '[]'); } catch { return []; }
}
export function remember(entry) {
  try {
    const list = history().filter(x => x.id !== entry.id);
    list.unshift({ ...entry, at: new Date().toISOString() });
    localStorage.setItem(HKEY, JSON.stringify(list.slice(0, 30)));
  } catch { /* 사생활 보호 모드 등 */ }
}
export function forget(id) {
  try { localStorage.setItem(HKEY, JSON.stringify(history().filter(x => x.id !== id))); } catch {}
}

let toastTimer;
export function toast(msg, ms = 3200) {
  let el = document.querySelector('.toast');
  if (!el) { el = document.createElement('div'); el.className = 'toast'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
  el.textContent = msg;
  el.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), ms);
}

const CDN = document.querySelector('meta[name=cdn]')?.content || '';

// 서울 쪽 파일이 안 열리면 이 사이트 주소(R2)로 다시 받는다
if (CDN) document.addEventListener('error', (e) => {
  const el = e.target, src = el && el.getAttribute && el.getAttribute('src');
  if (src && src.startsWith(CDN + '/') && !src.includes('/assets/')) el.src = '/media/' + src.slice(CDN.length + 1);
}, true);

async function templatesFromCdn() {
  const res = await fetch(`${CDN}/templates.json`, { signal: AbortSignal.timeout(3000) });
  if (!res.ok) throw new Error('cdn');
  return JSON.parse((await res.text()).replaceAll('"/media/', `"${CDN}/`));
}

let tplCache;
export async function loadTemplates() {
  if (!tplCache) tplCache = CDN ? templatesFromCdn().catch(() => api('/api/templates')) : api('/api/templates');
  return tplCache;
}

export function projectUrl(page, id, token) {
  return `/${page}?p=${encodeURIComponent(id)}&t=${encodeURIComponent(token)}`;
}
