import { Link, Navigate, Route, Routes } from 'react-router';
import { Layout } from './components/Layout.tsx';
import { EmptyState } from './components/ui.tsx';
import { CategoriesPage } from './pages/CategoriesPage.tsx';
import { GeneratorPage } from './pages/GeneratorPage.tsx';
import { PlaylistPage } from './pages/PlaylistPage.tsx';
import { PlaylistsPage } from './pages/PlaylistsPage.tsx';
import { SongsPage } from './pages/SongsPage.tsx';
import { StatsPage } from './pages/StatsPage.tsx';

function NotFoundPage() {
  return (
    <EmptyState title="Diese Seite gibt es nicht">
      <Link to="/songs">Zur Songliste</Link>
    </EmptyState>
  );
}

export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Navigate to="/songs" replace />} />
        <Route path="songs" element={<SongsPage />} />
        <Route path="kategorien" element={<CategoriesPage />} />
        <Route path="playlists" element={<PlaylistsPage />} />
        <Route path="playlists/neu" element={<GeneratorPage />} />
        <Route path="playlists/:id" element={<PlaylistPage />} />
        <Route path="auswertung" element={<StatsPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
