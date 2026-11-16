// Startet den Google-Nachbau als HTTP-Server, um die YouTube-Funktionen ohne Google-Konto
// auszuprobieren (siehe docker-compose.fake-google.yml):
//   npm run fake-google
// Zusätzliche Steuerung für Tests:
//   GET  /__fake/playlists          Inhalt aller Playlists
//   POST /__fake/fail?status=403&reason=quotaExceeded   nächster API-Aufruf schlägt fehl
//   POST /__fake/revoke-all         alle Zugänge ungültig machen (Verbindung „abgelaufen“)

import { createServer } from 'node:http';
import { FakeGoogle } from './fakeGoogle.ts';

const port = Number(process.env.PORT ?? 8093);
const fake = new FakeGoogle();

function control(method: string, url: URL): Response | null {
  if (method === 'GET' && url.pathname === '/__fake/playlists') {
    return Response.json(fake.playlists.map((playlist) => ({ ...playlist, videoIds: playlist.items.map((item) => item.videoId) })));
  }
  if (method === 'POST' && url.pathname === '/__fake/fail') {
    fake.failNext.push({ status: Number(url.searchParams.get('status') ?? 500), reason: url.searchParams.get('reason') ?? 'backendError' });
    return new Response(null, { status: 204 });
  }
  if (method === 'POST' && url.pathname === '/__fake/revoke-all') {
    fake.revokeAll();
    return new Response(null, { status: 204 });
  }
  return null;
}

createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    const headers = new Headers();
    for (const [name, value] of Object.entries(req.headers)) {
      if (typeof value === 'string') headers.set(name, value);
      else if (Array.isArray(value)) value.forEach((entry) => headers.append(name, entry));
    }
    const method = req.method ?? 'GET';
    const response =
      control(method, url) ??
      (await fake.handle(
        new Request(url, {
          method,
          headers,
          body: method === 'GET' || method === 'HEAD' || chunks.length === 0 ? null : Buffer.concat(chunks),
        }),
      ));
    console.log(`${method} ${url.pathname} → ${response.status}`);
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch (err) {
    console.error(err);
    res.writeHead(500);
    res.end();
  }
}).listen(port, () => {
  console.log(`Google-Nachbau läuft auf Port ${port}`);
});
