import { header, footer, api, params, esc, won, toast, loadTemplates, remember, projectUrl, STATUS, bizLines } from './common.js';

header();
footer();

const $ = (s) => document.querySelector(s);
const { p: id, t: token } = params();
if (!id || !token) location.replace('/');

const S = { project: null, tpl: null, cfg: null, shownKey: '', widgets: null, timer: null };
const videoUrl = (kind, dl) => `/api/projects/${id}/video/${kind}?token=${encodeURIComponent(token)}&v=${encodeURIComponent(S.project.updatedAt || '')}${dl ? '&download=1' : ''}`;

function waitBox(title, text) {
  return `<div class="wait"><div class="spinner" aria-hidden="true"></div><span class="serif" style="font-size: 20px">${title}</span><span class="small sub" style="max-width: 420px; line-height: 1.7">${text}</span></div>`;
}
function infoBox(title, text) {
  return `<div class="wait"><span class="serif" style="font-size: 20px">${title}</span><span class="small sub" style="max-width: 420px; line-height: 1.7">${text}</span></div>`;
}

function render() {
  const p = S.project, t = S.tpl;
  const name = (p.data.fields || {})[t.titleField];
  $('#eyebrow').textContent = STATUS[p.status] ? STATUS[p.status].label : '';
  $('#title').textContent = name ? `${name}의 ${t.name}` : t.name;
  const key = p.status + (p.hasPreview ? 'p' : '') + (p.hasFinal ? 'f' : '');
  if (key === S.shownKey) {
    if (p.queueAhead != null) { const q = document.getElementById('queue'); if (q) q.textContent = queueText(p); }
    return;
  }
  S.shownKey = key;
  const editLink = `<a class="btn line" href="${projectUrl('make.html', id, token)}">사진·문구 고치기</a>`;

  switch (p.status) {
    case 'draft':
      $('#player').innerHTML = infoBox('아직 미리보기가 없어요', '사진과 문구를 넣고 미리보기를 만들어 주세요.');
      $('#actions').innerHTML = editLink; $('#note').textContent = '';
      $('#side').innerHTML = '';
      break;
    case 'preview_queued':
    case 'preview_rendering':
      $('#player').innerHTML = waitBox(p.status === 'preview_rendering' ? '미리보기를 만들고 있어요' : '미리보기 차례를 기다리고 있어요',
        `<span id="queue">${queueText(p)}</span><br>창을 닫아도 괜찮아요. 제작 내역에서 다시 볼 수 있어요.`);
      $('#actions').innerHTML = ''; $('#note').textContent = '';
      $('#side').innerHTML = summaryCard(false);
      break;
    case 'failed':
      $('#player').innerHTML = infoBox('미리보기를 만들지 못했어요', esc(p.error || '사진을 확인하고 다시 시도해 주세요.'));
      $('#actions').innerHTML = editLink;
      $('#side').innerHTML = '';
      break;
    case 'preview_ready':
      $('#player').innerHTML = `<video src="${videoUrl('preview')}" controls playsinline preload="metadata"></video>`;
      $('#actions').innerHTML = editLink;
      $('#note').textContent = '미리보기는 화질을 낮추고 글자를 새겨 두었어요. 결제하면 글자 없는 1080p 영상을 받을 수 있어요.';
      renderCheckout();
      break;
    case 'final_queued':
    case 'final_rendering':
      $('#player').innerHTML = waitBox('결제가 완료되었어요', `고화질 완성 영상을 만들고 있어요. <span id="queue">${queueText(p)}</span><br>창을 닫아도 제작 내역에서 받을 수 있어요.`);
      $('#actions').innerHTML = ''; $('#note').textContent = '';
      $('#side').innerHTML = summaryCard(true);
      break;
    case 'final_failed':
      $('#player').innerHTML = infoBox('완성 영상을 확인하고 있어요', '만드는 중에 문제가 생겨 직접 확인하고 있어요. 24시간 안에 완성되지 않으면 qwove.corp@gmail.com으로 알려 주세요. 전액 환불해 드려요. 결제는 그대로 안전하게 유지되고, 완성되면 이곳에서 받을 수 있어요.');
      $('#actions').innerHTML = ''; $('#side').innerHTML = summaryCard(true);
      break;
    case 'delivered':
      $('#player').innerHTML = `<video src="${videoUrl('final')}" controls playsinline preload="metadata"></video>`;
      $('#actions').innerHTML = `<a class="btn lg" href="${videoUrl('final', true)}" download>완성 영상 내려받기</a>`;
      $('#note').innerHTML = `완성 후 ${S.cfg.keepDays}일 동안 내려받을 수 있어요. 그 뒤에는 보내 주신 사진과 영상까지 모두 지워져요. 휴대폰에서는 영상을 길게 눌러 저장할 수도 있어요.`;
      $('#side').innerHTML = summaryCard(true);
      break;
    case 'expired':
      $('#player').innerHTML = infoBox('보관 기간이 끝났어요', '보관 기간이 지나 영상과 사진을 지웠어요.');
      $('#actions').innerHTML = '<a class="btn line" href="/">새로 만들기</a>';
      $('#side').innerHTML = '';
      break;
  }
}

