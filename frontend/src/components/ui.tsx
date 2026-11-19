// Kleine, überall verwendete Bausteine der Oberfläche.

import { useState, type CSSProperties, type ReactNode } from 'react';
import { CircleAlert, Music, Star } from 'lucide-react';
import { errorMessage } from '../api.ts';
import type { Category } from '../types.ts';

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="page-header">
      <div>
        <h1>{title}</h1>
        {subtitle && <p className="page-subtitle">{subtitle}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </header>
  );
}

export function EmptyState({ icon, title, children }: { icon?: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="empty-state">
      {icon && <div className="empty-icon">{icon}</div>}
      <h2>{title}</h2>
      {children && <div className="empty-text">{children}</div>}
    </div>
  );
}

export function LoadingNote({ label = 'Lade …' }: { label?: string }) {
  return (
    <p className="loading-note" role="status">
      {label}
    </p>
  );
}

export function ErrorNote({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <div className="error-note" role="alert">
      <CircleAlert size={18} aria-hidden />
      <span>{errorMessage(error)}</span>
      {onRetry && (
        <button type="button" className="button button-small" onClick={onRetry}>
          Erneut versuchen
        </button>
      )}
    </div>
  );
}

interface FieldProps {
  label: string;
  htmlFor?: string;
  hint?: ReactNode;
  error?: string | undefined;
  className?: string;
  children: ReactNode;
}

/** Beschriftetes Eingabefeld mit optionalem Hinweis und Fehlermeldung. */
export function Field({ label, htmlFor, hint, error, className, children }: FieldProps) {
  return (
    <div className={`field ${error ? 'field-invalid' : ''} ${className ?? ''}`}>
      <label className="field-label" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {error ? (
        <p className="field-error" role="alert">
          {error}
        </p>
      ) : (
        hint && <p className="field-hint">{hint}</p>
      )}
    </div>
  );
}

/**
 * Die Farbe einer Kategorie wird als CSS-Variable gesetzt; das Aussehen regelt das
 * Stylesheet. Über data-color tauscht es im dunklen Schema die Standardfarben gegen
 * ihre dunklen Stufen.
 */
export function colorProps(color: string): { style: CSSProperties; 'data-color': string } {
  return { style: { '--chip-color': color } as CSSProperties, 'data-color': color.toLowerCase() };
}

export function CategoryChip({ category }: { category: Pick<Category, 'name' | 'color'> }) {
  return (
    <span className="chip" {...colorProps(category.color)}>
      <span className="chip-dot" aria-hidden />
      {category.name}
    </span>
  );
}

interface ChipToggleProps {
  category: Pick<Category, 'name' | 'color'>;
  pressed: boolean;
  onToggle: () => void;
  /** Aussehen für „ausschließen“ statt „auswählen“ */
  tone?: 'include' | 'exclude';
  count?: number;
}

export function ChipToggle({ category, pressed, onToggle, tone = 'include', count }: ChipToggleProps) {
  return (
    <button
      type="button"
      className={`chip chip-toggle ${tone === 'exclude' ? 'chip-exclude' : ''}`}
      {...colorProps(category.color)}
      aria-pressed={pressed}
      onClick={onToggle}
    >
      <span className="chip-dot" aria-hidden />
      {category.name}
      {count !== undefined && <span className="chip-count">{count}</span>}
    </button>
  );
}

/** Kategorien eines Songs als Chips, alphabetisch. */
export function CategoryChips({ ids, categories }: { ids: number[]; categories: Map<number, Category> }) {
  const known = ids
    .map((id) => categories.get(id))
    .filter((category) => category !== undefined)
    .sort((a, b) => a.name.localeCompare(b.name, 'de'));
  if (known.length === 0) return <span className="muted">–</span>;
  return (
    <span className="chip-list">
      {known.map((category) => (
        <CategoryChip key={category.id} category={category} />
      ))}
    </span>
  );
}

/** Anzeige einer Bewertung; ohne Bewertung bleibt die Zelle leer. */
export function Stars({ value }: { value: number | null }) {
  if (value === null) return <span className="muted">–</span>;
  return (
    <span className="stars" role="img" aria-label={`${value} von 5 Sternen`}>
      {[1, 2, 3, 4, 5].map((star) => (
        <Star key={star} size={14} aria-hidden className={star <= value ? 'star-on' : 'star-off'} />
      ))}
    </span>
  );
}

interface ScaleInputProps {
  value: number | null;
  onChange: (value: number | null) => void;
  /** Beschriftung der Stufen 1 bis 5 für Screenreader und Tooltips */
  labels: readonly [string, string, string, string, string];
  variant: 'stars' | 'levels';
  groupLabel: string;
}

/** Auswahl auf einer Skala von 1 bis 5; ein Klick auf den gewählten Wert hebt die Auswahl auf. */
export function ScaleInput({ value, onChange, labels, variant, groupLabel }: ScaleInputProps) {
  return (
    <div className={`scale-input scale-${variant}`} role="group" aria-label={groupLabel}>
      {[1, 2, 3, 4, 5].map((step) => {
        const active = value !== null && (variant === 'stars' ? step <= value : step === value);
        return (
          <button
            key={step}
            type="button"
            className={`scale-step ${active ? 'scale-step-active' : ''}`}
            aria-pressed={value === step}
            aria-label={`${step} – ${labels[step - 1]}`}
            title={labels[step - 1]}
            onClick={() => onChange(value === step ? null : step)}
          >
            {variant === 'stars' ? <Star size={20} aria-hidden /> : step}
          </button>
        );
      })}
      <span className="scale-caption">{value === null ? 'keine Angabe' : labels[value - 1]}</span>
    </div>
  );
}

export const RATING_LABELS = ['geht so', 'ganz gut', 'gut', 'sehr gut', 'Lieblingssong'] as const;
export const ENERGY_LABELS = ['sehr ruhig', 'ruhig', 'mittel', 'energiegeladen', 'sehr energiegeladen'] as const;
export const SING_ALONG_LABELS = ['lieber zuhören', 'mitsummen', 'Refrain mitsingen', 'gern mitsingen', 'lauthals mitsingen'] as const;

/** Fortschrittsbalken für längere Vorgänge. */
export function ProgressBar({ value, max, label }: { value: number; max: number; label: string }) {
  const share = max > 0 ? Math.min(1, value / max) : 0;
  return (
    <span
      className="progress"
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
    >
      <span className="progress-fill" style={{ width: `${share * 100}%` }} />
    </span>
  );
}

/** Cover eines Songs. Gezeigt wird nur ein Bild von der gespeicherten Adresse, nichts wird kopiert. */
export function Artwork({ url, size = 40 }: { url: string | null; size?: number }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const style = { width: size, height: size };
  if (!url || failedUrl === url) {
    return (
      <span className="artwork artwork-empty" style={style} aria-hidden>
        <Music size={Math.round(size * 0.45)} />
      </span>
    );
  }
  return (
    <img
      className="artwork"
      style={style}
      src={url}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailedUrl(url)}
    />
  );
}
