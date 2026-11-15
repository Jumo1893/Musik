import { ExternalLink, Search } from 'lucide-react';
import { streamingLinks } from '../lib/links.ts';
import { useConfig } from '../queries.ts';
import type { Song } from '../types.ts';

interface StreamingLinksProps {
  song: Pick<Song, 'title' | 'artist' | 'appleMusicUrl' | 'youtubeUrl' | 'youtubeMusicUrl'>;
  /** compact: kurze Namen für Tabellen */
  compact?: boolean;
}

/**
 * Links zu Apple Music, YouTube und YouTube Music. Ein gespeicherter Link öffnet den
 * Song direkt; ohne gespeicherten Link führt der Knopf zur Suche auf der Plattform.
 */
export function StreamingLinks({ song, compact = false }: StreamingLinksProps) {
  const storefront = useConfig().data?.appleMusicStorefront;
  return (
    <span className="stream-links">
      {streamingLinks(song, storefront).map((link) => {
        const hint = link.direct ? `Auf ${link.name} öffnen` : `Auf ${link.name} suchen (kein Link gespeichert)`;
        return (
          <a
            key={link.platform}
            className={`stream-link ${link.direct ? 'stream-link-direct' : 'stream-link-search'}`}
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            title={hint}
            aria-label={`${hint}: ${song.title}`}
            onClick={(event) => event.stopPropagation()}
          >
            {link.direct ? <ExternalLink size={12} aria-hidden /> : <Search size={12} aria-hidden />}
            {compact ? link.shortName : link.name}
          </a>
        );
      })}
    </span>
  );
}