function queueText(p) {
  if (p.workerOnline === false) return '지금은 영상 제작이 잠시 쉬고 있어요. 다시 시작되는 대로 순서대로 만들어 드려요.';
  if (p.status === 'preview_rendering' || p.status === 'final_rendering') return '거의 다 됐어요. 보통 몇 분 걸려요.';
  if (p.queueAhead > 0) return `앞에 ${p.queueAhead}건이 있어요.`;
  return '곧 시작해요.';
}

function summaryCard(paid) {
  const p = S.project, t = S.tpl;
  return `<div class="card soft" style="display: flex; flex-direction: column; gap: 12px">
    <h2 class="serif" style="margin: 0; font-size: 20px">${paid ? '주문 내용' : t.name}</h2>
    ${p.orderId ? `<div class="sum-row small"><span class="sub">주문번호</span><span>${esc(p.orderId)}</span></div>` : ''}
    <div class="sum-row small"><span class="sub">템플릿</span><span>${esc(t.name)}</span></div>
    ${paid ? `<div class="sum-row small"><span class="sub">결제 금액</span><span>${won(p.amount)}</span></div>` : ''}
    ${p.receiptUrl ? `<a class="small" href="${esc(p.receiptUrl)}" target="_blank" rel="noopener">영수증 보기</a>` : ''}
    ${paid ? '<span class="small sub" style="line-height: 1.7">주문번호와 휴대폰 번호로 다른 기기에서도 제작 내역을 찾을 수 있어요.</span>' : ''}
  </div>`;
}

