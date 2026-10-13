import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  OPTION_EDITOR_NEW_ID,
  optionEditorUrlId,
  readOptionEditorUrl,
  writeOptionEditorUrl,
} from './listing-option-editor-url';

describe('listing-option-editor-url', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reads option id and scene index from search', () => {
    expect(readOptionEditorUrl('?option=opt-1&optionScene=2')).toEqual({
      optionId: 'opt-1',
      sceneIndex: 2,
    });
    expect(readOptionEditorUrl('?option=new')).toEqual({
      optionId: OPTION_EDITOR_NEW_ID,
      sceneIndex: 0,
    });
    expect(readOptionEditorUrl('')).toBeNull();
  });

  it('clamps invalid scene indexes', () => {
    expect(readOptionEditorUrl('?option=x&optionScene=99')?.sceneIndex).toBe(3);
    expect(readOptionEditorUrl('?option=x&optionScene=-2')?.sceneIndex).toBe(0);
  });

  it('maps create sessions to the new sentinel', () => {
    expect(optionEditorUrlId('abc', true)).toBe(OPTION_EDITOR_NEW_ID);
    expect(optionEditorUrlId(null, true)).toBe(OPTION_EDITOR_NEW_ID);
    expect(optionEditorUrlId('abc', false)).toBe('abc');
  });

  it('preserves listing-editor history state when pushing option params', () => {
    const pushState = vi.fn();
    const replaceState = vi.fn();
    vi.stubGlobal('window', {
      location: {
        href: 'https://partner.traverion.test/partner/listings?edit=listing-1',
        pathname: '/partner/listings',
        search: '?edit=listing-1',
        hash: '',
      },
      history: {
        state: { supplierListingEditor: 'session-token' },
        pushState,
        replaceState,
      },
    });

    writeOptionEditorUrl({ optionId: 'new', sceneIndex: 0 }, 'push');

    expect(pushState).toHaveBeenCalledTimes(1);
    const [state, , url] = pushState.mock.calls[0];
    expect(state).toEqual({
      supplierListingEditor: 'session-token',
      traverionOptionEditor: true,
    });
    expect(String(url)).toContain('option=new');
    expect(String(url)).toContain('optionScene=0');
    expect(replaceState).not.toHaveBeenCalled();
  });
});
