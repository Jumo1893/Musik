// Datenabruf und Änderungen über TanStack Query. Nach jeder Änderung werden alle
// Abfragen neu geladen: Die Datenmengen sind klein, und so stimmen abgeleitete Werte
// (Songs je Kategorie, Dauer einer Playlist, Auswertung) garantiert überall.

import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { api } from './api.ts';
import { GenreIndex } from './lib/genres.ts';
import type { Category, CategoryInput, Playlist, PlaylistInput, Song, SongInput } from './types.ts';

export const queryKeys = {
  songs: ['songs'],
  genres: ['genres'],
  categories: ['categories'],
  playlists: ['playlists'],
  stats: ['stats'],
  config: ['config'],
} as const;

/**
 * Lädt nach einer Änderung alles neu – außer den Einstellungen, die sich zur Laufzeit
 * nicht ändern, und den Daten von YouTube (jeder Abruf kostet dort Kontingent).
 */
export function refreshData(queryClient: QueryClient): Promise<void> {
  return queryClient.invalidateQueries({
    predicate: ({ queryKey: [first, second] }) =>
      first !== queryKeys.config[0] && (first !== 'youtube' || second === 'status'),
  });
}

export function useYoutubeStatus() {
  return useQuery({ queryKey: ['youtube', 'status'], queryFn: api.youtube.status, staleTime: 10_000 });
}

/** Eigene Playlists bei YouTube; nur abrufen, wenn die App verbunden ist. */
export function useYoutubePlaylists(enabled: boolean) {
  return useQuery({
    queryKey: ['youtube', 'playlists'],
    queryFn: api.youtube.playlists,
    enabled,
    staleTime: 5 * 60_000,
    retry: false,
  });
}

export function useYoutubePreview(id: string) {
  return useQuery({
    queryKey: ['youtube', 'preview', id],
    queryFn: () => api.youtube.preview(id),
    staleTime: 5 * 60_000,
    retry: false,
  });
}

export function useConfig() {
  return useQuery({ queryKey: queryKeys.config, queryFn: api.config, staleTime: Infinity });
}

/** Genre-Liste mit Haupt- und Untergenres; ändert sich nur, wenn eigene Genres dazukommen. */
export function useGenres() {
  return useQuery({ queryKey: queryKeys.genres, queryFn: api.genres, staleTime: 5 * 60_000 });
}

/** Die Genre-Liste zum Nachschlagen; solange sie lädt, ist sie leer. */
export function useGenreIndex(): GenreIndex {
  const genres = useGenres();
  return useMemo(() => new GenreIndex(genres.data ?? []), [genres.data]);
}

export function useSongs() {
  return useQuery({ queryKey: queryKeys.songs, queryFn: api.songs.list });
}

export function useCategories() {
  return useQuery({ queryKey: queryKeys.categories, queryFn: api.categories.list });
}

export function usePlaylists() {
  return useQuery({ queryKey: queryKeys.playlists, queryFn: api.playlists.list });
}

export function useStats() {
  return useQuery({ queryKey: queryKeys.stats, queryFn: api.stats });
}

/** Nachschlagetabelle ID → Eintrag, stabil solange sich die Liste nicht ändert. */
export function useById<T extends { id: number }>(items: T[] | undefined): Map<number, T> {
  return useMemo(() => new Map((items ?? []).map((item) => [item.id, item])), [items]);
}

function useChange<TInput, TResult>(mutationFn: (input: TInput) => Promise<TResult>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    // Das Promise zurückgeben: Die Änderung gilt erst als fertig, wenn die neuen Daten da sind.
    onSuccess: () => refreshData(queryClient),
  });
}

export function useSaveSong() {
  return useChange<{ id: number | null; input: SongInput }, Song>(({ id, input }) =>
    id === null ? api.songs.create(input) : api.songs.update(id, input),
  );
}

export function useDeleteSong() {
  return useChange<number, void>(api.songs.remove);
}

export function useSaveCategory() {
  return useChange<{ id: number | null; input: CategoryInput }, Category>(({ id, input }) =>
    id === null ? api.categories.create(input) : api.categories.update(id, input),
  );
}

export function useDeleteCategory() {
  return useChange<number, void>(api.categories.remove);
}

export function useCreatePlaylist() {
  return useChange<PlaylistInput, Playlist>(api.playlists.create);
}

/**
 * `onDeleted` läuft direkt nach dem Löschen, noch bevor die Listen neu geladen sind.
 * Die Playlist-Seite wechselt darin zur Übersicht – sonst stünde sie kurz darauf vor
 * einer Playlist, die es nicht mehr gibt.
 */
export function useDeletePlaylist(onDeleted?: () => void) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.playlists.remove,
    onSuccess: () => {
      onDeleted?.();
      return refreshData(queryClient);
    },
  });
}

/**
 * Ändert eine Playlist und zeigt das Ergebnis sofort an (ohne auf den Server zu warten),
 * damit Umsortieren flüssig bleibt. Schlägt das Speichern fehl, wird neu geladen.
 */
export function useUpdatePlaylist() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: number; input: PlaylistInput }) => api.playlists.update(id, input),
    onMutate: async ({ id, input }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.playlists });
      queryClient.setQueryData<Playlist[]>(queryKeys.playlists, (playlists) =>
        playlists?.map((playlist) =>
          playlist.id === id
            ? { ...playlist, name: input.name, description: input.description, songIds: input.songIds }
            : playlist,
        ),
      );
    },
    onSettled: () => refreshData(queryClient),
  });
}
