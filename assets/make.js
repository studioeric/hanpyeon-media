import { header, footer, api, params, esc, toast, loadTemplates, remember, projectUrl } from './common.js';
import { uploadFile, photoDate, videoOrient, isVideo, isImage, shrinkPhoto } from './upload.js';

header();
footer();

const $ = (s) => document.querySelector(s);
const { p: id, t: token } = params();
const S = {
  project: null, tpl: null,
  local: {},      // 업로드 키 -> { slot, file, url, progress, error, uploading }
  queue: [], running: 0, seq: 0
};
const CONCURRENCY = 3;

if (!id || !token) location.replace('/');

const slotsOf = (tpl) => tpl.scenes.flatMap(sc => sc.slots);
const mediaIn = (slot) => S.project.media.filter(m => m.slot === slot);
const doneIn = (slot) => mediaIn(slot).filter(m => m.status === 'done');
const localIn = (slot) => Object.entries(S.local).filter(([, l]) => l.slot === slot);
const fileUrl = (mediaId) => `/api/projects/${id}/media/${mediaId}/file?token=${encodeURIComponent(token)}`;
const MULTI = ['burst', 'photos'];          // 여러 장 칸 (photos는 순서가 중요한 칸)
const isMulti = (sl) => MULTI.includes(sl.kind);
const need = (sl) => isMulti(sl) ? (sl.min ?? 1) : 1;
// 여러 장 칸의 순서: 고객이 정한 순서(orders) 먼저, 나머지는 넣은 순서
function ordered(sl) {
  const done = doneIn(sl.id), ord = (S.project.data.orders || {})[sl.id] || [];
  const rank = (m) => { const i = ord.indexOf(m.id); return i < 0 ? ord.length + done.indexOf(m) : i; };
  return [...done].sort((a, b) => rank(a) - rank(b));
}
const isFull = (sl) => doneIn(sl.id).length >= need(sl);
const kindLabel = (sl) => sl.label;
const PLAY = '<span class="play" aria-hidden="true"><svg width="12" height="12" viewBox="0 0 12 12"><path d="M3 1.5l7 4.5-7 4.5z" fill="#2E2A27"/></svg></span>';
const PLUS = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#8A817A" stroke-width="1.4" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>';

// ---------- 화면 그리기 ----------
function renderHead() {
  const t = S.tpl;
  $('#tplHead').innerHTML = `
    ${t.thumb ? `<div class="mini"><img src="${esc(t.thumb)}" alt=""></div>` : `<div class="mini t-${t.category === 'baby100' ? 'baby' : t.category}">${esc(t.word)}</div>`}
    <div style="flex: 1 1 260px; display: flex; flex-direction: column; gap: 4px">
      <span class="small" style="color: var(--rose-ink)">${esc(t.categoryLabel || '')} · ${esc(t.typeLabel || '')}</span>
      <h1>${esc(t.name)}</h1>
      <span class="small sub">재생 ${esc(t.duration)} · 사진 ${t.photos}장${t.videos ? ` · 영상 ${t.videos}개` : ''}${t.aspect === '9:16' ? ' · 세로 화면' : ''}</span>
    </div>
    <a class="btn line" href="/#templates">다른 템플릿 보기</a>`;
  document.title = `${t.name} 만들기 · 한편 필름`;
}

function thumb(kind, src, filename) {
  return kind === 'video'
    ? `<video src="${src}#t=0.5" muted playsinline preload="metadata"></video>${PLAY}`
    : `<img src="${src}" alt="" loading="lazy" data-fallback="${esc(filename || '')}">`;
}

