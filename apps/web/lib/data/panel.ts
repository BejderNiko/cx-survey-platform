import { randomSample, type SegmentDefinition, type SegmentFilter } from "@ok/domain";
import type { Tx } from "../db";

/** Panel data access: list/filter/segment SQL, profile, governance checks. */

export interface PanelListParams {
  q?: string;
  lifecycle?: string;
  tag?: string;
  customerStatus?: string;
  language?: string;
  segment?: SegmentDefinition | null;
  sort?: "name" | "created" | "email";
  limit?: number;
  offset?: number;
}

function segmentConditions(tx: Tx, filters: SegmentFilter[]) {
  return filters.map((f) => {
    switch (f.field) {
      case "tag": {
        const frag = tx`exists (select 1 from panelist_tags pt join tags tg on tg.id = pt.tag_id
                          where pt.panelist_id = p.id and tg.name = ${String(f.value)})`;
        return f.op === "not_has" ? tx`not ${frag}` : frag;
      }
      case "attribute": {
        const key = f.key ?? "";
        if (f.op === "has") {
          return tx`exists (select 1 from panelist_attributes pa join custom_fields cf on cf.id = pa.field_id
                     where pa.panelist_id = p.id and cf.key = ${key} and pa.value @> ${tx.json(f.value as never)})`;
        }
        if (f.op === "in") {
          return tx`exists (select 1 from panelist_attributes pa join custom_fields cf on cf.id = pa.field_id
                     where pa.panelist_id = p.id and cf.key = ${key}
                       and pa.value <@ ${tx.json((f.value ?? []) as never)})`;
        }
        return tx`exists (select 1 from panelist_attributes pa join custom_fields cf on cf.id = pa.field_id
                   where pa.panelist_id = p.id and cf.key = ${key} and pa.value = ${tx.json(f.value as never)})`;
      }
      case "consent":
        return tx`exists (select 1 from consent_records cr where cr.panelist_id = p.id
                   and cr.purpose = ${String(f.value)} and cr.status = 'granted')`;
      case "last_contact_days_gt":
        return tx`not exists (select 1 from contact_events ce where ce.panelist_id = p.id
                   and ce.event_type = 'sent'
                   and ce.occurred_at > now() - make_interval(days => ${Number(f.value)}))`;
      case "birth_year": {
        if (f.op === "gte") return tx`p.birth_year >= ${Number(f.value)}`;
        if (f.op === "lte") return tx`p.birth_year <= ${Number(f.value)}`;
        return tx`p.birth_year = ${Number(f.value)}`;
      }
      default: {
        const col = tx(f.field); // safe: enum-validated field names map to columns
        if (f.op === "ne") return tx`${col} is distinct from ${String(f.value)}`;
        if (f.op === "in") return tx`${col} = any(${(f.value as string[]) ?? []})`;
        if (f.op === "contains") return tx`${col}::text ilike ${"%" + String(f.value) + "%"}`;
        return tx`${col} = ${String(f.value)}`;
      }
    }
  });
}

/** Combined WHERE fragment for all panelist filters (shared by paged list and audience building). */
function panelistWhere(tx: Tx, params: PanelListParams) {
  const conds = [];
  if (params.q) {
    const like = "%" + params.q + "%";
    conds.push(tx`(p.first_name ilike ${like} or p.last_name ilike ${like} or p.email::text ilike ${like} or p.external_id ilike ${like})`);
  }
  if (params.lifecycle) conds.push(tx`p.lifecycle = ${params.lifecycle}::panelist_lifecycle`);
  if (params.customerStatus) conds.push(tx`p.customer_status = ${params.customerStatus}`);
  if (params.language) conds.push(tx`p.language = ${params.language}`);
  if (params.tag) {
    conds.push(tx`exists (select 1 from panelist_tags pt join tags tg on tg.id = pt.tag_id
                  where pt.panelist_id = p.id and tg.name = ${params.tag})`);
  }
  if (params.segment) conds.push(...segmentConditions(tx, params.segment.filters));

  let where = tx`true`;
  for (const c of conds) where = tx`${where} and ${c}`;
  return where;
}