// ---------- 결제 ----------
async function renderCheckout() {
  const p = S.project, t = S.tpl;
  if (!S.cfg.payOpen) {
    $('#side').innerHTML = `<div class="card soft"><h2 class="serif" style="margin: 0 0 8px; font-size: 21px">정식 오픈 준비 중이에요</h2>
      <p class="small sub" style="margin: 0">결제는 곧 열려요. 지금은 미리보기까지 무료로 만들어 볼 수 있어요.</p></div>`;
    return;
  }
  const phone = (p.data.contact || {}).phone || '';
  $('#side').innerHTML = `<div class="card soft" style="display: flex; flex-direction: column; gap: 16px">
    <h2 class="serif" style="margin: 0; font-size: 21px">결제하고 받기</h2>
    <div style="display: flex; flex-direction: column; gap: 8px">
      <div class="sum-row"><span>${esc(t.name)}</span>${t.listPrice ? `<s class="sub">${won(t.listPrice)}</s>` : ''}</div>
      ${t.listPrice ? `<div class="sum-row small" style="color: var(--rose-ink)"><span>할인</span><span>-${won(t.listPrice - t.price)}</span></div>` : ''}
      ${t.uhdPrice ? `<label class="check"><input type="radio" name="res" value="fhd" checked> <span>풀HD 1080p <b>${won(t.price)}</b></span></label>
      <label class="check"><input type="radio" name="res" value="uhd"> <span>4K 초고화질 <b>${won(t.uhdPrice)}</b><br><span class="small sub">완성까지 더 오래 걸리고 파일이 커요. 원본 사진이 선명할수록 차이가 커요.</span></span></label>` : ''}
      <div class="sum-row total"><span>결제 금액</span><b id="payTotal">${won(t.price)}</b></div>
    </div>
    <label class="field">휴대폰 번호 <span class="help">주문 확인과 제작 내역 조회에 쓰고, 결제하면 수집에 동의한 것으로 봐요</span>
      <input type="tel" id="phone" inputmode="tel" autocomplete="tel" placeholder="010-0000-0000" value="${esc(phone)}">
    </label>
    <div id="payment-method"></div>
    <div id="agreement"></div>
    <label class="check"><input type="checkbox" id="agreeRefund"> <span>디지털 콘텐츠라 완성 영상을 만들기 시작한 뒤에는 환불이 어렵다는 점을 확인했어요 <a href="/refund" target="_blank">환불 규정</a></span></label>
    <div id="payError" class="error-text hidden" role="alert"></div>
    <button class="btn lg block" type="button" id="payBtn">${won(t.price)} 결제하기</button>
    <p class="small sub" style="margin:4px 0 0;line-height:1.7">판매자 ${bizLines()}</p>
  </div>`;
  $('#payBtn').addEventListener('click', pay);
  document.querySelectorAll('input[name=res]').forEach(r => r.addEventListener('change', () => {
    const amount = r.value === 'uhd' ? t.uhdPrice : t.price;
    $('#payTotal').textContent = won(amount);
    $('#payBtn').textContent = `${won(amount)} 결제하기`;
    if (S.widgets) S.widgets.setAmount({ currency: 'KRW', value: amount });
  }));
  if (S.cfg.tossMock) {
    $('#payment-method').innerHTML = '<div class="notice"><b>시험 모드</b> 실제 결제 없이 결제 완료로 처리해요.</div>';
    return;
  }
  try {
    await loadToss();
    const tp = window.TossPayments(S.cfg.tossClientKey);
    S.widgets = tp.widgets({ customerKey: window.TossPayments.ANONYMOUS });
    await S.widgets.setAmount({ currency: 'KRW', value: t.price });
    await Promise.all([
      S.widgets.renderPaymentMethods({ selector: '#payment-method', variantKey: 'DEFAULT' }),
      S.widgets.renderAgreement({ selector: '#agreement', variantKey: 'AGREEMENT' })
    ]);
  } catch (err) {
    console.error(err);
    $('#payment-method').innerHTML = '<p class="error-text">결제창을 불러오지 못했어요. 새로고침해 주세요.</p>';
  }
}
function loadToss() {
  if (window.TossPayments) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://js.tosspayments.com/v2/standard';
    s.onload = resolve; s.onerror = reject;
    document.head.appendChild(s);
  });
}
async function pay() {
  const btn = $('#payBtn'), errEl = $('#payError');
  errEl.classList.add('hidden');
  const phone = $('#phone').value.replace(/[^0-9]/g, '');
  if (phone.length < 10) { errEl.textContent = '휴대폰 번호를 확인해 주세요.'; errEl.classList.remove('hidden'); return; }
  if (!$('#agreeRefund').checked) { errEl.textContent = '환불 규정을 확인해 주세요.'; errEl.classList.remove('hidden'); return; }
  btn.disabled = true;
  try {
    const order = await api(`/api/projects/${id}/checkout`, { method: 'POST', token, body: { phone, uhd: document.querySelector('input[name=res]:checked')?.value === 'uhd' } });
    const back = `?p=${encodeURIComponent(id)}&t=${encodeURIComponent(token)}`;
    if (S.cfg.tossMock) {
      location.href = `/success${back}&paymentKey=mock_${Date.now()}&orderId=${encodeURIComponent(order.orderId)}&amount=${order.amount}`;
      return;
    }
    await S.widgets.requestPayment({
      orderId: order.orderId,
      orderName: order.orderName,
      successUrl: location.origin + '/success' + back,
      failUrl: location.origin + '/fail' + back,
      customerMobilePhone: phone
    });
  } catch (err) {
    // 사용자가 결제창을 닫은 경우 등
    if (err && err.code !== 'USER_CANCEL') { errEl.textContent = err.message || '결제를 시작하지 못했어요.'; errEl.classList.remove('hidden'); }
    btn.disabled = false;
  }
}

// ---------- 상태 확인 ----------
async function poll() {
  try {
    const p = await api(`/api/projects/${id}`, { token });
    S.project = p;
    render();
    const waiting = ['preview_queued', 'preview_rendering', 'final_queued', 'final_rendering'].includes(p.status);
    clearTimeout(S.timer);
    if (waiting) S.timer = setTimeout(poll, document.hidden ? 20000 : 6000);
  } catch (err) {
    toast(err.message);
    S.timer = setTimeout(poll, 15000);
  }
}
document.addEventListener('visibilitychange', () => { if (!document.hidden && S.project && /queued|rendering/.test(S.project.status)) poll(); });

(async () => {
  try {
    const [cfg, data] = await Promise.all([api('/api/config'), loadTemplates()]);
    S.cfg = cfg;
    const p = await api(`/api/projects/${id}`, { token });
    S.tpl = data.templates.find(t => t.code === p.template);
    remember({ id, token, template: S.tpl.code, name: S.tpl.name });
    S.project = p;
    if (S.tpl.aspect === '9:16') Object.assign($('#player').style, { aspectRatio: '9 / 16', maxWidth: '420px', width: '100%', margin: '0 auto' });
    render();
    poll();
  } catch (err) {
    $('#title').textContent = '제작을 찾을 수 없어요';
    $('#player').innerHTML = infoBox('링크를 확인해 주세요', esc(err.message));
  }
})();
