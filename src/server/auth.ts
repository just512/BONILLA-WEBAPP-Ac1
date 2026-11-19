import crypto from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.ts';
import { loyaltyAccounts, profiles, roles, staffAccounts } from '../db/schema.ts';
import { adminAuth } from '../lib/firebase-admin.ts';

const OWNER_ADMIN_EMAILS = new Set(['justinbonilla1999@gmail.com']);

function getTokenSecret(): string {
  return (
    process.env.SESSION_SECRET ||
    process.env.SQL_PASSWORD ||
    'just-burger-ephemeral-signing-secret-2026'
  );
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;
  const [salt, keyHex] = parts;
  const derived = crypto.scryptSync(password, salt, 64);
  const keyBuf = Buffer.from(keyHex, 'hex');
  if (derived.length !== keyBuf.length) return false;
  return crypto.timingSafeEqual(derived, keyBuf);
}

export interface SessionPayload {
  uid: string;
  profileId: number;
  email: string;
  roleName: string;
  exp: number;
}

export function signSessionToken(payload: Omit<SessionPayload, 'exp'>, rememberMe = true): string {
  const ttlSeconds = rememberMe ? 60 * 60 * 24 * 14 : 60 * 60 * 12;
  const fullPayload: SessionPayload = {
    ...payload,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
  };
  const encoded = Buffer.from(JSON.stringify(fullPayload)).toString('base64url');
  const sig = crypto
    .createHmac('sha256', getTokenSecret())
    .update(encoded)
    .digest('base64url');
  return `jb.${encoded}.${sig}`;
}

