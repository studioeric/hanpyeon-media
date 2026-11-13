// 이어 올리기 업로드: 파일을 조각내 순서대로 올리고, 끊기면 올라간 조각은 건너뛴다.
import { api, ApiError } from './common.js';

function putPart(url, blob, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.setRequestHeader('content-type', 'application/octet-stream');
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(e.loaded); };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else {
        let msg = '업로드에 실패했어요.';
        try { msg = JSON.parse(xhr.responseText).error || msg; } catch {}
        const err = new ApiError(msg, 'upload', xhr.status);
        reject(err);
      }
    };
    xhr.onerror = () => reject(new ApiError('인터넷 연결이 끊겼어요.', 'network', 0));
    xhr.send(blob);
  });
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

export async function uploadFile({ projectId, token, slot, file, takenAt, onProgress }) {
  const start = await api(`/api/projects/${projectId}/media`, {
    method: 'POST', token,
    body: { slot, filename: file.name, size: file.size, type: file.type, takenAt }
  });
  const { mediaId, partSize } = start;
  const done = new Set(start.parts || []);
  const total = Math.ceil(file.size / partSize);
  let sent = 0;
  for (const n of done) sent += Math.min(partSize, file.size - (n - 1) * partSize);
  onProgress && onProgress(sent / file.size);

  for (let n = 1; n <= total; n++) {
    if (done.has(n)) continue;
    const blob = file.slice((n - 1) * partSize, Math.min(n * partSize, file.size));
    const url = new URL(`/api/projects/${projectId}/media/${mediaId}/part/${n}`, location.origin);
    url.searchParams.set('token', token);
    for (let attempt = 0; ; attempt++) {
      try {
        await putPart(url, blob, (loaded) => onProgress && onProgress((sent + loaded) / file.size));
        break;
      } catch (err) {
        if (err.status >= 400 && err.status < 500) throw err;
        if (attempt >= 6) throw err;
        if (!navigator.onLine) await new Promise(r => window.addEventListener('online', r, { once: true }));
        await sleep(Math.min(30000, 1500 * 2 ** attempt));
      }
    }
    sent += blob.size;
    onProgress && onProgress(sent / file.size);
  }
  await api(`/api/projects/${projectId}/media/${mediaId}/complete`, { method: 'POST', token });
  return mediaId;
}

// JPEG 사진의 촬영 시각(EXIF DateTimeOriginal)을 읽는다. 없으면 null.
export async function photoDate(file) {
  try {
    if (!/jpe?g$/i.test(file.name) && file.type !== 'image/jpeg') return null;
    const buf = await file.slice(0, 256 * 1024).arrayBuffer();
    const v = new DataView(buf);
    if (v.getUint16(0) !== 0xFFD8) return null;
    let off = 2;
    while (off + 4 < v.byteLength) {
      const marker = v.getUint16(off), len = v.getUint16(off + 2);
      if (marker === 0xFFE1 && v.getUint32(off + 4) === 0x45786966) return readExif(v, off + 10);
      if ((marker & 0xFF00) !== 0xFF00) break;
      off += 2 + len;
    }
  } catch { /* 읽지 못하면 파일 날짜를 쓴다 */ }
  return null;
}
function readExif(v, tiff) {
  const le = v.getUint16(tiff) === 0x4949;
  const u16 = (o) => v.getUint16(o, le), u32 = (o) => v.getUint32(o, le);
  const ifd = (start, want) => {
    const n = u16(start);
    for (let i = 0; i < n; i++) {
      const e = start + 2 + i * 12;
      if (u16(e) === want) return e;
    }
    return -1;
  };
  const ifd0 = tiff + u32(tiff + 4);
  const ptr = ifd(ifd0, 0x8769);
  if (ptr < 0) return null;
  const exif = tiff + u32(ptr + 8);
  const e = ifd(exif, 0x9003);
  if (e < 0) return null;
  const at = tiff + u32(e + 8);
  let s = '';
  for (let i = 0; i < 19; i++) s += String.fromCharCode(v.getUint8(at + i));
  const m = /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(s);
  return m ? `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}` : null;
}

// 사진을 올리기 전에 알맞은 크기로 줄인다(긴 쪽 4000px, JPEG 90%). 4K 완성본에도 충분하고, 폰 원본(5~30MB)보다 훨씬 빨리 올라간다.
// 회전 정보는 반영해서 바로 세운다. 투명한 부분은 흰 바탕. 브라우저가 못 여는 형식(PC 크롬의 HEIC 등)이나 이미 작은 사진은 그대로 올린다.
// 돌려주는 값: { file, w, h } (w, h는 알 수 없으면 0)
const MAX_SIDE = 4000;
export async function shrinkPhoto(file) {
  const keep = (w = 0, h = 0) => ({ file, w, h });
  if (!isImage(file) || /gif$/i.test(file.type)) return keep();
  let url;
  try {
    url = URL.createObjectURL(file);
    const img = new Image(); img.src = url; await img.decode();
    const w = img.naturalWidth, h = img.naturalHeight; if (!w || !h) return keep();
    const big = Math.max(w, h) > MAX_SIDE, heavy = file.size > 2.5 * 1024 * 1024, jpeg = /jpe?g$/i.test(file.type) || /\.jpe?g$/i.test(file.name);
    if (!big && !heavy && jpeg) return keep(w, h);
    const s = Math.min(1, MAX_SIDE / Math.max(w, h)), tw = Math.round(w * s), th = Math.round(h * s);
    const c = document.createElement('canvas'); c.width = tw; c.height = th;
    const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, tw, th); g.imageSmoothingQuality = 'high';
    g.drawImage(img, 0, 0, tw, th);
    const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.9));
    c.width = c.height = 0;
    if (!blob || (blob.size >= file.size && !big)) return keep(w, h);
    const name = file.name.replace(/\.[^.]+$/, '') + '.jpg';
    return { file: new File([blob], name, { type: 'image/jpeg', lastModified: file.lastModified }), w: tw, h: th };
  } catch { return keep(); }
  finally { if (url) URL.revokeObjectURL(url); }
}

// 영상이 가로인지 세로인지 (브라우저가 회전 정보를 반영해 알려 준다)
export function videoOrient(file) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const vid = document.createElement('video');
    const done = (o) => { URL.revokeObjectURL(url); resolve(o); };
    const timer = setTimeout(() => done('any'), 5000);
    vid.preload = 'metadata';
    vid.muted = true;
    vid.onloadedmetadata = () => { clearTimeout(timer); done(vid.videoWidth >= vid.videoHeight ? 'landscape' : 'portrait'); };
    vid.onerror = () => { clearTimeout(timer); done('any'); };
    vid.src = url;
  });
}

export const isVideo = (f) => f.type.startsWith('video/') || /\.(mp4|mov|m4v)$/i.test(f.name);
export const isImage = (f) => f.type.startsWith('image/') || /\.(jpe?g|png|heic|heif)$/i.test(f.name);
