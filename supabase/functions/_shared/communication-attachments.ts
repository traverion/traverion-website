/** Server-side attachment limits (mirror of src/lib/communication-attachments.ts). */

export const COMM_BUCKET = 'communication-attachments';
export const COMM_MAX_ATTACHMENTS = 5;
export const COMM_MAX_TOTAL_BYTES = 150 * 1024 * 1024;
export const COMM_MAX_IMAGE_BYTES = 25 * 1024 * 1024;
export const COMM_MAX_PDF_BYTES = 25 * 1024 * 1024;
export const COMM_MAX_VIDEO_BYTES = 100 * 1024 * 1024;
export const COMM_UPLOAD_SESSION_TTL_SECONDS = 60 * 60; // 1 hour
export const COMM_SIGNED_DOWNLOAD_SECONDS = 60 * 60 * 24 * 7; // 7 days for email links
export const COMM_SIGNED_UPLOAD_SECONDS = 60 * 30; // 30 minutes

export type CommAttachmentKind = 'image' | 'pdf' | 'video';

type MimeRule = { mime: string; kind: CommAttachmentKind; maxBytes: number; extensions: string[] };

export const COMM_MIME_RULES: MimeRule[] = [
  { mime: 'image/jpeg', kind: 'image', maxBytes: COMM_MAX_IMAGE_BYTES, extensions: ['.jpg', '.jpeg'] },
  { mime: 'image/png', kind: 'image', maxBytes: COMM_MAX_IMAGE_BYTES, extensions: ['.png'] },
  { mime: 'image/webp', kind: 'image', maxBytes: COMM_MAX_IMAGE_BYTES, extensions: ['.webp'] },
  { mime: 'image/heic', kind: 'image', maxBytes: COMM_MAX_IMAGE_BYTES, extensions: ['.heic'] },
  { mime: 'image/heif', kind: 'image', maxBytes: COMM_MAX_IMAGE_BYTES, extensions: ['.heif'] },
  { mime: 'application/pdf', kind: 'pdf', maxBytes: COMM_MAX_PDF_BYTES, extensions: ['.pdf'] },
  { mime: 'video/mp4', kind: 'video', maxBytes: COMM_MAX_VIDEO_BYTES, extensions: ['.mp4'] },
  { mime: 'video/quicktime', kind: 'video', maxBytes: COMM_MAX_VIDEO_BYTES, extensions: ['.mov'] },
  { mime: 'video/webm', kind: 'video', maxBytes: COMM_MAX_VIDEO_BYTES, extensions: ['.webm'] },
];

export function extensionOf(filename: string): string {
  const base = filename.trim().toLowerCase();
  const i = base.lastIndexOf('.');
  return i < 0 ? '' : base.slice(i);
}

export function sanitizeFilename(name: string): string {
  let f = String(name ?? 'attachment').trim().replace(/[^\w.\-()+ ]+/g, '_');
  if (!f) f = 'attachment';
  return f.slice(0, 120);
}

export function ruleForMime(mime: string): MimeRule | null {
  return COMM_MIME_RULES.find((r) => r.mime === mime.trim().toLowerCase()) ?? null;
}

export function ruleForFilename(filename: string): MimeRule | null {
  const ext = extensionOf(filename);
  return COMM_MIME_RULES.find((r) => r.extensions.includes(ext)) ?? null;
}

export function sniffCommKind(bytes: Uint8Array): { kind: CommAttachmentKind; mime: string } | null {
  if (bytes.length < 4) return null;
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { kind: 'image', mime: 'image/jpeg' };
  }
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return { kind: 'image', mime: 'image/png' };
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return { kind: 'image', mime: 'image/webp' };
  }
  if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) {
    return { kind: 'pdf', mime: 'application/pdf' };
  }
  if (
    bytes.length >= 12 &&
    bytes[4] === 0x66 &&
    bytes[5] === 0x74 &&
    bytes[6] === 0x79 &&
    bytes[7] === 0x70
  ) {
    const brand = String.fromCharCode(bytes[8] ?? 0, bytes[9] ?? 0, bytes[10] ?? 0, bytes[11] ?? 0).toLowerCase();
    if (['heic', 'heix', 'heif', 'mif1', 'msf1'].includes(brand)) {
      return { kind: 'image', mime: brand.startsWith('hei') ? 'image/heic' : 'image/heif' };
    }
    if (brand.startsWith('qt')) return { kind: 'video', mime: 'video/quicktime' };
    return { kind: 'video', mime: 'video/mp4' };
  }
  if (bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) {
    return { kind: 'video', mime: 'video/webm' };
  }
  return null;
}

export function validateCommFileMeta(file: {
  name: string;
  size: number;
  type?: string;
}): { ok: true; kind: CommAttachmentKind; mime: string } | { ok: false; error: string } {
  const byExt = ruleForFilename(file.name);
  const byMime = file.type ? ruleForMime(file.type) : null;
  const rule = byExt ?? byMime;
  if (!rule) {
    return { ok: false, error: 'Use JPG, PNG, WebP, HEIC, PDF, MP4, MOV, or WebM.' };
  }
  if (file.size <= 0) return { ok: false, error: 'File is empty.' };
  if (file.size > rule.maxBytes) {
    return { ok: false, error: `File exceeds the ${rule.kind} size limit.` };
  }
  return { ok: true, kind: rule.kind, mime: rule.mime };
}

export async function sha256Hex(data: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function hashClientToken(token: string): Promise<string> {
  const enc = new TextEncoder().encode(token);
  return sha256Hex(enc.buffer.slice(enc.byteOffset, enc.byteOffset + enc.byteLength));
}
