import { ChartColumn } from 'lucide-react';
import { Link } from 'react-router';
import {
  BarList,
  ChartCard,
  ColumnChart,
  MeterList,
  StatTile,
  type BarRow,
  type Column,
  type TableView,
} from '../components/charts.tsx';
import { CategoryChip, EmptyState, ENERGY_LABELS, ErrorNote, LoadingNote, PageHeader } from '../components/ui.tsx';
import { DASH, formatDecimal, formatDuration, formatSongCount, formatTotalDuration } from '../lib/format.ts';
import { useStats } from '../queries.ts';
import type { Stats } from '../types.ts';

const TOP_ARTISTS = 10;
const TOP_GENRES = 8;
const MAX_DECADE_COLUMNS = 10;

const number = (value: number) => value.toLocaleString('de-DE');
const songsLabel = (count: number) => (count === 1 ? 'Song' : 'Songs');
const percent = (part: number, whole: number) => (whole === 0 ? '0 %' : `${Math.round((part / whole) * 100)} %`);
const decimalOrDash = (value: number | null) => (value === null ? DASH : formatDecimal(value));

/** Tooltip-Zeilen für eine Anzahl Songs samt Anteil an der Bibliothek. */
function countLines(count: number, total: number) {
  return [
    { value: number(count), label: songsLabel(count) },
    { value: percent(count, total), label: 'der Bibliothek' },
  ];
}

function categoryChart(stats: Stats): { rows: BarRow[]; table: TableView } {
  const total = stats.totals.songCount;
  const rows: BarRow[] = stats.byCategory.map((category) => ({
    key: category.id,
    label: category.name,
    swatch: category.color,
    value: category.songCount,
    valueLabel: number(category.songCount),
    tooltip: [...countLines(category.songCount, total), { value: formatTotalDuration(category.totalDurationSeconds), label: 'Gesamtdauer' }],
  }));
  if (stats.totals.withoutCategory > 0) {
    rows.push({
      key: 'none',
      label: 'Ohne Kategorie',
      muted: true,
      value: stats.totals.withoutCategory,
      valueLabel: number(stats.totals.withoutCategory),
      tooltip: countLines(stats.totals.withoutCategory, total),
    });
  }
  return {
    rows,
    table: {
      columns: ['Kategorie', 'Songs', 'Gesamtdauer', 'Ø Bewertung', 'Ø Energie', 'Ø BPM'],
      rows: [
        ...stats.byCategory.map((category) => [
          category.name,
          number(category.songCount),
          formatTotalDuration(category.totalDurationSeconds),
          decimalOrDash(category.averageRating),
          decimalOrDash(category.averageEnergy),
          category.averageBpm === null ? DASH : number(category.averageBpm),
        ]),
        ...(stats.totals.withoutCategory > 0
          ? [['Ohne Kategorie', number(stats.totals.withoutCategory), DASH, DASH, DASH, DASH]]
          : []),
      ],
    },
  };
}

function artistChart(stats: Stats): { rows: BarRow[]; table: TableView } {
  const total = stats.totals.songCount;
  const top = stats.topArtists.slice(0, TOP_ARTISTS);
  return {
    rows: top.map((artist) => ({
      key: artist.artist,
      label: artist.artist,
      value: artist.songCount,
      valueLabel: number(artist.songCount),
      tooltip: [...countLines(artist.songCount, total), { value: formatTotalDuration(artist.totalDurationSeconds), label: 'Gesamtdauer' }],
    })),
    table: {
      columns: ['Interpret', 'Songs', 'Gesamtdauer'],
      rows: top.map((artist) => [artist.artist, number(artist.songCount), formatTotalDuration(artist.totalDurationSeconds)]),
    },
  };
}

type GenreCount = Stats['byMainGenre'][number];

/**
 * Balken je Genre; was über die ersten Einträge hinausgeht, fasst „Weitere“ zusammen.
 * noneLabel beschriftet die Songs ohne Angabe.
 */