export async function listPanelists(tx: Tx, params: PanelListParams) {
  const where = panelistWhere(tx, params);

  const orderBy =
    params.sort === "created" ? tx`p.created_at desc`
    : params.sort === "email" ? tx`p.email asc`
    : tx`p.last_name asc, p.first_name asc`;

  const limit = Math.min(params.limit ?? 100, 500);
  const offset = params.offset ?? 0;

  const rows = await tx`
    select p.id, p.external_id, p.first_name, p.last_name, p.email, p.language, p.birth_year,
           p.gender, p.city, p.customer_status, p.lifecycle, p.created_at,
           coalesce((select array_agg(tg.name order by tg.name) from panelist_tags pt
                     join tags tg on tg.id = pt.tag_id where pt.panelist_id = p.id), '{}') as tags,
           exists (select 1 from consent_records cr where cr.panelist_id = p.id
                   and cr.purpose = 'survey_contact' and cr.status = 'granted') as has_consent
    from panelists p
    where ${where}
    order by ${orderBy}
    limit ${limit} offset ${offset}`;
  const [{ count }] = await tx`select count(*)::int as count from panelists p where ${where}`;
  return { rows, total: count as number };
}

/**
 * Absolute safety ceiling for audience building (F5-003). Exceeding it is an
 * explicit error — never a silent truncation — because a silently clipped
 * candidate list biases "random" samples and under-delivers "all" invites.
 */
export const MAX_AUDIENCE_IDS = 50_000;

/**
 * IDs only (for audience building), honoring the same filters as the panel
 * list but WITHOUT pagination: the result is the full matching population so
 * sampling stays uniform and invitation counts are truthful (F5-003).
 */
export async function listPanelistIds(
  tx: Tx,
  params: PanelListParams,
  opts: { max?: number } = {},
): Promise<string[]> {
  const where = panelistWhere(tx, params);
  const max = opts.max ?? MAX_AUDIENCE_IDS;
  if (!Number.isSafeInteger(max) || max < 1 || max > MAX_AUDIENCE_IDS) {
    throw new Error(`Audience maximum must be an integer between 1 and ${MAX_AUDIENCE_IDS}.`);
  }
  // Count and return IDs from one PostgreSQL statement/snapshot. A separate
  // count followed by a select could cross the ceiling if rows were inserted
  // between the two statements under READ COMMITTED isolation.
  const rows = await tx`
    select p.id, count(*) over ()::int as total
    from panelists p
    where ${where}
    order by p.id
    limit ${max + 1}`;
  const total = rows.length > 0 ? Number(rows[0].total) : 0;
  if (total > max) {
    throw new Error(
      `Audience of ${total} panelists exceeds the supported maximum of ${max}. ` +
        `Narrow the segment or filters before building this audience.`,
    );
  }
  return rows.map((r) => r.id as string);
}

export async function getPanelistProfile(tx: Tx, id: string) {
  const [panelist] = await tx`
    select p.*, ib.filename as import_filename
    from panelists p left join import_batches ib on ib.id = p.import_batch_id
    where p.id = ${id}`;
  if (!panelist) return null;
  const [attributes, consents, tags, notes, contacts, participation] = await Promise.all([
    tx`select cf.key, cf.label, cf.field_type, pa.value
       from panelist_attributes pa join custom_fields cf on cf.id = pa.field_id
       where pa.panelist_id = ${id} order by cf.key`,
    tx`select purpose, status, granted_at, withdrawn_at, source from consent_records
       where panelist_id = ${id} order by created_at`,
    tx`select tg.id, tg.name, tg.color from panelist_tags pt join tags tg on tg.id = pt.tag_id
       where pt.panelist_id = ${id} order by tg.name`,
    tx`select pn.id, pn.body, pn.created_at, u.full_name as author
       from panelist_notes pn join users u on u.id = pn.author_id
       where pn.panelist_id = ${id} order by pn.created_at desc`,
    tx`select ce.event_type, ce.occurred_at, d.name as distribution_name
       from contact_events ce left join distributions d on d.id = ce.distribution_id
       where ce.panelist_id = ${id} order by ce.occurred_at desc limit 50`,
    tx`select r.id, r.status, r.started_at, s.title as study_title
       from responses r join studies s on s.id = r.study_id
       where r.panelist_id = ${id} order by r.started_at desc`,
  ]);
  return { panelist, attributes, consents, tags, notes, contacts, participation };
}

export interface GovernanceSettings {
  contactCooldownDays: number;
  maxInviteSize: number;
  monthlyContactCap: number;
}

export async function getGovernance(tx: Tx, orgId: string): Promise<GovernanceSettings> {
  const [org] = await tx`select settings from organizations where id = ${orgId}`;
  const g = (org?.settings?.governance ?? {}) as Partial<GovernanceSettings>;
  return {
    contactCooldownDays: g.contactCooldownDays ?? 14,
    maxInviteSize: g.maxInviteSize ?? 500,
    monthlyContactCap: g.monthlyContactCap ?? 2,
  };
}

