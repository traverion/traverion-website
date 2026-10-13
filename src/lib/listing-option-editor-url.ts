/**
 * Query-param sync for the full-screen option editor.
 * Supports browser Back/Forward and refresh recovery without a separate route page.
 *
 * Params: `option` = option id | `new`, `optionScene` = 0–3 scene index.
 */

import { clampTourOptionSceneIndex } from './listing-option-progression';

export const OPTION_EDITOR_URL_PARAM = 'option';
export const OPTION_EDITOR_SCENE_PARAM = 'optionScene';
export const OPTION_EDITOR_NEW_ID = 'new';

export type OptionEditorUrlState = {
  optionId: string;
  sceneIndex: number;
};

export function readOptionEditorUrl(
  search: string = typeof window !== 'undefined' ? window.location.search : ''
): OptionEditorUrlState | null {
  const params = new URLSearchParams(search.startsWith('?') ? search : `?${search}`);
  const optionId = params.get(OPTION_EDITOR_URL_PARAM)?.trim() ?? '';
  if (!optionId) return null;
  const rawScene = params.get(OPTION_EDITOR_SCENE_PARAM);
  const sceneIndex = clampTourOptionSceneIndex(
    rawScene != null && rawScene !== '' ? Number(rawScene) : 0
  );
  return { optionId, sceneIndex };
}

export function writeOptionEditorUrl(
  state: OptionEditorUrlState | null,
  mode: 'push' | 'replace' = 'replace'
): void {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  if (!state) {
    url.searchParams.delete(OPTION_EDITOR_URL_PARAM);
    url.searchParams.delete(OPTION_EDITOR_SCENE_PARAM);
  } else {
    url.searchParams.set(OPTION_EDITOR_URL_PARAM, state.optionId);
    url.searchParams.set(OPTION_EDITOR_SCENE_PARAM, String(clampTourOptionSceneIndex(state.sceneIndex)));
  }
  const next = `${url.pathname}${url.search}${url.hash}`;
  const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (next === current && mode === 'replace') return;
  if (mode === 'push') {
    window.history.pushState({ traverionOptionEditor: Boolean(state) }, '', next);
  } else {
    window.history.replaceState({ traverionOptionEditor: Boolean(state) }, '', next);
  }
}

export function optionEditorUrlId(editingId: string | null, isCreate: boolean): string {
  if (isCreate || !editingId) return OPTION_EDITOR_NEW_ID;
  return editingId;
}
