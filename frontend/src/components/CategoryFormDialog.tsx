import { useId, useState } from 'react';
import { ApiError, errorMessage } from '../api.ts';
import { useSaveCategory } from '../queries.ts';
import type { Category } from '../types.ts';
import { Modal } from './Modal.tsx';
import { CategoryChip, Field } from './ui.tsx';

/** Die acht Farben der Startkategorien; untereinander gut unterscheidbar. */
export const CATEGORY_COLORS = [
  { value: '#2a78d6', name: 'Blau' },
  { value: '#eb6834', name: 'Orange' },
  { value: '#1baf7a', name: 'Türkis' },
  { value: '#eda100', name: 'Gelb' },
  { value: '#e87ba4', name: 'Rosa' },
  { value: '#008300', name: 'Grün' },
  { value: '#6250d6', name: 'Violett' },
  { value: '#e34948', name: 'Rot' },
] as const;

/** Schlägt für eine neue Kategorie die Standardfarbe vor, die bisher am seltensten vergeben ist. */
export function suggestCategoryColor(existing: Array<Pick<Category, 'color'>>): string {
  const usage = new Map<string, number>(CATEGORY_COLORS.map((color) => [color.value, 0]));
  for (const category of existing) {
    const count = usage.get(category.color.toLowerCase());
    if (count !== undefined) usage.set(category.color.toLowerCase(), count + 1);
  }
  let best: string = CATEGORY_COLORS[0].value;
  for (const [color, count] of usage) {
    if (count < usage.get(best)!) best = color;
  }
  return best;
}

interface CategoryFormDialogProps {
  /** null legt eine neue Kategorie an */
  category: Category | null;
  /** Vorschlag für die Farbe einer neuen Kategorie */
  suggestedColor?: string;
  onClose: () => void;
  onSaved?: (category: Category) => void;
}

export function CategoryFormDialog({ category, suggestedColor, onClose, onSaved }: CategoryFormDialogProps) {
  const [name, setName] = useState(category?.name ?? '');
  const [description, setDescription] = useState(category?.description ?? '');
  const [color, setColor] = useState(category?.color ?? suggestedColor ?? CATEGORY_COLORS[0].value);
  const [nameError, setNameError] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const saveCategory = useSaveCategory();
  const nameId = useId();
  const descriptionId = useId();
  const colorId = useId();

  function submit() {
    if (name.trim() === '') {
      setNameError('Bitte einen Namen angeben.');
      return;
    }
    setNameError(undefined);
    setError(null);
    saveCategory.mutate(
      { id: category?.id ?? null, input: { name, color, description: description.trim() || null } },
      {
        onSuccess: (saved) => {
          onSaved?.(saved);
          onClose();
        },
        onError: (err) => {
          if (err instanceof ApiError && err.fields.name) setNameError(err.fields.name);
          else setError(errorMessage(err));
        },
      },
    );
  }

  return (
    <Modal
      title={category ? 'Kategorie bearbeiten' : 'Neue Kategorie'}
      onClose={onClose}
      onSubmit={submit}
      size="small"
      footer={
        <>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <button type="button" className="button" onClick={onClose} disabled={saveCategory.isPending}>
            Abbrechen
          </button>
          <button type="submit" className="button button-primary" disabled={saveCategory.isPending}>
            Speichern
          </button>
        </>
      }
    >
      <Field label="Name" htmlFor={nameId} error={nameError}>
        <input
          id={nameId}
          className="input"
          value={name}
          maxLength={60}
          data-autofocus
          placeholder="z. B. Roadtrip"
          onChange={(event) => setName(event.target.value)}
        />
      </Field>

      <Field label="Beschreibung" htmlFor={descriptionId} hint="Optional – wofür steht die Kategorie?">
        <input
          id={descriptionId}
          className="input"
          value={description}
          maxLength={500}
          onChange={(event) => setDescription(event.target.value)}
        />
      </Field>

      <div className="field">
        <span className="field-label" id={colorId}>
          Farbe
        </span>
        <div className="swatches" role="group" aria-labelledby={colorId}>
          {CATEGORY_COLORS.map((swatch) => (
            <button
              key={swatch.value}
              type="button"
              className="swatch"
              style={{ background: swatch.value }}
              aria-label={swatch.name}
              title={swatch.name}
              aria-pressed={color === swatch.value}
              onClick={() => setColor(swatch.value)}
            />
          ))}
          <label className="swatch-custom" title="Eigene Farbe wählen">
            <input type="color" value={color} onChange={(event) => setColor(event.target.value.toLowerCase())} />
            <span>Eigene</span>
          </label>
        </div>
      </div>

      <div className="field">
        <span className="field-label">Vorschau</span>
        <div>
          <CategoryChip category={{ name: name.trim() || 'Kategorie', color }} />
        </div>
      </div>
    </Modal>
  );
}
