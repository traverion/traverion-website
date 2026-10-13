import { describe, expect, it } from 'vitest';
import {
  OPTION_EDITOR_NEW_ID,
  optionEditorUrlId,
  readOptionEditorUrl,
} from './listing-option-editor-url';

describe('listing-option-editor-url', () => {
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
});
