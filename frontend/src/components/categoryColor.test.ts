import { describe, expect, test } from 'vitest';
import { CATEGORY_COLORS, suggestCategoryColor } from './CategoryFormDialog.tsx';

describe('suggestCategoryColor', () => {
  test('schlägt die erste noch freie Standardfarbe vor', () => {
    expect(suggestCategoryColor([])).toBe(CATEGORY_COLORS[0].value);
    expect(suggestCategoryColor([{ color: CATEGORY_COLORS[0].value }])).toBe(CATEGORY_COLORS[1].value);
  });

  test('sind alle vergeben, kommt die am seltensten verwendete Farbe', () => {
    const allOnce = CATEGORY_COLORS.map((color) => ({ color: color.value }));
    expect(suggestCategoryColor(allOnce)).toBe(CATEGORY_COLORS[0].value);

    // Die erste Farbe ist doppelt vergeben (Großschreibung zählt mit), eigene Farben zählen nicht.
    const firstTwice = [...allOnce, { color: CATEGORY_COLORS[0].value.toUpperCase() }, { color: '#123456' }];
    expect(suggestCategoryColor(firstTwice)).toBe(CATEGORY_COLORS[1].value);
  });
});
