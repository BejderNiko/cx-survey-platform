/**
 * Deterministic development seed.
 *
 * Generation method: every random draw comes from mulberry32(SEED), so reruns
 * produce identical data. All panelists are clearly fictional and use the
 * reserved domain `example.invalid`; no real personal data is ever generated.
 *
 * Distributions (documented for review):
 *  - 250 panelists: language 80% da / 20% en; gender 46% female / 46% male /
 *    4% other / 4% undisclosed; birth year 1950–2005 uniform; lifecycle
 *    85% active, 5% unsubscribed, 4% paused, 3% invited, 2% bounced, 1% blocked;
 *    customer status 70% customer / 15% former / 15% prospect.
 *  - Relational NPS study: 120 panel invitations (random sample, seed recorded),
 *    ~34 completed via invites plus ~55 via public link; NPS mix ≈ 35% promoter,
 *    30% passive, 25% detractor, 10% partial (never completed).
 *  - First-click study: 25 completions; 70% clicks cluster on the target
 *    region of the stimulus, 30% scatter.
 *
 * Rerunning wipes and recreates all seeded organizations.
 */
import bcrypt from "bcryptjs";
import {
  BUILT_IN_TEMPLATES,
} from "../lib/templates";
import { buildResponseDataset, type ResponseRecord } from "../lib/dataset-build";
import {
  evaluateRules,
  instrumentDefinition,
  mulberry32,
  randomSample,
  type InstrumentDefinition,
} from "@ok/domain";
import postgres from "postgres";

const SEED = 20260716;
const rng = mulberry32(SEED);
const adminUrl = process.env.DATABASE_ADMIN_URL ?? "postgres://postgres@127.0.0.1:54329/cx_platform";
const sql = postgres(adminUrl, { max: 4, onnotice: () => {} });

const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(rng() * arr.length)];
const chance = (p: number): boolean => rng() < p;
const between = (min: number, max: number): number => min + Math.floor(rng() * (max - min + 1));

const FIRST = ["Anders", "Mette", "Søren", "Kirsten", "Jens", "Hanne", "Lars", "Anne", "Peter", "Lone", "Morten", "Susanne", "Henrik", "Camilla", "Thomas", "Louise", "Rasmus", "Ida", "Frederik", "Emma", "Noah", "Freja", "Oscar", "Clara"] as const;
const LAST = ["Testesen", "Prøvesen", "Demogaard", "Fiktivsen", "Eksempel", "Mønstergaard", "Simulering", "Attrapsen", "Dummygaard", "Modelsen", "Skitsegaard", "Udkastsen"] as const;
const CITIES = [
  { city: "Aalborg", postal: "9000", region: "Nordjylland" },
  { city: "Aarhus", postal: "8000", region: "Midtjylland" },
  { city: "Viborg", postal: "8800", region: "Midtjylland" },
  { city: "Esbjerg", postal: "6700", region: "Syddanmark" },
  { city: "Odense", postal: "5000", region: "Syddanmark" },
  { city: "Roskilde", postal: "4000", region: "Sjælland" },
  { city: "Næstved", postal: "4700", region: "Sjælland" },
  { city: "København", postal: "2100", region: "Hovedstaden" },
  { city: "Frederiksberg", postal: "2000", region: "Hovedstaden" },
] as const;
const PRODUCTS = ["fuel_card", "ev_charging", "electricity", "mobile"] as const;
const IMPROVE_DA = [
  "Ventetiden på telefonen er alt for lang.",
  "Appen logger mig ud hele tiden.",
  "Priserne er svære at gennemskue.",
  "Jeg fik ikke svar på min mail.",
  "Ladestanderen var ude af drift igen.",
  "Regningen var uigennemsigtig.",
] as const;
const IMPROVE_EN = [
  "Waiting time on the phone is far too long.",
  "The app keeps logging me out.",
  "Prices are hard to understand.",
  "I never got a reply to my email.",
  "The charging station was out of order again.",
] as const;
const PRAISE_DA = [
  "Altid venlig og hurtig betjening.",
  "Appen gør det nemt at følge mit forbrug.",
  "God pris og ingen skjulte gebyrer.",
  "Problemet blev løst med det samme.",
] as const;
const PRAISE_EN = [
  "Always friendly and fast service.",
  "The app makes it easy to follow my usage.",
  "Good price and no hidden fees.",
] as const;

function daysAgo(days: number, hourJitter = true): Date {
  const d = new Date("2026-07-16T09:00:00Z");
  d.setUTCDate(d.getUTCDate() - days);
  if (hourJitter) d.setUTCHours(between(7, 20), between(0, 59), 0, 0);
  return d;
}