export interface EligibilityBreakdown {
  eligible: string[];
  excluded: { panelistId: string; reason: string }[];
}

/**
 * Contact governance applied to a candidate audience: lifecycle must be
 * active, survey_contact consent granted, cooldown respected, and the
 * monthly contact cap not exceeded. Returns per-panelist exclusion reasons.
 */
export async function applyGovernance(
  tx: Tx,
  candidateIds: string[],
  governance: GovernanceSettings,
): Promise<EligibilityBreakdown> {
  if (candidateIds.length === 0) return { eligible: [], excluded: [] };
  const rows = await tx`
    select p.id, p.email::text as email,
      p.lifecycle::text as lifecycle,
      exists (select 1 from consent_records cr where cr.panelist_id = p.id
              and cr.purpose = 'survey_contact' and cr.status = 'granted') as consent,
      exists (select 1 from contact_events ce where ce.panelist_id = p.id and ce.event_type = 'sent'
              and ce.occurred_at > now() - make_interval(days => ${governance.contactCooldownDays})) as in_cooldown,
      (select count(*) from contact_events ce where ce.panelist_id = p.id and ce.event_type = 'sent'
       and ce.occurred_at > now() - interval '30 days') as sent_30d
    from panelists p where p.id = any(${candidateIds})`;
  const eligible: string[] = [];
  const excluded: { panelistId: string; reason: string }[] = [];
  for (const r of rows) {
    if (r.lifecycle !== "active") excluded.push({ panelistId: r.id, reason: `lifecycle:${r.lifecycle}` });
    else if (!r.consent) excluded.push({ panelistId: r.id, reason: "no_consent" });
    else if (!r.email) excluded.push({ panelistId: r.id, reason: "no_email" });
    else if (r.in_cooldown) excluded.push({ panelistId: r.id, reason: `cooldown_${governance.contactCooldownDays}d` });
    else if (Number(r.sent_30d) >= governance.monthlyContactCap) excluded.push({ panelistId: r.id, reason: "monthly_cap" });
    else eligible.push(r.id);
  }
  return { eligible, excluded };
}

export interface AudienceResolution {
  /** Every panelist matching the filters — the FULL population, never truncated. */
  candidates: string[];
  eligible: string[];
  excluded: { panelistId: string; reason: string }[];
  selected: string[];
  /** Seed actually used for random sampling; null when no sampling happened. */
  seed: number | null;
  governance: GovernanceSettings;
}

/**
 * Resolve a panel-invite audience (F5-003): full candidate population,
 * governance filtering, optional seeded uniform sampling, and the governance
 * invitation cap enforced AFTER full eligibility is known. Hard limits raise
 * explicit errors; nothing is silently truncated.
 */
export async function resolveAudience(
  tx: Tx,
  input: {
    orgId: string;
    segment?: SegmentDefinition | null;
    method: "all" | "random";
    sampleSize?: number;
    seed?: number;
  },
): Promise<AudienceResolution> {
  if (input.method !== "all" && input.method !== "random") {
    throw new Error("Audience method must be all or random.");
  }
  let randomSampleSize: number | null = null;
  if (input.method === "random") {
    if (
      typeof input.sampleSize !== "number" ||
      !Number.isSafeInteger(input.sampleSize) ||
      input.sampleSize < 1
    ) {
      throw new Error("Random audiences require a positive integer sample size.");
    }
    randomSampleSize = input.sampleSize;
    if (
      input.seed !== undefined &&
      (!Number.isSafeInteger(input.seed) || input.seed < 0 || input.seed > 0xffff_ffff)
    ) {
      throw new Error("Audience seed must be an integer between 0 and 4294967295.");
    }
  }
  const candidates = await listPanelistIds(tx, { segment: input.segment ?? null, lifecycle: "active" });
  const governance = await getGovernance(tx, input.orgId);
  const { eligible, excluded } = await applyGovernance(tx, candidates, governance);

  let selected = eligible;
  let usedSeed: number | null = null;
  if (randomSampleSize !== null && randomSampleSize < eligible.length) {
    usedSeed = input.seed ?? Math.floor(Math.random() * 2 ** 31);
    selected = randomSample(eligible, randomSampleSize, usedSeed).selected;
  }
  if (selected.length > governance.maxInviteSize) {
    throw new Error(
      `Audience of ${selected.length} exceeds the governance cap of ${governance.maxInviteSize} invitations.`,
    );
  }
  if (selected.length === 0) {
    throw new Error("No eligible panelists after governance rules (consent, cooldown, caps).");
  }
  return { candidates, eligible, excluded, selected, seed: usedSeed, governance };
}