// 사진·영상 한 칸
function singleSlot(sl) {
  const med = mediaIn(sl.id)[0];
  const locEntry = localIn(sl.id)[0];
  const loc = locEntry && locEntry[1];
  const cap = (S.project.data.captions || {})[sl.id];
  let inner = `<span class="kind">${esc(kindLabel(sl))}</span>`, cls = 'slot', filled = false;
  if (loc && (loc.uploading || loc.error)) {
    cls += ' filled'; filled = true;
    if (loc.url && isImage(loc.file)) inner = `<img src="${loc.url}" alt="">` + inner;
    inner += loc.error ? `<span class="warn">${esc(loc.error)}</span>` : `<span class="prog"><i style="width:${Math.round((loc.progress || 0) * 100)}%"></i></span>`;
  } else if (med && med.status === 'done') {
    cls += ' filled'; filled = true;
    inner = thumb(med.kind, loc && loc.url ? loc.url : fileUrl(med.id), med.filename) + inner;
    if (cap) inner += `<span class="cap" style="position:absolute;left:0;right:0;top:0;z-index:1;padding:3px 6px;background:rgba(46,42,39,.6);color:#fff;font-size:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(cap)}</span>`;
  } else if (med && med.status === 'uploading') {
    inner += `<span class="warn">이어 올리려면<br>다시 골라 주세요</span>`;
  } else {
    inner = PLUS + inner;
  }
  return `<div class="slot-wrap">
    <button type="button" class="${cls}" data-slot="${sl.id}" aria-label="${esc(kindLabel(sl))} 칸${filled ? ', 채워짐. 눌러서 자막이나 위치 고치기' : ', 비어 있음'}">${inner}</button>
    ${med && med.status === 'done' && !(loc && loc.uploading) ? `<button type="button" class="slot-x" data-remove="${med.id}" aria-label="${esc(sl.label)} 빼기">✕</button>` : ''}
  </div>`;
}

// 여러 장 칸 (가족 사진 1~6장 등)
function burstSlot(sl) {
  const done = ordered(sl);
  const locs = localIn(sl.id).filter(([, l]) => l.uploading || l.error);
  const tiles = done.map((m, i) => {
    const l = Object.values(S.local).find(x => x.mediaId === m.id);
    const mv = done.length > 1 ? `<span class="slot-move">${i > 0 ? `<button type="button" data-move="${sl.id}:${m.id}:-1" aria-label="${i + 1}번째 사진 앞으로">‹</button>` : '<i></i>'}<b>${i + 1}</b>${i < done.length - 1 ? `<button type="button" data-move="${sl.id}:${m.id}:1" aria-label="${i + 1}번째 사진 뒤로">›</button>` : '<i></i>'}</span>` : '';
    return `<div class="slot-wrap"><div class="slot filled">${thumb('photo', l && l.url ? l.url : fileUrl(m.id), m.filename)}${mv}</div>
      <button type="button" class="slot-x" data-remove="${m.id}" aria-label="사진 빼기">✕</button></div>`;
  }).concat(locs.map(([, l]) => `<div class="slot-wrap"><div class="slot filled">${l.url ? `<img src="${l.url}" alt="">` : ''}
      ${l.error ? `<span class="warn">${esc(l.error)}</span>` : `<span class="prog"><i style="width:${Math.round((l.progress || 0) * 100)}%"></i></span>`}</div></div>`));
  const room = (sl.max || 6) - done.length - locs.filter(([, l]) => l.uploading).length;
  if (room > 0) tiles.push(`<div class="slot-wrap"><button type="button" class="slot" data-slot="${sl.id}" aria-label="${esc(sl.label)} 더하기, ${done.length}장 들어감">${PLUS}<span class="kind">${done.length ? '더하기' : esc(sl.label)}</span></button></div>`);
  return tiles.join('');
}

function renderScenes() {
  $('#scenes').innerHTML = S.tpl.scenes.map((sc, i) => {
    const n = sc.slots.filter(isFull).length;
    const multi = sc.slots.filter(isMulti);
    const m0 = multi[0];
    const count = multi.length === 1 && sc.slots.length === 1
      ? `${doneIn(m0.id).length}장 / ${m0.min === m0.max ? `${m0.max}장` : `${m0.min ?? 1}~${m0.max || 6}장`}${doneIn(m0.id).length > 1 ? ' · 화살표로 순서 바꾸기' : ''}`
      : `${n} / ${sc.slots.length} 채움`;
    return `<section class="scene">
      <div class="info"><span class="no">${i + 1}</span><div>
        <b>${esc(sc.title)}</b><span class="small sub" style="line-height:1.6">${esc(sc.hint || '')}${sc.slots.filter(s => s.seconds).map(s => ` · 영상에서 ${s.seconds}초를 써요`).join('')}</span><br>
        <span class="small" style="color:var(--rose-ink)">${count}</span>
      </div></div>
      <div class="slots">${sc.slots.map(sl => isMulti(sl) ? burstSlot(sl) : singleSlot(sl)).join('')}</div>
    </section>`;
  }).join('') + '<div style="border-top:1px solid var(--line)"></div>';
  $('#scenes').querySelectorAll('img[data-fallback]').forEach(img => {
    img.onerror = () => img.replaceWith(Object.assign(document.createElement('span'), { className: 'small', textContent: '사진', style: 'position:relative;z-index:1' }));
  });
  renderCount();
}