function genreChart(
  counts: readonly GenreCount[],
  total: number,
  options: { limit: number; columnLabel: string; noneLabel: string },
): { rows: BarRow[]; table: TableView } {
  const named = counts.filter((genre) => genre.genre !== null);
  const unnamed = counts.find((genre) => genre.genre === null)?.songCount ?? 0;
  const top = named.slice(0, options.limit);
  const rest = named.slice(options.limit);
  const restCount = rest.reduce((sum, genre) => sum + genre.songCount, 0);

  const rows: BarRow[] = top.map((genre) => ({
    key: genre.genre!,
    label: genre.genre!,
    value: genre.songCount,
    valueLabel: number(genre.songCount),
    tooltip: countLines(genre.songCount, total),
  }));
  // Sammelposten stehen in Grau am Ende, damit sie nicht wie ein eigenes Genre wirken.
  if (restCount > 0) {
    rows.push({
      key: 'rest',
      label: `Weitere (${rest.length} ${rest.length === 1 ? 'Genre' : 'Genres'})`,
      muted: true,
      value: restCount,
      valueLabel: number(restCount),
      tooltip: countLines(restCount, total),
    });
  }
  if (unnamed > 0) {
    rows.push({
      key: 'none',
      label: options.noneLabel,
      muted: true,
      value: unnamed,
      valueLabel: number(unnamed),
      tooltip: countLines(unnamed, total),
    });
  }
  return {
    rows,
    table: {
      columns: [options.columnLabel, 'Songs', 'Anteil'],
      rows: counts.map((genre) => [genre.genre ?? options.noneLabel, number(genre.songCount), percent(genre.songCount, total)]),
    },
  };
}

function tableFromColumns(header: string, columns: Column[], total: number): TableView {
  return {
    columns: [header, 'Songs', 'Anteil'],
    rows: columns.map((column) => [column.tooltipTitle, number(column.value), percent(column.value, total)]),
  };
}

function decadeColumns(stats: Stats): Column[] {
  if (stats.byDecade.length === 0) return [];
  const counts = new Map(stats.byDecade.map((entry) => [entry.decade, entry.songCount]));
  const first = stats.byDecade[0]!.decade;
  const last = stats.byDecade[stats.byDecade.length - 1]!.decade;
  const total = stats.totals.songCount;
  const columns: Column[] = [];

  // Reicht die Bibliothek sehr weit zurück (etwa durch ein Klavierstück von 1810), würde
  // die Achse aus lauter leeren Jahrzehnten bestehen. Dann fasst eine graue Säule
  // „früher“ alles Ältere zusammen.
  const span = (last - first) / 10 + 1;
  const firstShown = span > MAX_DECADE_COLUMNS ? last - (MAX_DECADE_COLUMNS - 2) * 10 : first;
  if (firstShown > first) {
    const older = stats.byDecade
      .filter((entry) => entry.decade < firstShown)
      .reduce((sum, entry) => sum + entry.songCount, 0);
    columns.push({
      key: 'older',
      label: 'früher',
      muted: true,
      value: older,
      tooltipTitle: `Vor ${firstShown}`,
      tooltip: countLines(older, total),
    });
  }

  // Jahrzehnte ohne Songs bleiben als Lücke sichtbar, damit die Zeitachse stimmt.
  for (let decade = firstShown; decade <= last; decade += 10) {
    const count = counts.get(decade) ?? 0;
    columns.push({
      key: decade,
      label: `${decade}er`,
      value: count,
      tooltipTitle: `${decade}–${decade + 9}`,
      tooltip: countLines(count, total),
    });
  }
  return columns;
}

function durationColumns(stats: Stats): Column[] {
  if (stats.byDurationMinute.length === 0) return [];
  const counts = new Map(stats.byDurationMinute.map((entry) => [entry.minute, entry.songCount]));
  const total = stats.totals.songCount;
  const columns: Column[] = [];
  for (let minute = counts.has(0) ? 0 : 1; minute <= 7; minute++) {
    const count = counts.get(minute) ?? 0;
    columns.push({
      key: minute,
      label: minute === 7 ? '7+' : minute === 0 ? '<1' : `${minute}–${minute + 1}`,
      value: count,
      tooltipTitle: minute === 7 ? '7 Minuten und länger' : minute === 0 ? 'Unter 1 Minute' : `${minute} bis unter ${minute + 1} Minuten`,
      tooltip: countLines(count, total),
    });
  }
  return columns;
}