export function verifySessionToken(token: string): SessionPayload | null {
  if (!token.startsWith('jb.')) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [, encoded, sig] = parts;
  const expectedSig = crypto
    .createHmac('sha256', getTokenSecret())
    .update(encoded)
    .digest('base64url');
  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    return null;
  }
  try {
    const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as SessionPayload;
    if (!parsed.exp || parsed.exp < Math.floor(Date.now() / 1000)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export type SafeProfile = {
  id: number;
  uid: string;
  email: string;
  fullName: string;
  phone: string;
  roleName: string;
  emailVerified: boolean;
  avatarUrl: string | null;
  isActive: boolean;
  branchId?: number | null;
  staffTitle?: string | null;
};

export interface AuthRequest extends Request {
  userProfile?: SafeProfile;
}

async function ensureRoleId(roleName: string): Promise<number> {
  const existing = await db.select().from(roles).where(eq(roles.name, roleName)).limit(1);
  if (existing.length > 0) return existing[0].id;
  const inserted = await db
    .insert(roles)
    .values({ name: roleName, description: `${roleName} access role` })
    .onConflictDoNothing()
    .returning();
  if (inserted.length > 0) return inserted[0].id;
  const retry = await db.select().from(roles).where(eq(roles.name, roleName)).limit(1);
  return retry[0].id;
}

export async function ensureLoyaltyAccount(profileId: number) {
  await db
    .insert(loyaltyAccounts)
    .values({
      profileId,
      pointsBalance: 0,
      lifetimePoints: 0,
      tierName: 'Flame Member',
    })
    .onConflictDoNothing();
}

export async function upsertFirebaseProfile(params: {
  uid: string;
  email: string;
  fullName?: string | null;
  phone?: string | null;
  avatarUrl?: string | null;
  emailVerified?: boolean;
}): Promise<SafeProfile> {
  try {
    const normalizedEmail = params.email.toLowerCase().trim();
    const existing = await db
      .select()
      .from(profiles)
      .where(eq(profiles.email, normalizedEmail))
      .limit(1);

    const isOwner = OWNER_ADMIN_EMAILS.has(normalizedEmail);
    const verifiedFlag = Boolean(params.emailVerified);

    if (existing.length > 0) {
      const current = existing[0];
      const targetRole = isOwner ? 'admin' : current.roleName;
      const roleId = await ensureRoleId(targetRole);
      const updated = await db
        .update(profiles)
        .set({
          uid: params.uid,
          fullName: params.fullName?.trim() || current.fullName,
          phone: params.phone?.trim() || current.phone,
          avatarUrl: params.avatarUrl || current.avatarUrl,
          emailVerified: verifiedFlag || current.emailVerified,
          roleName: targetRole,
          roleId,
          updatedAt: new Date(),
        })
        .where(eq(profiles.id, current.id))
        .returning();
      await ensureLoyaltyAccount(updated[0].id);
      const staff = await db
        .select()
        .from(staffAccounts)
        .where(eq(staffAccounts.profileId, updated[0].id))
        .limit(1);
      return toSafeProfile(updated[0], staff[0] ?? null);
    }

    const defaultRole = isOwner ? 'admin' : 'customer';
    const roleId = await ensureRoleId(defaultRole);
    const fallbackName = params.fullName?.trim() || normalizedEmail.split('@')[0];
    const inserted = await db
      .insert(profiles)
      .values({
        uid: params.uid,
        email: normalizedEmail,
        fullName: fallbackName,
        phone: params.phone?.trim() || '',
        roleId,
        roleName: defaultRole,
        emailVerified: verifiedFlag,
        avatarUrl: params.avatarUrl || null,
      })
      .onConflictDoUpdate({
        target: profiles.uid,
        set: {
          email: normalizedEmail,
          fullName: fallbackName,
          phone: params.phone?.trim() || '',
          emailVerified: verifiedFlag,
          updatedAt: new Date(),
        },
      })
      .returning();
    await ensureLoyaltyAccount(inserted[0].id);
    return toSafeProfile(inserted[0]);
  } catch (error) {
    console.error('Failed to upsert Firebase profile:', error);
    throw new Error('Authentication profile sync failed.', { cause: error });
  }
}

export async function upsertGoogleProfile(
  uid: string,
  email: string,
  fullName: string,
  avatarUrl?: string | null
): Promise<SafeProfile> {
  return upsertFirebaseProfile({
    uid,
    email,
    fullName,
    avatarUrl,
    emailVerified: true,
  });
}

export function toSafeProfile(
  row: typeof profiles.$inferSelect,
  staff?: typeof staffAccounts.$inferSelect | null
): SafeProfile {
  return {
    id: row.id,
    uid: row.uid,
    email: row.email,
    fullName: row.fullName,
    phone: row.phone,
    roleName: row.roleName,
    emailVerified: row.emailVerified,
    avatarUrl: row.avatarUrl,
    isActive: row.isActive,
    branchId: staff?.branchId ?? null,
    staffTitle: staff?.staffTitle ?? null,
  };
}

export async function resolveProfileFromToken(rawToken: string): Promise<SafeProfile | null> {
  if (!rawToken) return null;

  if (rawToken.startsWith('jb.')) {
    const payload = verifySessionToken(rawToken);
    if (!payload) return null;
    try {
      const rows = await db
        .select()
        .from(profiles)
        .where(eq(profiles.id, payload.profileId))
        .limit(1);
      if (rows.length === 0 || !rows[0].isActive) return null;
      const staff = await db
        .select()
        .from(staffAccounts)
        .where(eq(staffAccounts.profileId, rows[0].id))
        .limit(1);
      return toSafeProfile(rows[0], staff[0] ?? null);
    } catch (error) {
      console.error('Failed to resolve session profile:', error);
      return null;
    }
  }

  try {
    const decoded = await adminAuth.verifyIdToken(rawToken);
    const email = decoded.email || `${decoded.uid}@firebase.local`;
    const fullName = decoded.name || email.split('@')[0];
    const profile = await upsertFirebaseProfile({
      uid: decoded.uid,
      email,
      fullName,
      avatarUrl: decoded.picture,
      emailVerified: Boolean(decoded.email_verified),
    });
    if (!profile.isActive) return null;
    return profile;
  } catch {
    return null;
  }
}

function extractBearerOrCookie(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.slice('Bearer '.length).trim();
  }
  const cookieHeader = req.headers.cookie;
  if (cookieHeader) {
    for (const pair of cookieHeader.split(';')) {
      const [k, ...rest] = pair.trim().split('=');
      if (k === 'jb_session') {
        return decodeURIComponent(rest.join('='));
      }
    }
  }
  return null;
}

export const optionalAuth = async (req: AuthRequest, _res: Response, next: NextFunction) => {
  const token = extractBearerOrCookie(req);
  if (token) {
    const profile = await resolveProfileFromToken(token);
    if (profile) {
      req.userProfile = profile;
    }
  }
  next();
};

export const requireAuth = async (req: AuthRequest, res: Response, next: NextFunction) => {
  const token = extractBearerOrCookie(req);
  if (!token) {
    return res.status(401).json({ error: 'Authentication required. Please sign in.' });
  }
  const profile = await resolveProfileFromToken(token);
  if (!profile) {
    return res.status(401).json({ error: 'Invalid or expired session. Please sign in again.' });
  }
  req.userProfile = profile;
  next();
};

export const requireStaffOrAdmin = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  await requireAuth(req, res, () => {
    const role = req.userProfile?.roleName;
    if (role !== 'staff' && role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden: Staff or Administrator access required.' });
    }
    next();
  });
};

export const requireAdmin = async (req: AuthRequest, res: Response, next: NextFunction) => {
  await requireAuth(req, res, () => {
    if (req.userProfile?.roleName !== 'admin') {
      return res.status(403).json({ error: 'Forbidden: Administrator access required.' });
    }
    next();
  });
};