function renderCount() {
  const all = slotsOf(S.tpl).filter(s => !s.optional);
  const done = all.filter(isFull).length;
  $('#count').textContent = `${done} / ${all.length}`;
  $('#countBar').style.width = `${Math.round(done / all.length * 100)}%`;
  const up = Object.values(S.local).filter(x => x.uploading).length;
  $('#uploadNote').textContent = up ? `${up}개 올리는 중이에요. 창을 닫지 말아 주세요.` : '';
}

function renderFields() {
  const f = S.project.data.fields || {};
  const one = (fd) => {
    const v = f[fd.key] ?? fd.default ?? '';
    const fid = 'f_' + fd.key.replace(/\W/g, '_');
    const req = fd.required ? ' <span style="color:var(--rose-ink)">(필수)</span>' : '';
    const help = fd.help ? `<span class="help">${esc(fd.help)}</span>` : '';
    const common = `name="${esc(fd.key)}" id="${fid}"${fd.required ? ' required' : ''}${fd.placeholder ? ` placeholder="${esc(fd.placeholder)}"` : ''}`;
    let input;
    if (fd.type === 'textarea') input = `<textarea ${common} rows="3"${fd.maxLength ? ` maxlength="${fd.maxLength}"` : ''}>${esc(v)}</textarea>`;
    else if (fd.type === 'lines') input = `<textarea ${common} rows="${fd.rows || Math.min(fd.maxLines || 6, 6)}">${esc(v)}</textarea>`;
    else if (fd.type === 'number') input = `<input type="number" inputmode="decimal" ${common} value="${esc(v)}">`;
    else if (fd.type === 'date' || fd.type === 'time') input = `<input type="${fd.type}" ${common} value="${esc(v)}">`;
    else if (fd.type === 'select') input = `<select ${common}><option value="">고르기</option>${(fd.options || []).map(o => `<option${o === v ? ' selected' : ''}>${esc(o)}</option>`).join('')}</select>`;
    else input = `<input type="text" ${common} value="${esc(v)}"${fd.maxLength ? ` maxlength="${fd.maxLength}"` : ''}>`;
    return `<label class="field" for="${fid}"><span>${esc(fd.label)}${req}</span>${input}${help}</label>`;
  };
  const all = S.tpl.fields || [];
  const texts = all.filter(fd => fd.section === 'texts');
  const groups = texts.map((fd, i) => (i === 0 || texts[i - 1].group !== fd.group
    ? `<b class="small" style="margin-top:6px;color:var(--ink-2)">${esc(fd.group)}</b>` : '') + one(fd)).join('');
  $('#fields').innerHTML = all.filter(fd => fd.section !== 'texts').map(one).join('') + (texts.length ? `
    <details class="texts"${Object.keys(f).some(k => k.startsWith('texts.')) ? ' open' : ''}>
      <summary>영상 속 문구 바꾸기 <span class="small sub">(선택, ${texts.length}곳)</span></summary>
      <p class="small sub" style="margin:6px 0 0">지금 적힌 문구가 그대로 들어가요. 원하는 곳만 고치면 돼요.</p>
      <div style="display:flex;flex-direction:column;gap:12px;margin-top:10px">${groups}</div>
    </details>` : '');
  renderTracks();
  const music = S.project.data.music || { type: 'original' };
  document.querySelectorAll('input[name=music]').forEach(r => { r.checked = r.value === music.type; });
  $('#musicConsent').checked = !!music.customer_consent;
  $('#customerMusic').classList.toggle('hidden', music.type !== 'customer');
  const opt = S.project.data.options || {};
  $('#hideTags').checked = opt.hide_name_tags !== false;
  $('#sampleOk').checked = !!opt.sample_consent;
  const mus = doneIn('music')[0];
  $('#musicLabel').textContent = mus ? `음악: ${mus.filename} (바꾸기)` : '음악 파일 고르기 (mp3, m4a)';
  renderDday();
}

