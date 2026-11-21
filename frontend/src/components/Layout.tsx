import { Bookmark, ChartColumn, Library, ListMusic, Music, Tags, TvMinimalPlay } from 'lucide-react';
import { NavLink, Outlet } from 'react-router';
import { useMerkliste } from '../queries.ts';

const NAVIGATION = [
  { to: '/songs', label: 'Songs', icon: Library },
  { to: '/merkliste', label: 'Merkliste', icon: Bookmark },
  { to: '/kategorien', label: 'Kategorien', icon: Tags },
  { to: '/playlists', label: 'Playlists', icon: ListMusic },
  { to: '/auswertung', label: 'Auswertung', icon: ChartColumn },
  { to: '/youtube', label: 'YouTube', icon: TvMinimalPlay },
] as const;

export function Layout() {
  // Offene Einträge der Merkliste stehen als Zahl in der Navigation.
  const openNotes = useMerkliste().data?.length ?? 0;
  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark" aria-hidden>
            <Music size={18} />
          </span>
          <span className="brand-name">Musik</span>
        </div>
        <nav className="nav" aria-label="Hauptnavigation">
          {NAVIGATION.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} className={({ isActive }) => `nav-link ${isActive ? 'nav-link-active' : ''}`}>
              <Icon size={18} aria-hidden />
              {label}
              {to === '/merkliste' && openNotes > 0 && (
                <span className="nav-count" aria-label={`${openNotes} offen`}>
                  {openNotes}
                </span>
              )}
            </NavLink>
          ))}
        </nav>
        <p className="sidebar-note">Gespeichert werden nur Angaben und Links zu deinen Songs – keine Audiodateien.</p>
      </aside>
      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
