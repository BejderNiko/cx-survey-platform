"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { segmentDefinition } from "@ok/domain";
import { withAuthorized } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { env } from "@/lib/env";
import { applyGovernance, getGovernance, listPanelistIds, parsePanelFilters, resolveAudience } from "@/lib/data/panel";

function token(prefix: string): string {
  return `${prefix}_${randomBytes(12).toString("base64url")}`;
}

export async function createPublicLink(studyId: string, name: string) {
  const result = await withAuthorized("distributions.create", async (tx, session) => {
    const [version] = await tx`
      select id from study_versions
      where study_id = ${studyId} and org_id = ${session.orgId}
      order by version_number desc limit 1`;
    if (!version) throw new Error("Publicér studiet, før du opretter links.");
    const [existing] = await tx`
      select id, public_token from distributions
      where study_id = ${studyId} and org_id = ${session.orgId}
        and kind = 'public_link' and status = 'active' and public_token is not null
      order by created_at asc limit 1`;
    if (existing) {
      await tx`
        update distributions set study_version_id = ${version.id}, name = ${name || "Offentligt link"}
        where id = ${existing.id} and org_id = ${session.orgId}`;
      await audit(tx, {
        orgId: session.orgId, actorUserId: session.userId,
        action: "distribution.update", entityType: "distribution", entityId: existing.id as string,
        details: { kind: "public_link", stable: true, versionId: version.id },
      });
      return { url: `${env.appBaseUrl}/s/${existing.public_token}`, reused: true };
    }
    const publicToken = token("pub");
    const [dist] = await tx`
      insert into distributions (org_id, study_id, study_version_id, kind, name, public_token, created_by)
      values (${session.orgId}, ${studyId}, ${version.id}, 'public_link', ${name || "Offentligt link"}, ${publicToken}, ${session.userId})
      returning id`;
    await audit(tx, {
      orgId: session.orgId, actorUserId: session.userId,
      action: "distribution.create", entityType: "distribution", entityId: dist.id as string,
      details: { kind: "public_link", stable: true },
    });
    return { url: `${env.appBaseUrl}/s/${publicToken}`, reused: false };
  });
  revalidatePath(`/studies/${studyId}`);
  revalidatePath(`/studies/${studyId}/udsend`);
  return result;
}

export interface InviteInput {
  studyId: string;
  name: string;
  segmentId?: string | null;
  method: "all" | "random";
  sampleSize?: number;
  seed?: number;
  filters?: string;
}

/**
 * Panelinvitation: udleder målgruppen (evt. segmentfiltreret), håndhæver
 * kontaktregler (samtykke, karensperiode, lofter, maks. størrelse), udtrækker
 * evt. en tilfældig stikprøve med registreret seed, fryser målgruppe-
 * øjebliksbilledet og lægger simulerede beskeder i udbakken. Der sendes ingen
 * rigtige e-mails.
 */
export interface PanelAudiencePreview {
  candidates: number;
  eligible: number;
  selected: number;
  excluded: Record<string, number>;
  maxInviteSize: number;
  blockingReason: string | null;
  panelists: { id: string; name: string; email: string }[];
}

export async function previewPanelAudience(input: Pick<InviteInput, "studyId" | "segmentId" | "method" | "sampleSize" | "filters">): Promise<PanelAudiencePreview> {
  return withAuthorized("distributions.create", async (tx, session) => {
    const [study] = await tx`select id from studies where id = ${input.studyId} and org_id = ${session.orgId}`;
    if (!study) throw new Error("Study was not found.");
    if (input.method !== "all" && input.method !== "random") throw new Error("Audience method must be all or random.");
    let segment = null;
    if (input.segmentId) {
      const [seg] = await tx`
        select definition from segments
        where id = ${input.segmentId} and org_id = ${session.orgId}`;
      if (!seg) throw new Error("Segment was not found.");
      segment = segmentDefinition.parse(seg.definition);
    }
    const filters = parsePanelFilters(input.filters);
    if (input.filters && input.filters !== "[]" && filters.length === 0) {
      throw new Error("Panel filters are invalid or incomplete.");
    }
    if (input.method === "random" && (
      typeof input.sampleSize !== "number" ||
      !Number.isSafeInteger(input.sampleSize) ||
      input.sampleSize < 1
    )) {
      throw new Error("Random audiences require a positive integer sample size.");
    }
    const candidateIds = await listPanelistIds(tx, {
      segment,
      filters,
      lifecycle: "active",
    });
    const governance = await getGovernance(tx, session.orgId);
    const { eligible, excluded } = await applyGovernance(tx, candidateIds, governance);
    const selected = input.method === "random"
      ? Math.min(input.sampleSize ?? 0, eligible.length)
      : eligible.length;
    const previewPanelists = await tx`
      select id, concat_ws(' ', first_name, last_name) as name, email::text as email
      from panelists
      where org_id = ${session.orgId} and id = any(${tx.array(eligible.slice(0, 50))}::uuid[])
      order by last_name asc, first_name asc
      limit 50`;
    const excludedSummary: Record<string, number> = {};
    for (const item of excluded) excludedSummary[item.reason] = (excludedSummary[item.reason] ?? 0) + 1;
    const blockingReason = selected === 0
      ? "No eligible panelists after governance rules."
      : selected > governance.maxInviteSize
        ? "Selection exceeds the governance invitation cap."
        : null;
    return {
      candidates: candidateIds.length,
      eligible: eligible.length,
      selected,
      excluded: excludedSummary,
      maxInviteSize: governance.maxInviteSize,
      blockingReason,
      panelists: previewPanelists.map((row) => ({ id: String(row.id), name: String(row.name ?? "(anonymised)"), email: String(row.email ?? "—") })),
    };
  });
}

