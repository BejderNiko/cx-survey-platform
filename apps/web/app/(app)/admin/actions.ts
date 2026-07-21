"use server";

import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { ROLES, type Role } from "@ok/domain";
import { withAuthorized, withIdentityAdminAuthorized } from "@/lib/auth";
import { audit } from "@/lib/audit";

function assertRole(role: string): asserts role is Role {
  if (!ROLES.includes(role as Role)) throw new Error(`Unknown role '${role}'`);
}

/**
 * Local-dev invite: creates the user immediately with a generated password
 * (shown once to the admin). With Supabase Auth this becomes an email invite.
 */
export async function inviteMember(email: string, fullName: string, role: string) {
  assertRole(role);
  const password = randomBytes(6).toString("base64url");
  const hash = await bcrypt.hash(password, 10);
  const result = await withIdentityAdminAuthorized("members.invite", async (tx, session) => {
    const [existing] = await tx`select id from users where email = ${email.toLowerCase()}`;
    let userId: string;
    if (existing) {
      userId = existing.id as string;
    } else {
      // User creation crosses the tenant boundary by nature (users are global);
      // memberships bind them to this org.
      const [user] = await tx`
        insert into users (email, full_name, password_hash)
        values (${email.toLowerCase()}, ${fullName.trim()}, ${hash})
        returning id`;
      userId = user.id as string;
    }
    await tx`insert into memberships (org_id, user_id, role, invited_by)
             values (${session.orgId}, ${userId}, ${role}::member_role, ${session.userId})
             on conflict (org_id, user_id) do update set role = excluded.role, deactivated_at = null`;
    await audit(tx, {
      orgId: session.orgId, actorUserId: session.userId,
      action: "members.invite", entityType: "user", entityId: userId,
      details: { email: email.toLowerCase(), role },
    });
    return { created: !existing };
  });
  revalidatePath("/admin");
  return { ...result, oneTimePassword: result.created ? password : null };
}

export async function changeRole(membershipId: string, role: string) {
  assertRole(role);
  await withAuthorized("members.change_role", async (tx, session) => {
    const [m] = await tx`update memberships set role = ${role}::member_role where id = ${membershipId} returning user_id`;
    if (m) {
      await audit(tx, {
        orgId: session.orgId, actorUserId: session.userId,
        action: "members.change_role", entityType: "user", entityId: m.user_id as string,
        details: { role },
      });
    }
  });
  revalidatePath("/admin");
}

export async function setMemberActive(membershipId: string, active: boolean) {
  await withAuthorized("members.deactivate", async (tx, session) => {
    const [m] = await tx`
      update memberships set deactivated_at = ${active ? null : new Date()}
      where id = ${membershipId} returning user_id`;
    if (m) {
      await audit(tx, {
        orgId: session.orgId, actorUserId: session.userId,
        action: active ? "members.reactivate" : "members.deactivate",
        entityType: "user", entityId: m.user_id as string,
      });
    }
  });
  revalidatePath("/admin");
}