// 추천 곡 고르기 + 30초 미리 듣기
let audio = null;
function renderTracks() {
  const box = $('#tracks'), list = S.tpl.music || [];
  if (!list.length) { box.innerHTML = ''; return; }
  const cur = (S.project.data.music || {}).track || (list.find(x => x.default) || list[0]).key;
  box.innerHTML = list.map(x => `<div class="track">
      <label><input type="radio" name="track" value="${esc(x.key)}"${x.key === cur ? ' checked' : ''}> <span><b>${esc(x.title)}</b><small>${esc(x.desc)}</small></span></label>
      <button type="button" class="btn line sm" data-listen="${esc(x.preview)}" aria-label="${esc(x.title)} 미리 듣기">▶ 듣기</button>
    </div>`).join('');
  $('#originalLabel').innerHTML = '추천 곡에서 고르기<small>상업적으로 써도 되는 곡이에요</small>';
}
$('#tracks').addEventListener('click', (e) => {
  const b = e.target.closest('[data-listen]');
  if (!b) return;
  const playing = audio && !audio.paused && audio.dataset.src === b.dataset.listen;
  if (audio) { audio.pause(); document.querySelectorAll('[data-listen]').forEach(x => { x.textContent = '▶ 듣기'; }); }
  if (playing) return;
  audio = new Audio(b.dataset.listen); audio.dataset.src = b.dataset.listen;
  audio.play().catch(() => toast('곡을 재생하지 못했어요.'));
  audio.onended = () => { b.textContent = '▶ 듣기'; };
  b.textContent = '■ 멈춤';
});
$('#tracks').addEventListener('change', (e) => {
  if (e.target.name !== 'track') return;
  document.querySelector('input[name=music][value=original]').checked = true;
  $('#customerMusic').classList.add('hidden');
  S.project.data.music = { type: 'original', track: e.target.value };
  save({ music: { type: 'original', track: e.target.value, customer_consent: false } });
});
const curTrack = () => { const r = document.querySelector('input[name=track]:checked'); return r ? r.value : null; };

function fieldVal(key) { const el = document.querySelector(`#fields [name="${key}"]`); return el ? el.value : ''; }
function renderDday() {
  const birth = fieldVal('birth_date'), ev = fieldVal('event') || (S.tpl.preset || {}).event || '백일', set = fieldVal('event_date');
  const box = $('#dday');
  const b = new Date(birth + 'T00:00:00');
  if (!birth || isNaN(b) || !document.querySelector('#fields [name="event_date"]')) { box.classList.add('hidden'); return; }
  let e;
  if (set) e = new Date(set + 'T00:00:00');
  else if (ev === '돌') { e = new Date(b); e.setFullYear(e.getFullYear() + 1); }
  else e = new Date(b.getTime() + 99 * 86400000);
  const dn = Math.round((e - b) / 86400000) + 1;
  box.querySelector('.dday').textContent = ev === '돌' && !set ? '첫 생일' : `D+${dn}`;
  $('#ddayText').innerHTML = `${esc(ev)}잔치 <b style="font-weight:500">${e.getFullYear()}년 ${e.getMonth() + 1}월 ${e.getDate()}일</b><br><span class="sub" style="font-size:12px">${set ? '적어 주신 날짜예요' : '생일로 자동 계산했어요'}</span>`;
  box.classList.remove('hidden');
  box.style.display = 'flex';
}

