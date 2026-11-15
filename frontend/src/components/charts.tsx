// Diagramm-Bausteine der Auswertung, bewusst ohne Diagramm-Bibliothek: Balkenliste,
// Säulen, Fortschrittsbalken und Kennzahl-Kachel. Jedes Diagramm zeigt seine Werte
// direkt an, reagiert auf Zeigen und Tastaturfokus mit einem Tooltip und lässt sich
// auf eine Tabellenansicht umschalten.

import { useId, useRef, useState, type FocusEvent, type PointerEvent, type ReactNode } from 'react';
import { ChartColumn, Table2 } from 'lucide-react';
import { colorProps } from './ui.tsx';

/* ------------------------------------------------------------------ Tooltip */

interface TooltipContent {
  title: string;
  /** Wert zuerst und hervorgehoben, die Beschriftung dahinter */
  lines: Array<{ value: string; label: string }>;
}

interface TooltipState extends TooltipContent {
  x: number;
  y: number;
}

/** Halbe Breite, die der Tooltip neben dem Zeiger braucht, damit er nicht aus der Karte ragt. */
const TOOLTIP_MARGIN = 96;

function useTooltip() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  function place(x: number, y: number, content: TooltipContent) {
    const width = containerRef.current?.clientWidth ?? 0;
    const clampedX = width > TOOLTIP_MARGIN * 2 ? Math.min(Math.max(x, TOOLTIP_MARGIN), width - TOOLTIP_MARGIN) : width / 2;
    setTooltip({ ...content, x: clampedX, y });
  }

  /** Liefert die Ereignis-Handler für eine Marke; Zeigen und Tastaturfokus zeigen dasselbe. */
  function handlers(content: TooltipContent) {
    return {
      onPointerMove: (event: PointerEvent<HTMLElement>) => {
        const box = containerRef.current?.getBoundingClientRect();
        if (box) place(event.clientX - box.left, event.clientY - box.top, content);
      },
      onPointerLeave: () => setTooltip(null),
      onFocus: (event: FocusEvent<HTMLElement>) => {
        const box = containerRef.current?.getBoundingClientRect();
        const mark = event.currentTarget.getBoundingClientRect();
        if (box) place(mark.left + mark.width / 2 - box.left, mark.top - box.top, content);
      },
      onBlur: () => setTooltip(null),
    };
  }

  const element = tooltip && (
    <div className="chart-tooltip" style={{ left: tooltip.x, top: tooltip.y }} role="presentation">
      <div className="chart-tooltip-title">{tooltip.title}</div>
      {tooltip.lines.map((line) => (
        <div key={line.label} className="chart-tooltip-line">
          <strong>{line.value}</strong> {line.label}
        </div>
      ))}
    </div>
  );

  return { containerRef, handlers, element };
}

function describe(content: TooltipContent): string {
  return `${content.title}: ${content.lines.map((line) => `${line.value} ${line.label}`).join(', ')}`;
}

/* ------------------------------------------------------------ Diagrammkarte */

export interface TableView {
  columns: string[];
  rows: Array<Array<string | number>>;
}

interface ChartCardProps {
  title: string;
  /** Sagt, was aufgetragen ist – ersetzt bei einer einzelnen Datenreihe die Legende. */
  subtitle?: string;
  /** Dieselben Daten als Tabelle */
  table?: TableView;
  children: ReactNode;
  className?: string;
}

