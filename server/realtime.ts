import type { IncomingMessage } from 'http';
import type { Duplex } from 'stream';
import { WebSocketServer, WebSocket } from 'ws';
import { getDb } from './db.ts';
import { parseCookies, SESSION_COOKIE_NAME, hashSessionTokenExternal } from './auth.ts';

interface SocketMeta {
  room: string;
}

const rooms = new Map<string, Set<WebSocket>>();
const socketMeta = new WeakMap<WebSocket, SocketMeta>();

let wssInstance: WebSocketServer | null = null;

function joinRoom(ws: WebSocket, room: string): void {
  let set = rooms.get(room);
  if (!set) {
    set = new Set();
    rooms.set(room, set);
  }
  set.add(ws);
  socketMeta.set(ws, { room });
}

function leaveRoom(ws: WebSocket): void {
  const meta = socketMeta.get(ws);
  if (!meta) return;
  const set = rooms.get(meta.room);
  if (set) {
    set.delete(ws);
    if (set.size === 0) rooms.delete(meta.room);
  }
}

function authorizeStoreWsConnection(req: IncomingMessage, storeId: string): boolean {
  const cookies = parseCookies(req.headers.cookie);
  const token = cookies[SESSION_COOKIE_NAME];
  if (!token || !storeId) return false;

  const db = getDb();
  const tokenHash = hashSessionTokenExternal(token);
  const sessionRow = db
    .prepare(
      `SELECT u.id as user_id, s.expires_at
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ?`
    )
    .get(tokenHash) as { user_id: string; expires_at: string } | undefined;

  if (!sessionRow) return false;
  if (Date.parse(sessionRow.expires_at) < Date.now()) return false;

  const membership = db
    .prepare('SELECT role FROM user_store_memberships WHERE user_id = ? AND store_id = ?')
    .get(sessionRow.user_id, storeId) as { role: string } | undefined;

  return Boolean(membership);
}

export function attachWebSocketServer(server: {
  on: (event: string, cb: (...args: any[]) => void) => void;
}): void {
  if (wssInstance) return;
  const wss = new WebSocketServer({ noServer: true });
  wssInstance = wss;

  wss.on('connection', (ws: WebSocket, _req: IncomingMessage, room: string) => {
    joinRoom(ws, room);
    ws.send(JSON.stringify({ type: 'connected', room, ts: new Date().toISOString() }));

    ws.on('close', () => leaveRoom(ws));
    ws.on('error', () => leaveRoom(ws));
  });

  server.on('upgrade', (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    try {
      const url = new URL(req.url || '/', 'http://localhost');
      if (url.pathname !== '/ws') {
        // Leave Vite HMR or other upgrade paths untouched if not /ws
        return;
      }

      const storeId = url.searchParams.get('storeId')?.trim() || '';
      const slug = url.searchParams.get('slug')?.trim() || '';

      if (storeId) {
        if (!authorizeStoreWsConnection(req, storeId)) {
          socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
          socket.destroy();
          return;
        }
        wss.handleUpgrade(req, socket, head, (ws) => {
          wss.emit('connection', ws, req, `store:${storeId}`);
        });
        return;
      }

      if (slug) {
        const db = getDb();
        const store = db.prepare('SELECT id FROM stores WHERE slug = ?').get(slug) as { id: string } | undefined;
        if (!store) {
          socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
          socket.destroy();
          return;
        }
        wss.handleUpgrade(req, socket, head, (ws) => {
          wss.emit('connection', ws, req, `public:${slug}`);
        });
        return;
      }

      socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
      socket.destroy();
    } catch {
      socket.destroy();
    }
  });
}

function sendToRoom(room: string, type: string, payload: unknown): void {
  const set = rooms.get(room);
  if (!set || set.size === 0) return;
  const msg = JSON.stringify({ type, payload, ts: new Date().toISOString() });
  for (const ws of set) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(msg);
    }
  }
}

export function broadcastStoreEvent(storeId: string, type: string, payload: unknown): void {
  sendToRoom(`store:${storeId}`, type, payload);
}

export function broadcastPublicStoreEvent(slug: string, type: string, payload: unknown): void {
  sendToRoom(`public:${slug}`, type, payload);
}