// ---------- 저장 ----------
let saveTimer, pending = {};
function save(part) {
  for (const [k, v] of Object.entries(part)) pending[k] = (typeof v === 'object' && pending[k] && k !== 'music' && k !== 'options') ? { ...pending[k], ...v } : v;
  clearTimeout(saveTimer);
  $('#saved').textContent = '저장 중…';
  saveTimer = setTimeout(flush, 600);
}
async function flush() {
  const body = pending; pending = {};
  if (!Object.keys(body).length) return;
  try {
    const r = await api(`/api/projects/${id}`, { method: 'PATCH', token, body });
    if (r.status) S.project.status = r.status;
    for (const k of ['captions', 'trims', 'orders', 'sounds']) if (body[k]) S.project.data[k] = { ...(S.project.data[k] || {}), ...body[k] };
    $('#saved').textContent = '자동으로 저장했어요';
  } catch (err) { $('#saved').textContent = ''; toast(err.message); }
}
function collectFields() {
  const out = {};
  for (const fd of S.tpl.fields || []) { const el = document.querySelector(`#fields [name="${fd.key}"]`); if (el) out[fd.key] = el.value; }
  return out;
}
$('#fields').addEventListener('input', () => { save({ fields: collectFields() }); renderDday(); });
$('#fields').addEventListener('change', () => { save({ fields: collectFields() }); renderDday(); });
document.querySelectorAll('input[name=music]').forEach(r => r.addEventListener('change', () => {
  $('#customerMusic').classList.toggle('hidden', r.value !== 'customer' || !r.checked);
  save({ music: { type: r.value, track: curTrack(), customer_consent: $('#musicConsent').checked } });
}));
$('#musicConsent').addEventListener('change', () => save({ music: { type: 'customer', track: curTrack(), customer_consent: $('#musicConsent').checked } }));
const saveOpts = () => save({ options: { hide_name_tags: $('#hideTags').checked, sample_consent: $('#sampleOk').checked } });
$('#hideTags').addEventListener('change', saveOpts);
$('#sampleOk').addEventListener('change', saveOpts);

// ---------- 업로드 ----------
async function refresh() {
  const p = await api(`/api/projects/${id}`, { token });
  S.project.media = p.media;
  S.project.status = p.status;
}
function enqueueUpload(slot, file) {
  const def = slotsOf(S.tpl).find(s => s.id === slot);
  const key = def && isMulti(def) ? `${slot}#${++S.seq}` : slot;
  const old = S.local[key];
  if (old && old.url) URL.revokeObjectURL(old.url);
  S.local[key] = { slot, file, url: isImage(file) || isVideo(file) ? URL.createObjectURL(file) : null, progress: 0, uploading: true };
  S.queue.push(key);
  pump();
}
function pump() {
  renderScenes();
  while (S.running < CONCURRENCY && S.queue.length) {
    const key = S.queue.shift();
    S.running++;
    runUpload(key).finally(() => { S.running--; pump(); });
  }
}
async function runUpload(key) {
  const loc = S.local[key];
  if (!loc) return;
  try {
    const takenAt = isImage(loc.file) ? await photoDate(loc.file) : null;
    if (isImage(loc.file)) {
      const lastMod = loc.file.lastModified, r = await shrinkPhoto(loc.file);
      loc.file = r.file;
      if (r.w && Math.max(r.w, r.h) < 1000 && !S.smallWarned) {
        S.smallWarned = true;
        toast('작은 사진이 있어요. 크게 나오는 장면에서는 흐려 보일 수 있어서, 원본 사진을 넣으면 더 선명해요.');
      }
      if (!takenAt) loc.lastMod = lastMod;
    }
    let last = 0;
    loc.mediaId = await uploadFile({
      projectId: id, token, slot: loc.slot, file: loc.file,
      takenAt: takenAt || new Date(loc.lastMod || loc.file.lastModified).toISOString(),
      onProgress: (p) => {
        loc.progress = p;
        if (p - last > 0.03 || p === 1) { last = p; renderScenesSoon(); }
      }
    });
    loc.uploading = false;
    await refresh();
  } catch (err) {
    loc.uploading = false;
    loc.error = err.message.length > 28 ? '올리지 못했어요. 다시 골라 주세요' : err.message;
    toast(err.message);
  }
  renderScenes();
  if (loc.slot === 'music') renderFields();
}
let rsTimer;
function renderScenesSoon() { clearTimeout(rsTimer); rsTimer = setTimeout(renderScenes, 250); }

