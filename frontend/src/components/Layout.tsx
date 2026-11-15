import { ChartColumn, Library, ListMusic, Music, Tags } from 'lucide-react';
import { NavLink, Outlet } from 'react-router';

const NAVIGATION = [
  { to: '/songs', label: 'Songs', icon: Library },
  { to: '/kategorien', label: 'Kategorien', icon: Tags },
  { to: '/playlists', label: 'Playlists', icon: ListMusic },
  { to: '/auswertung', label: 'Auswertung', icon: ChartColumn },
] as const;

export function Layout() {
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