// Original OK-neutral first-click stimulus (simple checkout page wireframe).
function checkoutSvg(): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="500" viewBox="0 0 800 500"><rect width="800" height="500" fill="#f6f7f8"/><rect x="0" y="0" width="800" height="56" fill="#1f2937"/><text x="24" y="35" font-family="sans-serif" font-size="18" fill="#fff">OK Webshop</text><rect x="560" y="14" width="90" height="28" rx="4" fill="#374151"/><text x="573" y="33" font-family="sans-serif" font-size="13" fill="#fff">Log ind</text><rect x="664" y="14" width="112" height="28" rx="4" fill="#059669"/><text x="676" y="33" font-family="sans-serif" font-size="13" fill="#fff">Til betaling</text><rect x="24" y="88" width="480" height="120" rx="8" fill="#fff" stroke="#e5e7eb"/><text x="44" y="120" font-family="sans-serif" font-size="15" fill="#111">Ladekabel type 2 — 7,5 m</text><text x="44" y="146" font-family="sans-serif" font-size="13" fill="#666">Antal: 1</text><text x="420" y="120" font-family="sans-serif" font-size="15" fill="#111">749 kr.</text><rect x="24" y="224" width="480" height="120" rx="8" fill="#fff" stroke="#e5e7eb"/><text x="44" y="256" font-family="sans-serif" font-size="15" fill="#111">Adapter CEE — 16 A</text><text x="44" y="282" font-family="sans-serif" font-size="13" fill="#666">Antal: 1</text><text x="420" y="256" font-family="sans-serif" font-size="15" fill="#111">399 kr.</text><rect x="528" y="88" width="248" height="200" rx="8" fill="#fff" stroke="#e5e7eb"/><text x="548" y="120" font-family="sans-serif" font-size="15" fill="#111">I alt: 1.148 kr.</text><text x="548" y="146" font-family="sans-serif" font-size="12" fill="#666">Inkl. moms og levering</text><rect x="548" y="170" width="208" height="44" rx="6" fill="#059669"/><text x="586" y="198" font-family="sans-serif" font-size="15" fill="#fff">Gå til betaling</text><rect x="548" y="228" width="208" height="36" rx="6" fill="#f3f4f6" stroke="#d1d5db"/><text x="580" y="251" font-family="sans-serif" font-size="13" fill="#374151">Fortsæt med at handle</text><rect x="24" y="368" width="752" height="100" rx="8" fill="#eef2f7"/><text x="44" y="400" font-family="sans-serif" font-size="13" fill="#374151">Kundeservice: 70 10 20 33 — man-fre 8-16</text><text x="44" y="424" font-family="sans-serif" font-size="13" fill="#374151">Fri fragt ved køb over 500 kr.</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