/** Säulen für eine Skala von 1 bis 5 plus (in Grau) die Songs ohne Angabe. */
function scaleColumns(entries: Array<{ step: number | null; songCount: number }>, total: number, titleOf: (step: number) => string): Column[] {
  const counts = new Map(entries.map((entry) => [entry.step, entry.songCount]));
  const columns: Column[] = [1, 2, 3, 4, 5].map((step) => ({
    key: step,
    label: String(step),
    value: counts.get(step) ?? 0,
    tooltipTitle: titleOf(step),
    tooltip: countLines(counts.get(step) ?? 0, total),
  }));
  const missing = counts.get(null) ?? 0;
  if (missing > 0) {
    columns.push({
      key: 'none',
      label: 'ohne',
      muted: true,
      value: missing,
      tooltipTitle: 'Ohne Angabe',
      tooltip: countLines(missing, total),
    });
  }
  return columns;
}

export function StatsPage() {
  const stats = useStats();

  if (stats.isPending) return <LoadingNote label="Werte Bibliothek aus …" />;
  if (stats.isError) return <ErrorNote error={stats.error} onRetry={() => void stats.refetch()} />;

  const data = stats.data;
  const { totals } = data;
  const total = totals.songCount;

  if (total === 0) {
    return (
      <>
        <PageHeader title="Auswertung" />
        <EmptyState icon={<ChartColumn size={28} aria-hidden />} title="Noch nichts auszuwerten">
          <p>Sobald du Songs angelegt hast, siehst du hier, wie sich deine Bibliothek zusammensetzt.</p>
          <Link className="button button-primary" to="/songs">
            Zu den Songs
          </Link>
        </EmptyState>
      </>
    );
  }

  const categories = categoryChart(data);
  const artists = artistChart(data);
  const mainGenres = genreChart(data.byMainGenre, data.totals.songCount, {
    // Es gibt nur wenige Hauptgenres; alle bekommen einen eigenen Balken.
    limit: 20,
    columnLabel: 'Hauptgenre',
    noneLabel: 'Ohne Genre',
  });
  const subgenres = genreChart(data.bySubgenre, data.totals.songCount, {
    limit: TOP_GENRES,
    columnLabel: 'Untergenre',
    noneLabel: 'Ohne Untergenre',
  });
  const decades = decadeColumns(data);
  const durations = durationColumns(data);
  const ratings = scaleColumns(
    data.byRating.map((entry) => ({ step: entry.rating, songCount: entry.songCount })),
    total,
    (step) => `${step} ${step === 1 ? 'Stern' : 'Sterne'}`,
  );
  const energies = scaleColumns(
    data.byEnergy.map((entry) => ({ step: entry.energy, songCount: entry.songCount })),
    total,
    (step) => `Energie ${step} – ${ENERGY_LABELS[step - 1]}`,
  );
  const categoriesById = new Map(data.byCategory.map((category) => [category.id, category]));
  const pairs = data.categoryPairs
    .map((pair) => ({ ...pair, first: categoriesById.get(pair.firstId), second: categoriesById.get(pair.secondId) }))
    .filter((pair) => pair.first && pair.second);
  const rated = total - totals.withoutRating;

  return (
    <>
      <PageHeader title="Auswertung" subtitle="Wie sich deine Bibliothek zusammensetzt – und wo noch Angaben fehlen." />

      <div className="stat-grid">
        <StatTile label="Songs" value={number(total)} />
        <StatTile label="Interpreten" value={number(totals.artistCount)} />
        <StatTile
          label="Gesamtdauer"
          value={formatTotalDuration(totals.totalDurationSeconds)}
          {...(totals.withoutDuration > 0 ? { note: `${formatSongCount(totals.withoutDuration)} ohne Dauer nicht mitgezählt` } : {})}
        />
        <StatTile label="Ø Länge" value={formatDuration(totals.averageDurationSeconds)} />
        <StatTile
          label="Ø Bewertung"
          value={totals.averageRating === null ? DASH : `${formatDecimal(totals.averageRating)} von 5`}
          note={`${rated} von ${formatSongCount(total)} bewertet`}
        />
        <StatTile label="Playlists" value={number(totals.playlistCount)} />
      </div>

      <div className="chart-grid">
        <ChartCard
          title="Kategorien"
          subtitle="Anzahl Songs je Kategorie. Ein Song kann mehrere Kategorien haben."
          table={categories.table}
        >
          <BarList rows={categories.rows} />
        </ChartCard>

        <ChartCard
          title="Häufigste Interpreten"
          subtitle={
            data.topArtists.length > TOP_ARTISTS
              ? `Anzahl Songs je Interpret, die ${TOP_ARTISTS} häufigsten.`
              : 'Anzahl Songs je Interpret.'
          }
          table={artists.table}
        >
          <BarList rows={artists.rows} />
        </ChartCard>

        <ChartCard
          title="Hauptgenres"
          subtitle="Anzahl Songs je Hauptgenre; ein Song zählt bei jedem seiner Hauptgenres mit (Pop Rock bei Pop und Rock)."
          table={mainGenres.table}
        >
          <BarList rows={mainGenres.rows} />
        </ChartCard>

        <ChartCard
          title="Untergenres"
          subtitle="Anzahl Songs je Untergenre, auch eigene Genres; ein Song mit mehreren zählt bei jedem mit."
          table={subgenres.table}
        >
          <BarList rows={subgenres.rows} />
        </ChartCard>

        <ChartCard
          title="Jahrzehnte"
          subtitle="Anzahl Songs nach Erscheinungsjahr."
          {...(decades.length > 0 ? { table: tableFromColumns('Jahrzehnt', decades, total) } : {})}
        >
          {decades.length > 0 ? <ColumnChart columns={decades} /> : <p className="chart-empty">Noch kein Song mit Erscheinungsjahr.</p>}
        </ChartCard>

        <ChartCard
          title="Songlänge"
          subtitle="Anzahl Songs nach Dauer in Minuten."
          {...(durations.length > 0 ? { table: tableFromColumns('Dauer', durations, total) } : {})}
        >
          {durations.length > 0 ? <ColumnChart columns={durations} /> : <p className="chart-empty">Noch kein Song mit Dauer.</p>}
        </ChartCard>

        <ChartCard
          title="Bewertung"
          subtitle="Anzahl Songs je Bewertung von 1 bis 5 Sternen."
          table={tableFromColumns('Bewertung', ratings, total)}
        >
          <ColumnChart columns={ratings} />
        </ChartCard>

        <ChartCard
          title="Energie"
          subtitle="Anzahl Songs je Stufe von 1 (sehr ruhig) bis 5 (sehr energiegeladen)."
          table={tableFromColumns('Energie', energies, total)}
        >
          <ColumnChart columns={energies} />
        </ChartCard>

        <ChartCard title="Häufige Kombinationen" subtitle="Kategorien, die oft gemeinsam an einem Song hängen.">
          {pairs.length === 0 ? (
            <p className="chart-empty">Noch kein Song mit zwei Kategorien.</p>
          ) : (
            <ul className="pair-list">
              {pairs.map((pair) => (
                <li key={`${pair.firstId}-${pair.secondId}`}>
                  <span className="chip-list">
                    <CategoryChip category={pair.first!} />
                    <CategoryChip category={pair.second!} />
                  </span>
                  <span className="pair-count">
                    {number(pair.songCount)} {songsLabel(pair.songCount)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </ChartCard>

        <ChartCard
          className="chart-card-wide"
          title="Vollständigkeit der Angaben"
          subtitle="Je vollständiger die Angaben, desto treffsicherer stellt der Generator Playlists zusammen."
        >
          <MeterList
            rows={[
              {
                key: 'category',
                label: 'Mit Kategorie',
                value: total - totals.withoutCategory,
                total,
                ...(totals.withoutCategory > 0
                  ? { action: <Link to="/songs?ohne=kategorie">{formatSongCount(totals.withoutCategory)} ohne ansehen</Link> }
                  : {}),
              },
              { key: 'rating', label: 'Mit Bewertung', value: rated, total },
              { key: 'energy', label: 'Mit Energie-Angabe', value: total - totals.withoutEnergy, total },
              { key: 'duration', label: 'Mit Dauer', value: total - totals.withoutDuration, total },
              { key: 'links', label: 'Mit Streaming-Link', value: total - totals.withoutLinks, total },
            ]}
          />
        </ChartCard>
      </div>
    </>
  );
}
