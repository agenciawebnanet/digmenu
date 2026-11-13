import crypto from 'crypto';
import type { Request, Response, NextFunction } from 'express';
import { getDb } from './db.ts';

export const SESSION_COOKIE_NAME = 'digmenu_session';
export const CUSTOMER_SESSION_COOKIE_NAME = 'digmenu_customer_session';
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 14; // 14 dias

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  if (!storedHash || !storedHash.includes(':')) return false;
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

export function hashSessionTokenExternal(token: string): string {
  return hashSessionToken(token);
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

// ============================================================================
// MERCHANT SESSIONS (users / stores)
// ============================================================================
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

export type StoreMemberRole = 'owner' | 'manager' | 'kitchen' | 'waiter' | 'cashier';

export interface AuthenticatedUser {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string;
  authProvider?: string;
  isPlatformAdmin?: boolean;
}

export interface AuthenticatedCustomer {
  id: string;
  name: string;
  email: string;
  phoneE164: string;
  defaultAddress: string;
  avatarUrl: string;
  authProvider: string;
}

export interface AuthenticatedRequest extends Request {
  authUser?: AuthenticatedUser;
  authCustomer?: AuthenticatedCustomer;
  storeRole?: StoreMemberRole;
}

export function isPlatformAdminEmail(email: string | undefined | null): boolean {
  if (!email) return false;
  const raw = process.env.PLATFORM_ADMIN_EMAILS?.trim() || '';
  if (!raw) return false;
  const allowed = raw
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return allowed.includes(email.trim().toLowerCase());
}

export function getAuthenticatedUser(req: Request): AuthenticatedUser | null {
  const cookies = parseCookies(req.headers.cookie);
  const token = cookies[SESSION_COOKIE_NAME];
  if (!token) return null;

  const db = getDb();
  const tokenHash = hashSessionToken(token);
  const row = db
    .prepare(
      `SELECT u.id, u.name, u.email, u.avatar_url, u.auth_provider, s.expires_at
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ?`
    )
    .get(tokenHash) as
    | {
        id: string;
        name: string;
        email: string;
        avatar_url: string;
        auth_provider: string;
        expires_at: string;
      }
    | undefined;

  if (!row) return null;
  if (Date.parse(row.expires_at) < Date.now()) {
    db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash);
    return null;
  }

  return {
    id: row.id,
    name: row.name,
    email: row.email,
    avatarUrl: row.avatar_url || '',
    authProvider: row.auth_provider || 'password',
    isPlatformAdmin: isPlatformAdminEmail(row.email),
  };
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

export function requirePlatformAdmin(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  if (!req.authUser) {
    res.status(401).json({ error: 'Autenticação necessária.' });
    return;
  }
  if (!isPlatformAdminEmail(req.authUser.email)) {
    res.status(403).json({
      error: 'Acesso restrito ao administrador da plataforma configurado em PLATFORM_ADMIN_EMAILS.',
    });
    return;
  }
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
    .get(user.id, storeId) as { role: StoreMemberRole } | undefined;

  if (!membership) {
    res.status(403).json({ error: 'Acesso negado: você não tem permissão para esta loja.' });
    return;
  }

  req.storeRole = membership.role;
  next();
}

export function requireStoreRoles(allowedRoles: StoreMemberRole[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.storeRole || !allowedRoles.includes(req.storeRole)) {
      res.status(403).json({
        error: 'Seu perfil de acesso nesta loja não possui permissão para esta operação.',
      });
      return;
    }
    next();
  };
}

export function createPasswordResetToken(userId: string): { token: string; expiresAt: string } {
  const db = getDb();
  const token = crypto.randomBytes(24).toString('hex');
  const tokenHash = hashSessionToken(token);
  const expiresAt = new Date(Date.now() + 1000 * 60 * 30).toISOString(); // 30 min
  db.prepare(
    'INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)'
  ).run(crypto.randomUUID(), userId, tokenHash, expiresAt, new Date().toISOString());
  return { token, expiresAt };
}

export function consumePasswordResetToken(token: string, newPassword: string): { ok: boolean; error?: string } {
  const db = getDb();
  const tokenHash = hashSessionToken(token);
  const row = db
    .prepare('SELECT id, user_id, expires_at, used_at FROM password_reset_tokens WHERE token_hash = ?')
    .get(tokenHash) as
    | { id: string; user_id: string; expires_at: string; used_at: string | null }
    | undefined;

  if (!row || row.used_at) {
    return { ok: false, error: 'Token de redefinição inválido ou já utilizado.' };
  }
  if (Date.parse(row.expires_at) < Date.now()) {
    return { ok: false, error: 'Token de redefinição expirado. Solicite um novo.' };
  }

  const nowIso = new Date().toISOString();
  db.exec('BEGIN;');
  try {
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(newPassword), row.user_id);
    db.prepare('UPDATE password_reset_tokens SET used_at = ? WHERE id = ?').run(nowIso, row.id);
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(row.user_id);
    db.exec('COMMIT;');
  } catch (err) {
    db.exec('ROLLBACK;');
    throw err;
  }

  return { ok: true };
}