export function ChartCard({ title, subtitle, table, children, className }: ChartCardProps) {
  const [showTable, setShowTable] = useState(false);
  const titleId = useId();

  return (
    <figure className={`card chart-card ${className ?? ''}`} aria-labelledby={titleId}>
      <figcaption className="chart-head">
        <div>
          <h2 id={titleId}>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        {table && (
          <button
            type="button"
            className="icon-button"
            aria-pressed={showTable}
            aria-label={showTable ? `${title}: als Diagramm zeigen` : `${title}: als Tabelle zeigen`}
            title={showTable ? 'Als Diagramm zeigen' : 'Als Tabelle zeigen'}
            onClick={() => setShowTable((current) => !current)}
          >
            {showTable ? <ChartColumn size={16} aria-hidden /> : <Table2 size={16} aria-hidden />}
          </button>
        )}
      </figcaption>
      {table && showTable ? (
        <div className="chart-table-wrap">
          <table className="table table-compact">
            <thead>
              <tr>
                {table.columns.map((column, index) => (
                  <th key={column} className={index === 0 ? '' : 'cell-number'}>
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {row.map((cell, index) => (
                    <td key={index} className={index === 0 ? '' : 'cell-number'}>
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        children
      )}
    </figure>
  );
}

/* -------------------------------------------------------------- Balkenliste */

export interface BarRow {
  key: string | number;
  label: string;
  value: number;
  /** Text am Balkenende, z. B. „12“ */
  valueLabel: string;
  tooltip: TooltipContent['lines'];
  /** Farbpunkt vor der Beschriftung (Farbe der Kategorie) */
  swatch?: string;
  /** Sammelposten wie „Ohne Angabe“ oder „Weitere“ in zurückhaltendem Grau */
  muted?: boolean;
}

/** Waagerechte Balken, größter Wert zuerst – zum Vergleichen und Einordnen. */
export function BarList({ rows }: { rows: BarRow[] }) {
  const { containerRef, handlers, element } = useTooltip();
  const max = Math.max(1, ...rows.map((row) => row.value));

  return (
    <div className="chart-body" ref={containerRef}>
      <ul className="barlist">
        {rows.map((row) => {
          const content = { title: row.label, lines: row.tooltip };
          return (
            <li key={row.key} className="barlist-row" tabIndex={0} aria-label={describe(content)} {...handlers(content)}>
              <span className="barlist-label">
                {row.swatch && <span className="chip-dot" {...colorProps(row.swatch)} aria-hidden />}
                <span className="barlist-name">{row.label}</span>
              </span>
              <span className="barlist-track" aria-hidden>
                {/* Auch der kleinste Wert über null bleibt als schmaler Balken sichtbar. */}
                <span
                  className={`barlist-bar ${row.muted ? 'mark-muted' : ''}`}
                  style={{ width: `${(row.value / max) * 100}%`, minWidth: row.value > 0 ? 2 : 0 }}
                />
              </span>
              <span className="barlist-value" aria-hidden>
                {row.valueLabel}
              </span>
            </li>
          );
        })}
      </ul>
      {element}
    </div>
  );
}

/* ------------------------------------------------------------------- Säulen */

export interface Column {
  key: string | number;
  /** Beschriftung unter der Säule */
  label: string;
  value: number;
  tooltipTitle: string;
  tooltip: TooltipContent['lines'];
  muted?: boolean;
}

/** Säulen für Verteilungen über eine geordnete Achse (Jahrzehnte, Minuten, Sterne). */
export function ColumnChart({ columns }: { columns: Column[] }) {
  const { containerRef, handlers, element } = useTooltip();
  const max = Math.max(1, ...columns.map((column) => column.value));

  return (
    <div className="chart-body" ref={containerRef}>
      <ul className="columns">
        {columns.map((column) => {
          const content = { title: column.tooltipTitle, lines: column.tooltip };
          return (
            <li key={column.key} className="column" tabIndex={0} aria-label={describe(content)} {...handlers(content)}>
              <span className="column-plot" aria-hidden>
                <span className="column-value">{column.value.toLocaleString('de-DE')}</span>
                {/* Über der höchsten Säule bleibt Platz für ihre Zahl (22px). */}
                <span
                  className={`column-bar ${column.muted ? 'mark-muted' : ''}`}
                  style={{ height: `calc((100% - 22px) * ${column.value / max})`, minHeight: column.value > 0 ? 2 : 0 }}
                />
              </span>
              <span className="column-label" aria-hidden>
                {column.label}
              </span>
            </li>
          );
        })}
      </ul>
      {element}
    </div>
  );
}

/* --------------------------------------------------------- Fortschrittsliste */

export interface MeterRow {
  key: string;
  label: string;
  value: number;
  total: number;
  /** Optionaler Verweis rechts neben der Zahl, z. B. zur gefilterten Songliste */
  action?: ReactNode;
}

/** Je Zeile ein Anteil an einem Ganzen: Name, Balken auf hellerer Spur, Zahl. */
export function MeterList({ rows }: { rows: MeterRow[] }) {
  return (
    <ul className="meterlist">
      {rows.map((row) => {
        const share = row.total === 0 ? 0 : row.value / row.total;
        return (
          <li key={row.key} className="meter-row">
            <span className="meter-label">{row.label}</span>
            <span
              className="meter-track"
              role="meter"
              aria-label={row.label}
              aria-valuemin={0}
              aria-valuemax={row.total}
              aria-valuenow={row.value}
              aria-valuetext={`${row.value} von ${row.total}`}
            >
              <span className="meter-fill" style={{ width: `${share * 100}%` }} />
            </span>
            <span className="meter-figure">
              {row.value.toLocaleString('de-DE')} von {row.total.toLocaleString('de-DE')}
              <span className="meter-share"> · {Math.round(share * 100)} %</span>
            </span>
            {row.action && <span className="meter-action">{row.action}</span>}
          </li>
        );
      })}
    </ul>
  );
}

/* ----------------------------------------------------------- Kennzahl-Kachel */

export function StatTile({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="card stat-tile">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {note && <div className="stat-note">{note}</div>}
    </div>
  );
}
