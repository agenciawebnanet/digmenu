import crypto from 'crypto';
import type { Request, Response, NextFunction } from 'express';
import { getDb } from './db.ts';

export const SESSION_COOKIE_NAME = 'digmenu_session';
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 14; // 14 dias

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;
  const [salt, expectedHex] = parts;
  const derived = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(expectedHex, 'hex');
  if (derived.length !== expected.length) return false;
  return crypto.timingSafeEqual(derived, expected);
}

function hashSessionToken(token: string): string {
  const secret = process.env.SESSION_SECRET || 'digmenu-preview-session-secret';
  return crypto.createHmac('sha256', secret).update(token).digest('hex');
}

export function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!cookieHeader) return cookies;
  const pairs = cookieHeader.split(';');
  for (const pair of pairs) {
    const idx = pair.indexOf('=');
    if (idx > 0) {
      const key = pair.slice(0, idx).trim();
      const val = pair.slice(idx + 1).trim();
      try {
        cookies[key] = decodeURIComponent(val);
      } catch {
        cookies[key] = val;
      }
    }
  }
  return cookies;
}

export function createUserSession(userId: string): { token: string; expiresAt: string } {
  const db = getDb();
  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashSessionToken(token);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  const id = crypto.randomUUID();

  db.prepare(
    'INSERT INTO sessions (id, user_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)'
  ).run(id, userId, tokenHash, expiresAt, new Date().toISOString());

  return { token, expiresAt };
}

export function setSessionCookie(res: Response, token: string, expiresAt: string): void {
  const isProd = process.env.NODE_ENV === 'production';
  res.cookie(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProd,
    expires: new Date(expiresAt),
    path: '/',
  });
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(SESSION_COOKIE_NAME, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
  });
}

export function destroySessionFromRequest(req: Request): void {
  const cookies = parseCookies(req.headers.cookie);
  const token = cookies[SESSION_COOKIE_NAME];
  if (!token) return;
  const db = getDb();
  db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hashSessionToken(token));
}

export interface AuthenticatedUser {
  id: string;
  name: string;
  email: string;
}

export interface AuthenticatedRequest extends Request {
  authUser?: AuthenticatedUser;
  storeRole?: 'owner' | 'manager';
}

export function getAuthenticatedUser(req: Request): AuthenticatedUser | null {
  const cookies = parseCookies(req.headers.cookie);
  const token = cookies[SESSION_COOKIE_NAME];
  if (!token) return null;

  const db = getDb();
  const tokenHash = hashSessionToken(token);
  const row = db
    .prepare(
      `SELECT u.id, u.name, u.email, s.expires_at
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ?`
    )
    .get(tokenHash) as { id: string; name: string; email: string; expires_at: string } | undefined;

  if (!row) return null;
  if (Date.parse(row.expires_at) < Date.now()) {
    db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash);
    return null;
  }

  return { id: row.id, name: row.name, email: row.email };
}

export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const user = getAuthenticatedUser(req);
  if (!user) {
    res.status(401).json({ error: 'Sessão expirada ou não autenticada. Faça login novamente.' });
    return;
  }
  req.authUser = user;
  next();
}

export function requireStoreMembership(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  const user = req.authUser;
  const storeId = req.params.storeId;

  if (!user) {
    res.status(401).json({ error: 'Autenticação necessária.' });
    return;
  }
  if (!storeId) {
    res.status(400).json({ error: 'Identificador da loja não informado.' });
    return;
  }

  const db = getDb();
  const membership = db
    .prepare('SELECT role FROM user_store_memberships WHERE user_id = ? AND store_id = ?')
    .get(user.id, storeId) as { role: 'owner' | 'manager' } | undefined;

  if (!membership) {
    res.status(403).json({ error: 'Acesso negado: você não tem permissão para esta loja.' });
    return;
  }

  req.storeRole = membership.role;
  next();
}