// ============================================================================
// INDIVIDUAL CUSTOMER SESSIONS (customer_accounts)
// ============================================================================
export function createCustomerSession(customerId: string): { token: string; expiresAt: string } {
  const db = getDb();
  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashSessionToken(token);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  const id = crypto.randomUUID();

  db.prepare(
    'INSERT INTO customer_sessions (id, customer_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)'
  ).run(id, customerId, tokenHash, expiresAt, new Date().toISOString());

  return { token, expiresAt };
}

export function setCustomerSessionCookie(res: Response, token: string, expiresAt: string): void {
  const isProd = process.env.NODE_ENV === 'production';
  res.cookie(CUSTOMER_SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProd,
    expires: new Date(expiresAt),
    path: '/',
  });
}

export function clearCustomerSessionCookie(res: Response): void {
  res.clearCookie(CUSTOMER_SESSION_COOKIE_NAME, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
  });
}

export function destroyCustomerSessionFromRequest(req: Request): void {
  const cookies = parseCookies(req.headers.cookie);
  const token = cookies[CUSTOMER_SESSION_COOKIE_NAME];
  if (!token) return;
  const db = getDb();
  db.prepare('DELETE FROM customer_sessions WHERE token_hash = ?').run(hashSessionToken(token));
}

export function getAuthenticatedCustomer(req: Request): AuthenticatedCustomer | null {
  const cookies = parseCookies(req.headers.cookie);
  const token = cookies[CUSTOMER_SESSION_COOKIE_NAME];
  if (!token) return null;

  const db = getDb();
  const tokenHash = hashSessionToken(token);
  const row = db
    .prepare(
      `SELECT c.id, c.name, c.email, c.phone_e164, c.default_address, c.avatar_url, c.auth_provider, s.expires_at
       FROM customer_sessions s
       JOIN customer_accounts c ON c.id = s.customer_id
       WHERE s.token_hash = ?`
    )
    .get(tokenHash) as
    | {
        id: string;
        name: string;
        email: string;
        phone_e164: string;
        default_address: string;
        avatar_url: string;
        auth_provider: string;
        expires_at: string;
      }
    | undefined;

  if (!row) return null;
  if (Date.parse(row.expires_at) < Date.now()) {
    db.prepare('DELETE FROM customer_sessions WHERE token_hash = ?').run(tokenHash);
    return null;
  }

  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phoneE164: row.phone_e164 || '',
    defaultAddress: row.default_address || '',
    avatarUrl: row.avatar_url || '',
    authProvider: row.auth_provider || 'password',
  };
}

export function requireCustomerAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  const customer = getAuthenticatedCustomer(req);
  if (!customer) {
    res.status(401).json({ error: 'Entre com sua conta de cliente para continuar.' });
    return;
  }
  req.authCustomer = customer;
  next();
}

// ============================================================================
// GOOGLE OAUTH 2.0 CONFIG & EXCHANGE
// ============================================================================
export function getGoogleOAuthConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim() || '';
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim() || '';
  return {
    configured: Boolean(clientId && clientSecret),
    mode: clientId && clientSecret ? ('google_oauth' as const) : ('simulator' as const),
    clientId,
    clientSecret,
  };
}

export function signOAuthState(payload: Record<string, string>): string {
  const secret = process.env.SESSION_SECRET || 'digmenu-preview-session-secret';
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(encoded).digest('base64url');
  return `${encoded}.${sig}`;
}

export function verifyOAuthState(state: string): Record<string, string> | null {
  const parts = state.split('.');
  if (parts.length !== 2) return null;
  const [encoded, sig] = parts;
  const secret = process.env.SESSION_SECRET || 'digmenu-preview-session-secret';
  const expected = crypto.createHmac('sha256', secret).update(encoded).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    return JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

export async function exchangeGoogleAuthCode(params: {
  code: string;
  redirectUri: string;
}): Promise<{ sub: string; email: string; name: string; picture: string }> {
  const cfg = getGoogleOAuthConfig();
  if (!cfg.configured) {
    throw new Error('Credenciais do Google OAuth não configuradas.');
  }

  const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code: params.code,
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      redirect_uri: params.redirectUri,
      grant_type: 'authorization_code',
    }),
  });

  const tokenData = (await tokenResp.json()) as Record<string, any>;
  if (!tokenResp.ok || !tokenData.access_token) {
    throw new Error(tokenData?.error_description || 'Falha ao trocar código Google OAuth.');
  }

  const userResp = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  });
  const profile = (await userResp.json()) as Record<string, any>;
  if (!userResp.ok || !profile.sub || !profile.email) {
    throw new Error('Não foi possível obter os dados da conta Google.');
  }

  return {
    sub: String(profile.sub),
    email: String(profile.email).toLowerCase(),
    name: String(profile.name || profile.email.split('@')[0]),
    picture: String(profile.picture || ''),
  };
}