// 칸 누르기
let pickSlot = null;
function pick(sl) {
  pickSlot = sl;
  const inp = $('#single');
  inp.accept = sl.kind === 'video' ? 'video/*,.mov,.mp4' : sl.kind === 'media' ? 'image/*,.heic,.heif,video/*,.mov,.mp4' : 'image/*,.heic,.heif';
  inp.multiple = isMulti(sl);
  inp.value = '';
  inp.click();
}
$('#scenes').addEventListener('click', async (e) => {
  const rm = e.target.closest('[data-remove]');
  if (rm) {
    try {
      const mid = rm.dataset.remove;
      const m = S.project.media.find(x => x.id === mid);
      await api(`/api/projects/${id}/media/${mid}`, { method: 'DELETE', token });
      for (const [k, l] of Object.entries(S.local)) {
        if (l.mediaId === mid || (m && l.slot === m.slot && !k.includes('#') && !l.uploading)) delete S.local[k];
      }
      await refresh(); renderScenes();
    } catch (err) { toast(err.message); }
    return;
  }
  const mv = e.target.closest('[data-move]');
  if (mv) {
    const [sid, mid, dir] = mv.dataset.move.split(':');
    const sl = slotsOf(S.tpl).find(x => x.id === sid);
    const ids = ordered(sl).map(m => m.id), i = ids.indexOf(mid), j = i + Number(dir);
    if (i < 0 || j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    S.project.data.orders = { ...(S.project.data.orders || {}), [sid]: ids };
    save({ orders: { [sid]: ids } });
    renderScenes();
    return;
  }
  const b = e.target.closest('button[data-slot]');
  if (!b) return;
  const sl = slotsOf(S.tpl).find(x => x.id === b.dataset.slot);
  if (localIn(sl.id).some(([, l]) => l.uploading) && !isMulti(sl)) { toast('올리는 중이에요. 잠시만 기다려 주세요.'); return; }
  const med = doneIn(sl.id)[0];
  if (!isMulti(sl) && med) openSheet(sl, med); else pick(sl);
});
$('#single').addEventListener('change', async () => {
  const files = [...$('#single').files];
  if (!files.length || !pickSlot) return;
  const sl = pickSlot;
  if (isMulti(sl)) {
    const room = (sl.max || 6) - doneIn(sl.id).length - localIn(sl.id).filter(([, l]) => l.uploading).length;
    const imgs = files.filter(isImage);
    if (imgs.length > room) toast(`${sl.max || 6}장까지 넣을 수 있어 ${room}장만 넣었어요.`);
    imgs.slice(0, Math.max(0, room)).forEach(f => enqueueUpload(sl.id, f));
    return;
  }
  const f = files[0];
  if (sl.kind === 'video' && !isVideo(f)) return toast('이 칸에는 영상을 넣어 주세요.');
  if (sl.kind === 'photo' && !isImage(f)) return toast('이 칸에는 사진을 넣어 주세요.');
  if (sl.kind === 'media' && !isImage(f) && !isVideo(f)) return toast('이 칸에는 사진이나 영상을 넣어 주세요.');
  if (isVideo(f) && sl.orient && sl.orient !== 'any') {
    const o = await videoOrient(f);
    if (o !== 'any' && o !== sl.orient) toast(sl.orient === 'portrait' ? '세로 영상을 추천하는 칸이에요. 가로 영상은 가운데를 잘라 써요.' : '가로 영상을 추천하는 칸이에요. 세로 영상은 가운데를 잘라 써요.', 4500);
  }
  closeSheet();
  enqueueUpload(sl.id, f);
});
$('#musicFile').addEventListener('change', () => {
  const f = $('#musicFile').files[0];
  if (f) { enqueueUpload('music', f); $('#musicLabel').textContent = `음악: ${f.name} (올리는 중)`; }
});

// ---------- 칸 고치기 (자막, 영상 시작 위치) ----------
let sheetSlot = null;
function openSheet(sl, med) {
  sheetSlot = sl;
  $('#sheetTitle').textContent = `${sl.label} 칸`;
  const loc = localIn(sl.id)[0];
  const src = loc && loc[1].url ? loc[1].url : fileUrl(med.id);
  $('#sheetMedia').innerHTML = med.kind === 'video'
    ? `<video id="sheetVideo" src="${src}" playsinline controls muted style="width:100%;max-height:50vh"></video>`
    : `<img src="${src}" alt="" style="width:100%;max-height:50vh;object-fit:contain">`;
  $('#caption').value = (S.project.data.captions || {})[sl.id] || '';
  $('#captionBox').classList.toggle('hidden', S.tpl.captions === false);
  const isVid = med.kind === 'video';
  $('#soundBox').classList.toggle('hidden', !(isVid && sl.sound));
  $('#sound').checked = !!(S.project.data.sounds || {})[sl.id];
  const trimBox = $('#sheetTrim');
  trimBox.classList.toggle('hidden', !isVid);
  if (isVid) {
    trimBox.style.display = 'flex';
    const v = $('#sheetVideo'), r = $('#trim');
    const start = (S.project.data.trims || {})[sl.id] || 0;
    r.value = start;
    const show = () => { $('#trimText').textContent = `${Number(r.value).toFixed(1)}초부터 ${sl.seconds || ''}초`; };
    v.onloadedmetadata = () => { r.max = Math.max(0, (v.duration || 0) - (sl.seconds || 0)).toFixed(1); v.currentTime = Number(r.value); show(); };
    r.oninput = () => { v.currentTime = Number(r.value); show(); };
    show();
  }
  $('#sheet').classList.remove('hidden');
  $('#caption').focus();
}
function closeSheet() { $('#sheet').classList.add('hidden'); $('#sheetMedia').innerHTML = ''; }
$('#sheet').addEventListener('click', (e) => { if (e.target.id === 'sheet' || e.target.closest('[data-close]')) closeSheet(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSheet(); });
$('#sheetSave').addEventListener('click', () => {
  const sl = sheetSlot;
  const med = doneIn(sl.id)[0];
  const part = S.tpl.captions === false ? {} : { captions: { [sl.id]: $('#caption').value.trim() } };
  if (med && med.kind === 'video') {
    part.trims = { [sl.id]: Number($('#trim').value) };
    if (sl.sound) { part.sounds = { [sl.id]: $('#sound').checked }; S.project.data.sounds = { ...(S.project.data.sounds || {}), ...part.sounds }; }
  }
  if (part.captions) S.project.data.captions = { ...(S.project.data.captions || {}), ...part.captions };
  save(part);
  closeSheet();
  renderScenes();
});
$('#sheetReplace').addEventListener('click', () => pick(sheetSlot));

// ---------- 한꺼번에 고르기: 찍은 날짜 순서대로 빈칸에 ----------
async function bulk(files) {
  files = [...files].filter(f => isImage(f) || isVideo(f));
  if (!files.length) return;
  toast('날짜 순서대로 칸에 넣고 있어요…');
  const items = await Promise.all(files.map(async (f) => ({
    f, video: isVideo(f),
    date: (isImage(f) && await photoDate(f)) || new Date(f.lastModified).toISOString(),
    orient: isVideo(f) ? await videoOrient(f) : null
  })));
  items.sort((a, b) => a.date.localeCompare(b.date));
  const busy = (sl) => localIn(sl.id).some(([, l]) => l.uploading);
  const all = slotsOf(S.tpl);
  const photoSlots = all.filter(s => s.kind === 'photo' && !doneIn(s.id).length && !busy(s));
  const videoSlots = all.filter(s => (s.kind === 'video' || s.kind === 'media') && !doneIn(s.id).length && !busy(s));
  // 순서가 정해진 칸(photos)부터, 그다음 여러 장 칸(burst)
  const bursts = all.filter(isMulti).sort((a, b) => (a.kind === 'photos' ? 0 : 1) - (b.kind === 'photos' ? 0 : 1))
    .map(s => ({ s, room: (s.max || 6) - doneIn(s.id).length - localIn(s.id).filter(([, l]) => l.uploading).length }));
  let skipped = 0;
  for (const it of items) {
    if (!it.video) {
      const s = photoSlots.shift();
      if (s) { enqueueUpload(s.id, it.f); continue; }
      const b = bursts.find(x => x.room > 0);
      if (b) { b.room--; enqueueUpload(b.s.id, it.f); continue; }
      const mi = videoSlots.findIndex(s => s.kind === 'media');      // 남는 사진은 '사진 또는 영상' 칸에
      if (mi >= 0) enqueueUpload(videoSlots.splice(mi, 1)[0].id, it.f); else skipped++;
    } else {
      let i = videoSlots.findIndex(s => s.orient === it.orient);
      if (i < 0) i = videoSlots.findIndex(s => !s.orient || s.orient === 'any');
      if (i < 0) i = 0;
      const s = videoSlots.splice(i, 1)[0];
      if (s) enqueueUpload(s.id, it.f); else skipped++;
    }
  }
  if (skipped) toast(`칸보다 많은 ${skipped}개는 넣지 않았어요. 칸을 눌러 바꿀 수 있어요.`, 5000);
}
$('#bulk').addEventListener('change', () => { bulk($('#bulk').files); $('#bulk').value = ''; });
const drop = $('#drop');
['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
drop.addEventListener('drop', (e) => bulk(e.dataTransfer.files));

window.addEventListener('beforeunload', (e) => {
  if (S.running || S.queue.length || Object.keys(pending).length) { flush(); e.preventDefault(); e.returnValue = ''; }
});

// ---------- 미리보기 ----------
$('#previewBtn').addEventListener('click', async () => {
  const btn = $('#previewBtn'), errEl = $('#previewError');
  errEl.classList.add('hidden');
  if (S.running || S.queue.length) { errEl.textContent = '사진이 다 올라간 뒤에 만들 수 있어요.'; errEl.classList.remove('hidden'); return; }
  btn.disabled = true;
  try {
    clearTimeout(saveTimer); await flush();
    await api(`/api/projects/${id}/preview`, { method: 'POST', token });
    location.href = projectUrl('preview.html', id, token);
  } catch (err) {
    errEl.textContent = err.message; errEl.classList.remove('hidden');
    btn.disabled = false;
  }
});

// ---------- 시작 ----------
(async () => {
  try {
    const [p, data] = await Promise.all([api(`/api/projects/${id}`, { token }), loadTemplates()]);
    if (!['draft', 'preview_ready', 'failed'].includes(p.status)) { location.replace(projectUrl('preview.html', id, token)); return; }
    S.project = p;
    S.tpl = data.templates.find(t => t.code === p.template);
    S.tpl.categoryLabel = (data.categories.find(c => c.key === S.tpl.category) || {}).label;
    const cat = data.categories.find(c => c.key === S.tpl.category) || {};
    S.tpl.typeLabel = ((cat.types || data.types).find(c => c.key === S.tpl.type) || {}).label;
    remember({ id, token, template: S.tpl.code, name: S.tpl.name });
    renderHead(); renderFields(); renderScenes();
    if (p.status === 'preview_ready') $('#saved').textContent = '미리보기가 있어요. 고치고 다시 만들 수 있어요.';
  } catch (err) {
    $('#scenes').innerHTML = `<p class="error-text">${esc(err.message)}</p><a class="btn line" href="/orders">제작 내역으로</a>`;
  }
})();

// PC 크롬은 아이폰 HEIC 사진을 화면에 못 그린다. 깨진 그림 대신 '사진 넣음'으로 보여 준다(영상에는 그대로 잘 들어간다)
document.addEventListener('error', (e) => {
  const el = e.target;
  if (el && el.tagName === 'IMG' && el.closest('.slot')) {
    const s = document.createElement('span'); s.className = 'heic-ok'; s.textContent = '사진 넣음';
    s.style.cssText = 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:#f4efe9;color:#6b5f57;font-size:12px;font-weight:600';
    el.replaceWith(s);
  }
}, true);
