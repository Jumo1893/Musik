import { useId, useState } from 'react';
import { errorMessage } from '../api.ts';
import { Modal } from './Modal.tsx';
import { Field } from './ui.tsx';

interface PlaylistDetailsDialogProps {
  title: string;
  submitLabel: string;
  initialName?: string;
  initialDescription?: string | null;
  /** Speichert; ein abgelehntes Promise wird als Fehlermeldung im Dialog gezeigt. */
  onSubmit: (details: { name: string; description: string | null }) => Promise<unknown>;
  onClose: () => void;
}

/** Name und Beschreibung einer Playlist – zum Anlegen einer leeren Playlist und zum Umbenennen. */
export function PlaylistDetailsDialog({
  title,
  submitLabel,
  initialName = '',
  initialDescription = null,
  onSubmit,
  onClose,
}: PlaylistDetailsDialogProps) {
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription ?? '');
  const [nameError, setNameError] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const nameId = useId();
  const descriptionId = useId();

  async function submit() {
    if (name.trim() === '') {
      setNameError('Bitte einen Namen angeben.');
      return;
    }
    setNameError(undefined);
    setError(null);
    setBusy(true);
    try {
      await onSubmit({ name: name.trim(), description: description.trim() || null });
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <Modal
      title={title}
      onClose={onClose}
      onSubmit={() => void submit()}
      size="small"
      footer={
        <>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <button type="button" className="button" onClick={onClose} disabled={busy}>
            Abbrechen
          </button>
          <button type="submit" className="button button-primary" disabled={busy}>
            {submitLabel}
          </button>
        </>
      }
    >
      <Field label="Name" htmlFor={nameId} error={nameError}>
        <input
          id={nameId}
          className="input"
          value={name}
          maxLength={200}
          data-autofocus
          placeholder="z. B. Sonntagmorgen"
          onChange={(event) => setName(event.target.value)}
        />
      </Field>
      <Field label="Beschreibung" htmlFor={descriptionId} hint="Optional">
        <textarea
          id={descriptionId}
          className="input textarea"
          rows={3}
          value={description}
          maxLength={2000}
          onChange={(event) => setDescription(event.target.value)}
        />
      </Field>
    </Modal>
  );
}
