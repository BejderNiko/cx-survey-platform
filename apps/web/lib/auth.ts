import "server-only";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import bcrypt from "bcryptjs";
import { type Action, type Role, assertCan } from "@ok/domain";
import { adminSql, withUser, type Tx } from "./db";
import { env } from "./env";

/**
 * Local development authentication: seeded users with bcrypt password hashes
 * and a signed, httpOnly session cookie. This module is the OIDC boundary —
 * replacing `verifyCredentials` + cookie issuance with Supabase Auth
 * (Microsoft Entra ID) leaves every caller of `requireSession` unchanged.
 */

const COOKIE = "cx_session";
const secret = new TextEncoder().encode(env.sessionSecret);

export interface SessionUser {
  userId: string;
  email: string;
  fullName: string;
  locale: string;
  orgId: string;
  orgName: string;
  role: Role;
}

export async function verifyCredentials(email: string, password: string): Promise<SessionUser | null> {
  // Membership lookup runs as admin: at sign-in time there is no session yet.
  const rows = await adminSql`
    select u.id, u.email, u.full_name, u.locale, u.password_hash,
           m.org_id, m.role, o.name as org_name
    from users u
    join memberships m on m.user_id = u.id and m.deactivated_at is null
    join organizations o on o.id = m.org_id
    where u.email = ${email} and u.is_active
    order by m.created_at asc
    limit 1`;
  const row = rows[0];
  if (!row?.password_hash) return null;
  const ok = await bcrypt.compare(password, row.password_hash);
  if (!ok) return null;
  return {
    userId: row.id,
    email: row.email,
    fullName: row.full_name,
    locale: row.locale,
    orgId: row.org_id,
    orgName: row.org_name,
    role: row.role as Role,
  };
}

export async function createSessionCookie(user: SessionUser): Promise<void> {
  const token = await new SignJWT({ ...user })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.userId)
    .setIssuedAt()
    .setExpirationTime("12h")
    .sign(secret);
  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 12 * 60 * 60,
  });
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  jar.delete(COOKIE);
}

export const getSession = cache(async (): Promise<SessionUser | null> => {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret);
    return {
      userId: String(payload.userId),
      email: String(payload.email),
      fullName: String(payload.fullName),
      locale: String(payload.locale ?? "en"),
      orgId: String(payload.orgId),
      orgName: String(payload.orgName),
      role: payload.role as Role,
    };
  } catch {
    return null;
  }
});

export async function requireSession(): Promise<SessionUser> {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}

async function refreshSession(tx: Tx, session: SessionUser): Promise<SessionUser> {
  const [current] = await tx`
    select u.email, u.full_name, u.locale, m.role, o.name as org_name
    from memberships m
    join users u on u.id = m.user_id
    join organizations o on o.id = m.org_id
    where m.user_id = ${session.userId} and m.org_id = ${session.orgId}
      and m.deactivated_at is null and u.is_active`;
  if (!current) throw new Error("Session is no longer authorized.");
  return {
    userId: session.userId,
    orgId: session.orgId,
    email: current.email as string,
    fullName: current.full_name as string,
    locale: current.locale as string,
    orgName: current.org_name as string,
    role: current.role as Role,
  };
}

/**
 * Standard entry point for authenticated commands/queries: verifies the
 * session, reloads the active membership and role, checks the central
 * permission policy, then runs `fn` inside an RLS-scoped transaction. Role
 * changes and deactivation therefore take effect on the next server action.
 */
export async function withAuthorized<T>(
  action: Action,
  fn: (tx: Tx, session: SessionUser) => Promise<T>,
): Promise<T> {
  const session = await requireSession();
  return withUser(session.userId, async (tx) => {
    const current = await refreshSession(tx, session);
    assertCan(current.role, action);
    return fn(tx, current);
  });
}

/**
 * Global identity records cannot be created through tenant RLS. Keep this
 * bypass restricted to identity administration and re-check the active role
 * inside the same service transaction before touching global user rows.
 */
export async function withIdentityAdminAuthorized<T>(
  action: Action,
  fn: (tx: Tx, session: SessionUser) => Promise<T>,
): Promise<T> {
  const session = await requireSession();
  return adminSql.begin(async (tx) => {
    const current = await refreshSession(tx, session);
    assertCan(current.role, action);
    return fn(tx, current);
  }) as Promise<T>;
}
