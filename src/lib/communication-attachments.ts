/** Shared attachment limits for Partner Support + public communication forms. */

export const COMM_MAX_ATTACHMENTS = 5;
export const COMM_MAX_TOTAL_BYTES = 150 * 1024 * 1024; // 150 MB
export const COMM_MAX_IMAGE_BYTES = 25 * 1024 * 1024;
export const COMM_MAX_PDF_BYTES = 25 * 1024 * 1024;
export const COMM_MAX_VIDEO_BYTES = 100 * 1024 * 1024;

export const COMM_ALLOWED_EXTENSIONS = [
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.heic',
  '.heif',
  '.pdf',
  '.mp4',
  '.mov',
  '.webm',
] as const;

export type CommAttachmentKind = 'image' | 'pdf' | 'video';

export type CommMimeRule = {
  mime: string;
  kind: CommAttachmentKind;
  maxBytes: number;
  extensions: string[];
};

export const COMM_MIME_RULES: CommMimeRule[] = [
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

export const COMM_ACCEPT_ATTR = COMM_ALLOWED_EXTENSIONS.join(',');

export function formatCommFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

export function extensionOf(filename: string): string {
  const base = filename.trim().toLowerCase();
  const i = base.lastIndexOf('.');
  if (i < 0) return '';
  return base.slice(i);
}

export function ruleForMime(mime: string): CommMimeRule | null {
  const m = mime.trim().toLowerCase();
  return COMM_MIME_RULES.find((r) => r.mime === m) ?? null;
}

export function ruleForFilename(filename: string): CommMimeRule | null {
  const ext = extensionOf(filename);
  return COMM_MIME_RULES.find((r) => r.extensions.includes(ext)) ?? null;
}

/** Magic-byte sniff (first 16 bytes). Returns null if unknown. */
export function sniffCommKind(bytes: Uint8Array): { kind: CommAttachmentKind; mime: string } | null {
  if (bytes.length < 4) return null;
  // JPEG
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { kind: 'image', mime: 'image/jpeg' };
  }
  // PNG
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return { kind: 'image', mime: 'image/png' };
  }
  // WEBP: RIFF....WEBP
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
  // PDF
  if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) {
    return { kind: 'pdf', mime: 'application/pdf' };
  }
  // ISO BMFF (ftyp): HEIC/HEIF images or MP4/MOV video
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
  // WebM (EBML)
  if (bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) {
    return { kind: 'video', mime: 'video/webm' };
  }
  return null;
}

export type CommFileValidation =
  | { ok: true; kind: CommAttachmentKind; mime: string; maxBytes: number }
  | { ok: false; error: string };

export function validateCommFileMeta(file: {
  name: string;
  size: number;
  type?: string;
}): CommFileValidation {
  const byExt = ruleForFilename(file.name);
  const byMime = file.type ? ruleForMime(file.type) : null;
  const rule = byExt ?? byMime;
  if (!rule) {
    return {
      ok: false,
      error: 'Use JPG, PNG, WebP, HEIC, PDF, MP4, MOV, or WebM.',
    };
  }
  if (byExt && byMime && byExt.kind !== byMime.kind) {
    return { ok: false, error: 'File type does not match the filename extension.' };
  }
  if (file.size <= 0) return { ok: false, error: 'File is empty.' };
  if (file.size > rule.maxBytes) {
    return {
      ok: false,
      error: `${rule.kind === 'video' ? 'Videos' : rule.kind === 'pdf' ? 'PDFs' : 'Images'} must be ${formatCommFileSize(rule.maxBytes)} or smaller.`,
    };
  }
  return { ok: true, kind: rule.kind, mime: rule.mime, maxBytes: rule.maxBytes };
}

export function validateCommAttachmentBatch(
  files: { name: string; size: number; type?: string }[]
): { ok: true } | { ok: false; error: string } {
  if (files.length > COMM_MAX_ATTACHMENTS) {
    return { ok: false, error: `Attach at most ${COMM_MAX_ATTACHMENTS} files.` };
  }
  let total = 0;
  for (const f of files) {
    const v = validateCommFileMeta(f);
    if (!v.ok) return v;
    total += f.size;
  }
  if (total > COMM_MAX_TOTAL_BYTES) {
    return {
      ok: false,
      error: `Combined attachments must be ${formatCommFileSize(COMM_MAX_TOTAL_BYTES)} or smaller.`,
    };
  }
  return { ok: true };
}

export async function sniffFileHeader(file: Blob): Promise<Uint8Array> {
  const slice = file.slice(0, 16);
  const buf = await slice.arrayBuffer();
  return new Uint8Array(buf);
}

export async function validateCommFileWithSniff(file: File): Promise<CommFileValidation> {
  const meta = validateCommFileMeta(file);
  if (!meta.ok) return meta;
  try {
    const header = await sniffFileHeader(file);
    const sniffed = sniffCommKind(header);
    // HEIC browsers often report empty type; extension+size already checked.
    if (!sniffed) {
      if (meta.kind === 'image' && (meta.mime === 'image/heic' || meta.mime === 'image/heif')) {
        return meta;
      }
      // Some browsers omit type for MOV; allow if extension matched video and size ok.
      if (meta.kind === 'video' && !file.type) return meta;
      return { ok: false, error: 'Could not verify the file type from its contents.' };
    }
    if (sniffed.kind !== meta.kind) {
      return { ok: false, error: 'File contents do not match the declared type.' };
    }
    return { ok: true, kind: sniffed.kind, mime: sniffed.mime, maxBytes: meta.maxBytes };
  } catch {
    return { ok: false, error: 'Could not read the file for validation.' };
  }
}

/** @deprecated Use COMM_* limits — kept for Partner Support import migration. */
export const PARTNER_SUPPORT_MAX_ATTACHMENTS = COMM_MAX_ATTACHMENTS;
export const PARTNER_SUPPORT_MAX_FILE_BYTES = COMM_MAX_VIDEO_BYTES;
export const PARTNER_SUPPORT_ALLOWED_MIME = COMM_MIME_RULES.map((r) => r.mime);
