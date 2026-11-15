import { useEffect, useId, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Knöpfe am unteren Rand */
  footer?: ReactNode;
  /** Macht den Inhalt zum Formular: Enter und ein Knopf mit type="submit" lösen onSubmit aus. */
  onSubmit?: () => void;
  size?: 'small' | 'medium' | 'large';
}

/**
 * Dialog auf Basis des nativen <dialog>-Elements: Der Browser kümmert sich um
 * Fokusfalle, Escape-Taste und darum, dass der Rest der Seite nicht bedienbar ist.
 */
export function Modal({ title, onClose, children, footer, onSubmit, size = 'medium' }: ModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (!dialog.open) dialog.showModal();
    // showModal() setzt den Fokus auf das erste bedienbare Element – das wäre der
    // Schließen-Knopf. Stattdessen soll das mit data-autofocus markierte Feld starten.
    dialog.querySelector<HTMLElement>('[data-autofocus]')?.focus();
    return () => dialog.close();
  }, []);

  const content = (
    <>
      <div className="modal-body">{children}</div>
      {footer && <div className="modal-footer">{footer}</div>}
    </>
  );

  return (
    <dialog
      ref={dialogRef}
      className={`modal modal-${size}`}
      aria-labelledby={titleId}
      onCancel={(event) => {
        // Escape: Schließen dem Aufrufer überlassen, damit der Zustand in React stimmt.
        event.preventDefault();
        onClose();
      }}
    >
      <div className="modal-header">
        <h2 id={titleId}>{title}</h2>
        <button type="button" className="icon-button" onClick={onClose} aria-label="Schließen">
          <X size={18} aria-hidden />
        </button>
      </div>
      {onSubmit ? (
        <form
          className="modal-form"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            // Ein Absenden in einem darüberliegenden Dialog soll dieses Formular nicht auslösen.
            event.stopPropagation();
            onSubmit();
          }}
        >
          {content}
        </form>
      ) : (
        content
      )}
    </dialog>
  );
}

interface ConfirmDialogProps {
  title: string;
  children: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  busy?: boolean;
  error?: string | null;
}

/** Rückfrage vor dem Löschen. */
export function ConfirmDialog({ title, children, confirmLabel, onConfirm, onCancel, busy, error }: ConfirmDialogProps) {
  return (
    <Modal
      title={title}
      onClose={onCancel}
      size="small"
      footer={
        <>
          <button type="button" className="button" onClick={onCancel} disabled={busy} data-autofocus>
            Abbrechen
          </button>
          <button type="button" className="button button-danger" onClick={onConfirm} disabled={busy}>
            {confirmLabel}
          </button>
        </>
      }
    >
      <div className="confirm-text">{children}</div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </Modal>
  );
}
