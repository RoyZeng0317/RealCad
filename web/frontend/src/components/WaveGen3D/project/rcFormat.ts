// RealCad Lab 專案檔 .rc：專屬二進位格式，只有這個網站讀得懂
//   [0..7]   簽章 "RCLAB" 1A 0D 0A（跟 PNG 一樣，檔案被當文字檔轉換換行時會被偵測出來）
//   [8]      格式版本
//   [9]      旗標（bit0 = 內容有 gzip 壓縮）
//   [10..21] AES-GCM 的 IV（12 bytes，每次存檔隨機產生）
//   [22..]   密文：AES-256-GCM(gzip(JSON))，前 10 bytes 當 AAD 一起驗證；內容被改過就打不開
// 金鑰內建在網站程式裡，所以這不是「保密」而是「專屬格式 + 防竄改」：一般文字編輯器或其他程式看不懂也改不了。
const MAGIC = [0x52, 0x43, 0x4c, 0x41, 0x42, 0x1a, 0x0d, 0x0a];
export const RC_VERSION = 1;
const FLAG_GZIP = 1;
const HEADER = 10;
const IV_LEN = 12;
const APP_SECRET = 'RealCad-Lab::project-file::v1::7f3c9b21-5d4e-4a8b-9c0f-e2d6a1b8c4f7';

export class RcError extends Error {}

let keyPromise: Promise<CryptoKey> | null = null;
function key(): Promise<CryptoKey> {
  if (!keyPromise) {
    keyPromise = crypto.subtle
      .digest('SHA-256', new TextEncoder().encode(APP_SECRET))
      .then((raw) => crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']));
  }
  return keyPromise;
}

async function pipe(data: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Response(new Blob([data as BlobPart]).stream().pipeThrough(stream));
  return new Uint8Array(await out.arrayBuffer());
}
const canGzip = () => typeof CompressionStream !== 'undefined' && typeof DecompressionStream !== 'undefined';

export async function encodeRc(doc: unknown): Promise<Uint8Array> {
  let body: Uint8Array = new TextEncoder().encode(JSON.stringify(doc));
  const gzip = canGzip();
  if (gzip) body = await pipe(body, new CompressionStream('gzip'));
  const header = new Uint8Array(HEADER);
  header.set(MAGIC, 0);
  header[8] = RC_VERSION;
  header[9] = gzip ? FLAG_GZIP : 0;
  const iv = crypto.getRandomValues(new Uint8Array(IV_LEN));
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: header }, await key(), body as BufferSource));
  const out = new Uint8Array(HEADER + IV_LEN + cipher.length);
  out.set(header, 0);
  out.set(iv, HEADER);
  out.set(cipher, HEADER + IV_LEN);
  return out;
}

export async function decodeRc(bytes: Uint8Array): Promise<unknown> {
  if (bytes.length < HEADER + IV_LEN + 16 || MAGIC.some((b, i) => bytes[i] !== b)) {
    throw new RcError('這不是 RealCad Lab 的 .rc 專案檔');
  }
  const version = bytes[8];
  if (version > RC_VERSION) throw new RcError(`這個 .rc 檔是較新版本（v${version}）存的，請更新網站後再開啟`);
  const header = bytes.slice(0, HEADER);
  const iv = bytes.slice(HEADER, HEADER + IV_LEN);
  let body: Uint8Array;
  try {
    body = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv, additionalData: header }, await key(), bytes.slice(HEADER + IV_LEN)));
  } catch {
    throw new RcError('檔案已損毀或被修改過（驗證失敗），無法開啟');
  }
  if (header[9] & FLAG_GZIP) {
    if (!canGzip()) throw new RcError('這個瀏覽器不支援解壓縮，請改用新版 Chrome / Edge / Firefox / Safari');
    body = await pipe(body, new DecompressionStream('gzip'));
  }
  try {
    return JSON.parse(new TextDecoder().decode(body));
  } catch {
    throw new RcError('檔案內容格式錯誤');
  }
}