export async function createPanelInvite(input: InviteInput) {
  const result = await withAuthorized("distributions.create", async (tx, session) => {
    const [version] = await tx`
      select v.id, v.version_number, s.title from study_versions v
      join studies s on s.id = v.study_id and s.org_id = ${session.orgId}
      where v.study_id = ${input.studyId} and v.org_id = ${session.orgId}
      order by v.version_number desc limit 1`;
    if (!version) throw new Error("Publicér studiet, før du inviterer panelister.");

    let segment = null;
    if (input.segmentId) {
      const [seg] = await tx`
        select definition from segments
        where id = ${input.segmentId} and org_id = ${session.orgId}`;
      if (!seg) throw new Error("Segment was not found.");
      segment = segmentDefinition.parse(seg.definition);
    }
    const filters = parsePanelFilters(input.filters);
    if (input.filters && input.filters !== "[]" && filters.length === 0) {
      throw new Error("Panel filters are invalid or incomplete.");
    }
    // Målgruppen afgøres over hele populationen; kontaktloft anvendes efter
    // fuld egnethedsvurdering, og hårde grænser fejler frem for at afkorte (F5-003).
    const { candidates, eligible, excluded, selected, seed, governance } = await resolveAudience(tx, {
      orgId: session.orgId,
      segment,
      method: input.method,
      sampleSize: input.sampleSize,
      filters,
      seed: input.seed,
    });

    const exclusionSummary: Record<string, number> = {};
    for (const e of excluded) exclusionSummary[e.reason] = (exclusionSummary[e.reason] ?? 0) + 1;

    const [dist] = await tx`
      insert into distributions (org_id, study_id, study_version_id, kind, name, audience_snapshot, created_by)
      values (${session.orgId}, ${input.studyId}, ${version.id}, 'panel_invite', ${input.name || "Panelinvitation"},
              ${tx.json({
                method: input.method, seed,
                requested: input.sampleSize ?? selected.length,
                candidates: candidates.length, eligible: eligible.length,
                excluded: exclusionSummary, panelistIds: selected,
                filters, filterVersion: 1,
                segmentId: input.segmentId ?? null, governance,
              } as never)},
              ${session.userId})
      returning id`;

    const panelists = await tx`
      select id, email, first_name, language from panelists
      where org_id = ${session.orgId} and id = any(${selected}) and email is not null`;
    for (const p of panelists) {
      const invToken = token("inv");
      const [inv] = await tx`
        insert into invitations (org_id, distribution_id, panelist_id, token, status, sent_at)
        values (${session.orgId}, ${dist.id}, ${p.id}, ${invToken}, 'sent', now())
        returning id`;
      const link = `${env.appBaseUrl}/i/${invToken}`;
      const subject =
        p.language === "en" ? `Help OK: 2 minutes about your experience` : `Hjælp OK: 2 minutter om din oplevelse`;
      const body =
        p.language === "en"
          ? `Dear ${p.first_name ?? "panelist"}\n\nWe would like to hear about your experience. The survey takes 1-2 minutes.\n\nOpen the survey: ${link}\n\nKind regards\nThe OK CX team`
          : `Kære ${p.first_name ?? "panelist"}\n\nVi vil gerne høre om din oplevelse. Undersøgelsen tager 1-2 minutter.\n\nÅbn undersøgelsen: ${link}\n\nVenlig hilsen\nOK CX-teamet`;
      await tx`insert into outbox_messages (org_id, distribution_id, invitation_id, to_address, subject, body)
               values (${session.orgId}, ${dist.id}, ${inv.id}, ${p.email}, ${subject}, ${body})`;
      await tx`insert into contact_events (org_id, panelist_id, event_type, distribution_id)
               values (${session.orgId}, ${p.id}, 'sent', ${dist.id})`;
    }

    await audit(tx, {
      orgId: session.orgId, actorUserId: session.userId,
      action: "distribution.create", entityType: "distribution", entityId: dist.id as string,
      details: { kind: "panel_invite", invited: panelists.length, excluded: exclusionSummary, seed, filters },
    });
    return { invited: panelists.length, excluded: exclusionSummary, eligible: eligible.length, candidates: candidates.length };
  });
  revalidatePath(`/studies/${input.studyId}`);
  revalidatePath(`/studies/${input.studyId}/udsend`);
  return result;
}