async function main() {
  console.log(`Seeding with deterministic seed ${SEED} ...`);

  // ---- wipe previous seed (idempotent) ----
  await sql`delete from organizations where slug in ('ok-cx', 'nordvind-demo')`;
  await sql`delete from users where email like '%@example.invalid'`;
  await sql`delete from templates where org_id is null`;

  // ---- organizations & workspaces ----
  const [orgA] = await sql`
    insert into organizations (name, slug, settings) values
    ('OK CX & Market Insights', 'ok-cx',
     ${sql.json({ governance: { contactCooldownDays: 14, maxInviteSize: 500, monthlyContactCap: 2 } })})
    returning id`;
  const [orgB] = await sql`
    insert into organizations (name, slug, settings) values
    ('Nordvind Demo ApS', 'nordvind-demo', '{}')
    returning id`;
  const [wsCx] = await sql`insert into workspaces (org_id, name, slug) values (${orgA.id}, 'Customer Experience', 'cx') returning id`;
  const [wsIns] = await sql`insert into workspaces (org_id, name, slug) values (${orgA.id}, 'Market Insights', 'insights') returning id`;
  const [wsB] = await sql`insert into workspaces (org_id, name, slug) values (${orgB.id}, 'General', 'general') returning id`;

  // ---- users & memberships ----
  const hash = await bcrypt.hash("demo1234!", 10);
  const userDefs = [
    { email: "owner@example.invalid", name: "Ole Ejersen", role: "owner", locale: "da" },
    { email: "admin@example.invalid", name: "Astrid Administrup", role: "administrator", locale: "en" },
    { email: "researcher@example.invalid", name: "Rikke Researcher", role: "researcher", locale: "en" },
    { email: "panel@example.invalid", name: "Palle Panelsen", role: "panel_manager", locale: "da" },
    { email: "analyst@example.invalid", name: "Anna Analysedottir", role: "analyst", locale: "en" },
    { email: "viewer@example.invalid", name: "Viggo Viewer", role: "viewer", locale: "en" },
  ] as const;
  const users: Record<string, string> = {};
  for (const u of userDefs) {
    const [row] = await sql`
      insert into users (email, full_name, locale, password_hash)
      values (${u.email}, ${u.name}, ${u.locale}, ${hash}) returning id`;
    users[u.role] = row.id;
    await sql`insert into memberships (org_id, user_id, role) values (${orgA.id}, ${row.id}, ${u.role})`;
  }
  const [otherUser] = await sql`
    insert into users (email, full_name, locale, password_hash)
    values ('other@example.invalid', 'Nadia Nordvind', 'en', ${hash}) returning id`;
  await sql`insert into memberships (org_id, user_id, role) values (${orgB.id}, ${otherUser.id}, 'owner')`;

  // ---- custom fields & tags ----
  const [regionField] = await sql`
    insert into custom_fields (org_id, key, label, field_type, options)
    values (${orgA.id}, 'region', 'Region', 'select',
      ${sql.json(["Nordjylland", "Midtjylland", "Syddanmark", "Sjælland", "Hovedstaden"])} ) returning id`;
  const [productsField] = await sql`
    insert into custom_fields (org_id, key, label, field_type, options)
    values (${orgA.id}, 'products', 'Products', 'multi_select', ${sql.json([...PRODUCTS])}) returning id`;
  const [channelField] = await sql`
    insert into custom_fields (org_id, key, label, field_type, options)
    values (${orgA.id}, 'channel_preference', 'Preferred contact channel', 'select',
      ${sql.json(["email", "sms", "phone"])}) returning id`;

  const tagNames = ["vip", "pilot-group", "churn-risk", "newsletter"] as const;
  const tagIds: Record<string, string> = {};
  for (const t of tagNames) {
    const [row] = await sql`insert into tags (org_id, name, color) values (${orgA.id}, ${t}, ${pick(["emerald", "sky", "amber", "rose"] as const)}) returning id`;
    tagIds[t] = row.id;
  }

  // ---- import batch that "owns" the seeded panelists ----
  const [batch] = await sql`
    insert into import_batches (org_id, filename, file_kind, status, dedup_rule, dry_run, counts, created_by, committed_at)
    values (${orgA.id}, 'deterministic-seed.csv', 'csv', 'committed', 'external_id', false,
            ${sql.json({ total: 250, valid: 250, created: 250, updated: 0, skipped: 0 })}, ${users.panel_manager}, now())
    returning id`;

  // ---- panelists ----
  type PanelistSeed = {
    id: string; gender: string | null; birthYear: number; lifecycle: string;
    customerStatus: string; language: string; region: string; email: string;
  };
  const panelists: PanelistSeed[] = [];
  for (let i = 1; i <= 250; i++) {
    const first = pick(FIRST);
    const last = pick(LAST);
    const loc = pick(CITIES);
    const language = chance(0.8) ? "da" : "en";
    const genderRoll = rng();
    const gender = genderRoll < 0.46 ? "female" : genderRoll < 0.92 ? "male" : genderRoll < 0.96 ? "other" : null;
    const birthYear = between(1950, 2005);
    const lifecycleRoll = rng();
    const lifecycle =
      lifecycleRoll < 0.85 ? "active"
      : lifecycleRoll < 0.90 ? "unsubscribed"
      : lifecycleRoll < 0.94 ? "paused"
      : lifecycleRoll < 0.97 ? "invited"
      : lifecycleRoll < 0.99 ? "bounced" : "blocked";
    const statusRoll = rng();
    const customerStatus = statusRoll < 0.7 ? "customer" : statusRoll < 0.85 ? "former" : "prospect";
    const email = `panelist${String(i).padStart(3, "0")}@example.invalid`;
    const createdDaysAgo = between(30, 720);
    const [row] = await sql`
      insert into panelists (org_id, external_id, first_name, last_name, email, phone, language,
                             birth_year, gender, city, postal_code, country, customer_status,
                             recruitment_source, lifecycle, import_batch_id, created_at)
      values (${orgA.id}, ${"EXT-" + String(10000 + i)}, ${first}, ${last}, ${email},
              ${"+45 00 00 " + String(1000 + i).slice(1)}, ${language}, ${birthYear}, ${gender},
              ${loc.city}, ${loc.postal}, 'DK', ${customerStatus},
              ${pick(["website", "newsletter", "store", "campaign"] as const)}, ${lifecycle}::panelist_lifecycle,
              ${batch.id}, ${daysAgo(createdDaysAgo)})
      returning id`;
    panelists.push({ id: row.id, gender, birthYear, lifecycle, customerStatus, language, region: loc.region, email });

    await sql`insert into panelist_attributes (panelist_id, field_id, org_id, value)
              values (${row.id}, ${regionField.id}, ${orgA.id}, ${sql.json(loc.region)})`;
    const prods = PRODUCTS.filter(() => chance(0.4));
    if (prods.length) {
      await sql`insert into panelist_attributes (panelist_id, field_id, org_id, value)
                values (${row.id}, ${productsField.id}, ${orgA.id}, ${sql.json(prods)})`;
    }
    await sql`insert into panelist_attributes (panelist_id, field_id, org_id, value)
              values (${row.id}, ${channelField.id}, ${orgA.id}, ${sql.json(pick(["email", "email", "email", "sms", "phone"] as const))})`;

    // consent: everyone has a panel_membership record; ~93% granted survey_contact
    const withdrawn = chance(0.07) || lifecycle === "unsubscribed";
    await sql`insert into consent_records (org_id, panelist_id, purpose, status, source, granted_at)
              values (${orgA.id}, ${row.id}, 'panel_membership', 'granted', 'seed', ${daysAgo(createdDaysAgo)})`;
    await sql`insert into consent_records (org_id, panelist_id, purpose, status, source, granted_at, withdrawn_at)
              values (${orgA.id}, ${row.id}, 'survey_contact', ${withdrawn ? "withdrawn" : "granted"}::consent_status,
                      'seed', ${daysAgo(createdDaysAgo)}, ${withdrawn ? daysAgo(between(1, 60)) : null})`;

    for (const t of tagNames) if (chance(0.12)) {
      await sql`insert into panelist_tags (panelist_id, tag_id, org_id) values (${row.id}, ${tagIds[t]}, ${orgA.id})
                on conflict do nothing`;
    }
    if (chance(0.15)) {
      await sql`insert into panelist_notes (org_id, panelist_id, author_id, body)
                values (${orgA.id}, ${row.id}, ${users.panel_manager}, ${pick([
                  "Vil gerne deltage i interviews.",
                  "Foretrækker kontakt om eftermiddagen.",
                  "Deltog i pilotgruppen foråret 2026.",
                  "Har givet udførlig feedback tidligere.",
                ] as const)})`;
    }
  }
  console.log(`  ${panelists.length} panelists`);

  // ---- built-in templates ----
  for (const t of BUILT_IN_TEMPLATES) {
    await sql`insert into templates (org_id, name, category, description, definition)
              values (null, ${t.name}, ${t.category}, ${t.description}, ${sql.json(t.definition as never)})`;
  }

  // ---- Study 1: Relational NPS (live) ----
  const npsTemplate = BUILT_IN_TEMPLATES.find((t) => t.key === "relational_nps")!;
  const npsDef = instrumentDefinition.parse(npsTemplate.definition);
  const [study1] = await sql`
    insert into studies (org_id, workspace_id, title, description, study_type, method_tags, status,
                         owner_id, tags, draft_definition, settings)
    values (${orgA.id}, ${wsCx.id}, 'Relationel NPS 2026 H2',
            'Halvårlig loyalitetsmåling blandt aktive kunder.', 'survey', '{nps,relational}', 'live',
            ${users.researcher}, '{nps,2026}', ${sql.json(npsDef as never)},
            ${sql.json({ anonymityPolicy: "linked_when_invited" })})
    returning id`;
  const [study1v1] = await sql`
    insert into study_versions (org_id, study_id, version_number, definition, metric_definitions, published_by, published_at)
    values (${orgA.id}, ${study1.id}, 1, ${sql.json(npsDef as never)},
            ${sql.json({ nps: { id: "nps@1", promoters: "9-10", passives: "7-8", detractors: "0-6", formula: "%promoters - %detractors" } })},
            ${users.researcher}, ${daysAgo(62)})
    returning id`;

  // Audience: active, consented panelists; random sample of 120 with recorded seed.
  const eligible = panelists.filter((p) => p.lifecycle === "active");
  const audienceSeed = 424242;
  const sample = randomSample(eligible.map((p) => p.id), 120, audienceSeed);
  const [dist1] = await sql`
    insert into distributions (org_id, study_id, study_version_id, kind, name, audience_snapshot, created_by, created_at)
    values (${orgA.id}, ${study1.id}, ${study1v1.id}, 'panel_invite', 'Panelinvitation juli 2026',
            ${sql.json({ method: "random", seed: audienceSeed, requested: 120, panelistIds: sample.selected, filters: { lifecycle: "active", consent: "survey_contact" } })},
            ${users.researcher}, ${daysAgo(60)})
    returning id`;
  const [dist1pub] = await sql`
    insert into distributions (org_id, study_id, study_version_id, kind, name, public_token, created_by, created_at)
    values (${orgA.id}, ${study1.id}, ${study1v1.id}, 'public_link', 'Offentligt link', ${"pub_" + SEED.toString(36) + "nps"},
            ${users.researcher}, ${daysAgo(60)})
    returning id`;

  // Invitations + simulated outbox + delivery funnel + responses.
  const answersFor = (locale: string): Record<string, unknown> | null => {
    const roll = rng();
    if (roll < 0.10) return null; // partial: started, never completed
    const nps =
      roll < 0.45 ? between(9, 10)
      : roll < 0.75 ? between(7, 8)
      : between(0, 6);
    const answers: Record<string, unknown> = { nps_score: nps };
    answers.main_reason = pick(["price", "service", "quality", "digital", "availability", "other"] as const);
    if (nps <= 8) answers.improve_text = locale === "da" ? pick(IMPROVE_DA) : pick(IMPROVE_EN);
    if (nps >= 9) answers.praise_text = locale === "da" ? pick(PRAISE_DA) : pick(PRAISE_EN);
    answers.contact_ok = chance(0.6);
    return answers;
  };

  type SeededResponse = { id: string; answers: Record<string, unknown>; panelistId: string | null; completedAt: Date | null };
  const seededResponses: SeededResponse[] = [];
  let rIdx = 0;

  async function insertResponse(opts: {
    panelistId: string | null; invitationId: string | null; distributionId: string;
    channel: string; language: string; day: number; answers: Record<string, unknown> | null;
  }) {
    rIdx += 1;
    const startedAt = daysAgo(opts.day);
    const completed = opts.answers !== null;
    const completedAt = completed ? new Date(startedAt.getTime() + between(60, 300) * 1000) : null;
    const [resp] = await sql`
      insert into responses (org_id, study_id, study_version_id, distribution_id, invitation_id, panelist_id,
                             respondent_key, status, language, channel, device, started_at, completed_at)
      values (${orgA.id}, ${study1.id}, ${study1v1.id}, ${opts.distributionId}, ${opts.invitationId}, ${opts.panelistId},
              ${"r1_" + String(rIdx).padStart(4, "0")}, ${completed ? "completed" : "started"}::response_status,
              ${opts.language}, ${opts.channel}, ${sql.json({ viewport: chance(0.55) ? "desktop" : "mobile" })},
              ${startedAt}, ${completedAt})
      returning id`;
    if (opts.answers) {
      for (const [code, value] of Object.entries(opts.answers)) {
        const qtype = code === "nps_score" ? "nps" : code === "main_reason" ? "single_choice" : code === "contact_ok" ? "consent" : "long_text";
        await sql`insert into response_answers (org_id, response_id, question_code, question_type, value, answered_at)
                  values (${orgA.id}, ${resp.id}, ${code}, ${qtype}, ${sql.json(value as never)}, ${completedAt ?? startedAt})`;
      }
      seededResponses.push({ id: resp.id, answers: opts.answers, panelistId: opts.panelistId, completedAt });
    }
    return resp.id;
  }

  const byId = new Map(panelists.map((p) => [p.id, p]));
  let inviteNo = 0;
  for (const pid of sample.selected) {
    inviteNo += 1;
    const p = byId.get(pid)!;
    const sentDay = between(45, 59);
    const opened = chance(0.72);
    const clicked = opened && chance(0.62);
    const started = clicked && chance(0.85);
    const answers = started ? answersFor(p.language) : null;
    const completed = started && answers !== null;
    const status = completed ? "completed" : started ? "started" : clicked ? "clicked" : opened ? "opened" : "sent";
    const token = `inv_${SEED.toString(36)}_${String(inviteNo).padStart(3, "0")}`;
    const [inv] = await sql`
      insert into invitations (org_id, distribution_id, panelist_id, token, status, sent_at)
      values (${orgA.id}, ${dist1.id}, ${pid}, ${token}, ${status}::invitation_status, ${daysAgo(sentDay)})
      returning id`;
    await sql`insert into outbox_messages (org_id, distribution_id, invitation_id, to_address, subject, body, created_at)
              values (${orgA.id}, ${dist1.id}, ${inv.id}, ${p.email},
                      'Hjælp OK: 2 minutter om din oplevelse',
                      ${"Kære panelist\n\nVi vil meget gerne høre om din oplevelse med OK. Undersøgelsen tager 1-2 minutter.\n\nÅbn undersøgelsen: {{link}}\n\nVenlig hilsen\nOK CX-teamet"},
                      ${daysAgo(sentDay)})`;
    await sql`insert into contact_events (org_id, panelist_id, event_type, distribution_id, occurred_at)
              values (${orgA.id}, ${pid}, 'sent', ${dist1.id}, ${daysAgo(sentDay)})`;
    if (opened) await sql`insert into contact_events (org_id, panelist_id, event_type, distribution_id, occurred_at)
              values (${orgA.id}, ${pid}, 'opened', ${dist1.id}, ${daysAgo(sentDay - 1)})`;
    if (clicked) await sql`insert into contact_events (org_id, panelist_id, event_type, distribution_id, occurred_at)
              values (${orgA.id}, ${pid}, 'clicked', ${dist1.id}, ${daysAgo(sentDay - 1)})`;
    if (started) {
      await insertResponse({
        panelistId: pid, invitationId: inv.id, distributionId: dist1.id,
        channel: "email", language: p.language, day: sentDay - between(1, 2), answers,
      });
      if (completed) {
        await sql`insert into contact_events (org_id, panelist_id, event_type, distribution_id, occurred_at)
                  values (${orgA.id}, ${pid}, 'responded', ${dist1.id}, ${daysAgo(sentDay - 2)})`;
      }
    }
  }

  // Anonymous public-link responses spread over the last 55 days.
  for (let i = 0; i < 62; i++) {
    const language = chance(0.85) ? "da" : "en";
    await insertResponse({
      panelistId: null, invitationId: null, distributionId: dist1pub.id,
      channel: "link", language, day: between(1, 55), answers: answersFor(language),
    });
  }
  console.log(`  study 1: ${seededResponses.length} completed responses`);

  // ---- Follow-up rule + cases via the real rule engine ----
  const ruleDef = {
    conditions: [{ questionCode: "nps_score", op: "lte" as const, value: 6 }],
    actions: [
      { type: "create_case" as const, title: "Follow up on detractor response", priority: "high" as const, assigneeEmail: "researcher@example.invalid", dueInHours: 72 },
      { type: "alert" as const, title: "Detractor response received", notifyEmail: "owner@example.invalid" },
    ],
  };
  const [rule1] = await sql`
    insert into followup_rules (org_id, study_id, name, is_active, conditions, actions, created_by)
    values (${orgA.id}, ${study1.id}, 'Detractor follow-up (NPS ≤ 6)', true,
            ${sql.json(ruleDef.conditions)}, ${sql.json(ruleDef.actions)}, ${users.researcher})
    returning id`;

  const ruleRows = [{ id: rule1.id as string, studyId: study1.id as string, isActive: true, conditions: ruleDef.conditions, actions: ruleDef.actions }];
  let caseCount = 0;
  for (const r of seededResponses) {
    const matches = evaluateRules(ruleRows, study1.id, r.answers);
    for (const m of matches) {
      for (const action of m.actions) {
        if (action.type === "create_case") {
          caseCount += 1;
          const resolved = chance(0.55);
          const status = resolved ? "resolved" : pick(["new", "assigned", "in_progress", "waiting"] as const);
          const createdAt = r.completedAt ?? new Date();
          const [fc] = await sql`
            insert into followup_cases (org_id, study_id, response_id, rule_id, title, priority, status, assignee_id, due_at, resolution, resolved_at, created_at)
            values (${orgA.id}, ${study1.id}, ${r.id}, ${m.ruleId}, ${action.title + " #" + caseCount},
                    ${action.priority}::case_priority, ${status}::case_status, ${users.researcher},
                    ${new Date(createdAt.getTime() + (action.dueInHours ?? 72) * 3600e3)},
                    ${resolved ? pick(["Called the customer and solved the billing question.", "Customer recontacted; issue escalated to operations.", "Apologized and issued a goodwill voucher."] as const) : null},
                    ${resolved ? new Date(createdAt.getTime() + between(4, 70) * 3600e3) : null}, ${createdAt})
            returning id`;
          await sql`insert into followup_activity (org_id, case_id, actor_id, activity_type, detail, created_at)
                    values (${orgA.id}, ${fc.id}, null, 'created', ${sql.json({ by: "rule", ruleId: m.ruleId })}, ${createdAt})`;
          if (resolved) {
            await sql`insert into followup_activity (org_id, case_id, actor_id, activity_type, detail, created_at)
                      values (${orgA.id}, ${fc.id}, ${users.researcher}, 'status_change', ${sql.json({ to: "resolved" })}, ${new Date(createdAt.getTime() + 36 * 3600e3)})`;
          }
        } else if (action.type === "alert") {
          await sql`insert into notifications (org_id, user_id, kind, title, body, entity_type, entity_id, created_at)
                    values (${orgA.id}, ${users.owner}, 'alert', ${action.title},
                            'A detractor response arrived on Relationel NPS 2026 H2.', 'response', ${r.id}, ${r.completedAt ?? new Date()})`;
        }
      }
    }
  }
  console.log(`  follow-up: ${caseCount} cases from rule engine`);

  // ---- Study 2: First-click test (live) ----
  const fcDef: InstrumentDefinition = instrumentDefinition.parse({
    languages: ["da", "en"],
    defaultLanguage: "da",
    blocks: [
      {
        id: "b1",
        questions: [
          {
            code: "fc_checkout",
            type: "first_click",
            label: { da: "Hvor ville du klikke for at gennemføre dit køb?", en: "Where would you click to complete your purchase?" },
            taskText: {
              da: "Forestil dig, at du er klar til at betale for varerne i kurven.",
              en: "Imagine you are ready to pay for the items in your basket.",
            },
            imageUrl: checkoutSvg(),
            required: true,
          },
          {
            code: "fc_confidence",
            type: "rating",
            label: { da: "Hvor sikker var du på dit valg? (1-5)", en: "How confident were you in your choice? (1-5)" },
            scale: { min: 1, max: 5 },
          },
          {
            code: "fc_comment",
            type: "long_text",
            label: { da: "Hvad ledte du efter?", en: "What were you looking for?" },
          },
        ],
      },
    ],
    messages: {
      intro: { da: "Du får vist et skærmbillede og en opgave. Klik dér, hvor du ville klikke først.", en: "You will see a screen and a task. Click where you would click first." },
      thankYou: { da: "Tak for hjælpen!", en: "Thanks for your help!" },
    },
  });
  const [study2] = await sql`
    insert into studies (org_id, workspace_id, title, description, study_type, method_tags, status, owner_id, draft_definition)
    values (${orgA.id}, ${wsIns.id}, 'First-click: Webshop checkout',
            'Kan kunderne finde vej til betaling i det nye checkout-design?', 'first_click', '{first_click,ux}', 'live',
            ${users.researcher}, ${sql.json(fcDef as never)})
    returning id`;
  const [study2v1] = await sql`
    insert into study_versions (org_id, study_id, version_number, definition, published_by, published_at)
    values (${orgA.id}, ${study2.id}, 1, ${sql.json(fcDef as never)}, ${users.researcher}, ${daysAgo(20)})
    returning id`;
  const [dist2] = await sql`
    insert into distributions (org_id, study_id, study_version_id, kind, name, public_token, created_by, created_at)
    values (${orgA.id}, ${study2.id}, ${study2v1.id}, 'public_link', 'Offentligt link', ${"pub_" + SEED.toString(36) + "fc"}, ${users.researcher}, ${daysAgo(20)})
    returning id`;

  // Target button ("Gå til betaling"): x 548-756, y 170-214 in a 800x500 image.
  for (let i = 1; i <= 25; i++) {
    const day = between(1, 18);
    const startedAt = daysAgo(day);
    const onTarget = chance(0.7);
    const x = onTarget ? between(552, 752) : between(20, 780);
    const y = onTarget ? between(172, 212) : between(20, 480);
    const [resp] = await sql`
      insert into responses (org_id, study_id, study_version_id, distribution_id, respondent_key, status, language, channel, device, started_at, completed_at)
      values (${orgA.id}, ${study2.id}, ${study2v1.id}, ${dist2.id}, ${"r2_" + String(i).padStart(3, "0")},
              'completed', ${chance(0.8) ? "da" : "en"}, 'link', ${sql.json({ viewport: chance(0.5) ? "desktop" : "mobile" })},
              ${startedAt}, ${new Date(startedAt.getTime() + between(30, 120) * 1000)})
      returning id`;
    await sql`insert into interaction_events (org_id, response_id, question_code, event_type, payload)
              values (${orgA.id}, ${resp.id}, 'fc_checkout', 'first_click',
                      ${sql.json({ x, y, naturalWidth: 800, naturalHeight: 500, elapsedMs: between(1200, 14000), hitTarget: onTarget })})`;
    await sql`insert into response_answers (org_id, response_id, question_code, question_type, value)
              values (${orgA.id}, ${resp.id}, 'fc_checkout', 'first_click', ${sql.json({ x, y })}),
                     (${orgA.id}, ${resp.id}, 'fc_confidence', 'rating', ${sql.json(onTarget ? between(3, 5) : between(1, 4))}),
                     (${orgA.id}, ${resp.id}, 'fc_comment', 'long_text', ${sql.json(pick(["Knappen var tydelig nok.", "Ledte efter en kurv-ikon først.", "Farven gjorde det nemt.", "Lidt i tvivl om 'Til betaling' øverst."] as const))})`;
  }
  console.log("  study 2: 25 first-click responses");

  // ---- Study 3: draft CSAT ----
  const csatTemplate = BUILT_IN_TEMPLATES.find((t) => t.key === "csat")!;
  await sql`
    insert into studies (org_id, workspace_id, title, description, study_type, method_tags, status, owner_id, draft_definition)
    values (${orgA.id}, ${wsCx.id}, 'Transaktionel CSAT — kundeservice',
            'Udkast: tilfredshed efter kontakt med kundeservice.', 'survey', '{csat,transactional}', 'draft',
            ${users.researcher}, ${sql.json(csatTemplate.definition as never)})`;

  // ---- Segments ----
  await sql`insert into segments (org_id, name, description, definition, created_by) values
    (${orgA.id}, 'Aktive kunder med samtykke', 'Aktive panelister med gyldigt survey-samtykke.',
     ${sql.json({ filters: [{ field: "lifecycle", op: "eq", value: "active" }, { field: "consent", op: "eq", value: "survey_contact" }, { field: "customer_status", op: "eq", value: "customer" }] })}, ${users.panel_manager}),
    (${orgA.id}, 'El-kunder i Jylland', 'Panelister med el-produkt i de jyske regioner.',
     ${sql.json({ filters: [{ field: "attribute", key: "products", op: "has", value: "electricity" }, { field: "attribute", key: "region", op: "in", value: ["Nordjylland", "Midtjylland", "Syddanmark"] }] })}, ${users.panel_manager})`;

  // ---- Dataset from study 1 responses ----
  const respRows = await sql`
    select r.id, r.respondent_key, r.completed_at, r.language, r.channel, r.panelist_id,
           p.gender, p.birth_year, p.customer_status
    from responses r left join panelists p on p.id = r.panelist_id
    where r.study_id = ${study1.id} and r.status = 'completed'
    order by r.started_at`;
  const answerRows = await sql`
    select response_id, question_code, value from response_answers ra
    where ra.org_id = ${orgA.id} and ra.response_id in
      (select id from responses where study_id = ${study1.id} and status = 'completed')`;
  const answersByResponse = new Map<string, Record<string, unknown>>();
  for (const a of answerRows) {
    const m = answersByResponse.get(a.response_id) ?? {};
    m[a.question_code] = a.value;
    answersByResponse.set(a.response_id, m);
  }
  const records: ResponseRecord[] = respRows.map((r) => ({
    respondentKey: r.respondent_key,
    completedAt: r.completed_at?.toISOString() ?? null,
    language: r.language,
    channel: r.channel,
    answers: answersByResponse.get(r.id) ?? {},
    panelist: r.panelist_id ? { gender: r.gender, birthYear: r.birth_year, customerStatus: r.customer_status } : null,
  }));
  const built = buildResponseDataset(npsDef, records, { includePanelist: true });
  const [ds] = await sql`
    insert into datasets (org_id, name, description, source_kind, source_study_id, owner_id)
    values (${orgA.id}, 'Relationel NPS 2026 H2 — besvarelser', 'Wide response dataset built from completed responses (v1 instrument).',
            'study_responses', ${study1.id}, ${users.analyst})
    returning id`;
  const [dsv] = await sql`
    insert into dataset_versions (org_id, dataset_id, version_number, row_count, variable_count, lineage, rows, created_by)
    values (${orgA.id}, ${ds.id}, 1, ${built.rows.length}, ${built.variables.length},
            ${sql.json({ studyId: study1.id, studyVersion: 1, builtAt: new Date().toISOString(), method: "buildResponseDataset@1" })},
            ${sql.json(built.rows as never)}, ${users.analyst})
    returning id`;
  for (const v of built.variables) {
    await sql`insert into variables (org_id, dataset_version_id, name, label, var_type, measure, value_labels, missing_values, role, position)
              values (${orgA.id}, ${dsv.id}, ${v.name}, ${v.label}, ${v.varType}, ${v.measure},
                      ${sql.json(v.valueLabels)}, ${sql.json(v.missingValues as never)}, ${v.role}, ${v.position})`;
  }
  console.log(`  dataset: ${built.rows.length} rows × ${built.variables.length} variables`);

  // ---- Insight + comments ----
  const [insight] = await sql`
    insert into insights (org_id, title, summary, status, decision, owner_id, tags)
    values (${orgA.id}, 'Ventetid i kundeservice driver detractor-scorer',
            'En stor andel af detractor-besvarelser i Relationel NPS 2026 H2 nævner ventetid på telefonen. Mønsteret er tydeligst blandt el-kunder.',
            'draft', 'Anbefaling: mål ventetid som KPI og genmål NPS i Q4.', ${users.analyst}, '{nps,kundeservice}')
    returning id`;
  await sql`insert into evidence_links (org_id, insight_id, entity_type, entity_id, note) values
    (${orgA.id}, ${insight.id}, 'study', ${study1.id}, 'Kildestudie'),
    (${orgA.id}, ${insight.id}, 'dataset_version', ${dsv.id}, 'Datasæt v1 bag analysen')`;
  await sql`insert into comments (org_id, entity_type, entity_id, author_id, body) values
    (${orgA.id}, 'study', ${study1.id}, ${users.owner}, 'Flot svarprocent — lad os fastholde kadencen.'),
    (${orgA.id}, 'insight', ${insight.id}, ${users.researcher}, 'Stemmer med de åbne svar; jeg tagger citaterne.')`;

  // ---- Audit trail for the seed itself ----
  await sql`insert into audit_events (org_id, actor_user_id, action, entity_type, entity_id, details) values
    (${orgA.id}, ${users.panel_manager}, 'panel.import.commit', 'import_batch', ${batch.id}, ${sql.json({ seeded: true, rows: 250 })}),
    (${orgA.id}, ${users.researcher}, 'study.publish', 'study', ${study1.id}, ${sql.json({ version: 1 })}),
    (${orgA.id}, ${users.researcher}, 'study.publish', 'study', ${study2.id}, ${sql.json({ version: 1 })})`;

  // ---- Org B (tenant isolation fixture) ----
  await sql`
    insert into studies (org_id, workspace_id, title, study_type, status, owner_id, draft_definition)
    values (${orgB.id}, ${wsB.id}, 'Nordvind medlemsmåling', 'survey', 'draft', ${otherUser.id},
            ${sql.json(csatTemplate.definition as never)})
    returning id`;
  for (let i = 1; i <= 3; i++) {
    await sql`insert into panelists (org_id, external_id, first_name, last_name, email, language, country, lifecycle)
              values (${orgB.id}, ${"NV-" + i}, 'Nord', ${"Vindsen " + i}, ${"nv" + i + "@example.invalid"}, 'da', 'DK', 'active')`;
  }

  console.log("Seed complete.");
  console.log("Sign in with e.g. owner@example.invalid / demo1234! (all seeded users share the password)");
  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
