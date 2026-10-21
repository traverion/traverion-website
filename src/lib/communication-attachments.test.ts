import { describe, expect, it } from 'vitest';
import {
  COMM_MAX_ATTACHMENTS,
  COMM_MAX_TOTAL_BYTES,
  sniffCommKind,
  validateCommAttachmentBatch,
  validateCommFileMeta,
} from './communication-attachments';

describe('communication-attachments', () => {
  it('accepts jpeg within image limit', () => {
    const v = validateCommFileMeta({
      name: 'shot.jpg',
      size: 5 * 1024 * 1024,
      type: 'image/jpeg',
    });
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.kind).toBe('image');
  });

  it('rejects oversized video', () => {
    const v = validateCommFileMeta({
      name: 'clip.mp4',
      size: 101 * 1024 * 1024,
      type: 'video/mp4',
    });
    expect(v.ok).toBe(false);
  });

  it('enforces batch count and total size', () => {
    const files = Array.from({ length: COMM_MAX_ATTACHMENTS + 1 }, (_, i) => ({
      name: `a${i}.png`,
      size: 1000,
      type: 'image/png',
    }));
    expect(validateCommAttachmentBatch(files).ok).toBe(false);

    const huge = [
      { name: 'a.mp4', size: COMM_MAX_TOTAL_BYTES - 1000, type: 'video/mp4' },
      { name: 'b.mp4', size: 2000, type: 'video/mp4' },
    ];
    expect(validateCommAttachmentBatch(huge).ok).toBe(false);
  });

  it('sniffs jpeg magic bytes', () => {
    const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]);
    expect(sniffCommKind(bytes)?.mime).toBe('image/jpeg');
  });

  it('sniffs pdf magic bytes', () => {
    const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]);
    expect(sniffCommKind(bytes)?.kind).toBe('pdf');
  });
});
