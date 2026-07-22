import { can, segmentDefinition } from "@ok/domain";
import { Card, KpiTile, LinkButton, PageHeader } from "@/components/ui";
import { requireSession } from "@/lib/auth";
import { withUser } from "@/lib/db";
import { listPanelists } from "@/lib/data/panel";
import { PanelTable } from "./panel-table";
import { FilterBar } from "./filter-bar";

export default async function PanelPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const session = await requireSession();
  const sp = await searchParams;

  const data = await withUser(session.userId, async (tx) => {
    let segment = null;
    if (sp.segment) {
      const [seg] = await tx`select definition from segments where id = ${sp.segment}`;
      if (seg) segment = segmentDefinition.parse(seg.definition);
    }
    const { rows, total } = await listPanelists(tx, {
      q: sp.q,
      lifecycle: sp.lifecycle,
      tag: sp.tag,
      customerStatus: sp.status,
      language: sp.language,
      segment,
      sort: (sp.sort as "name" | "created" | "email") ?? "name",
      limit: 500,
    });
    const [health] = await tx`
      select count(*) filter (where lifecycle = 'active') as active,
             count(*) as total,
             count(*) filter (where lifecycle in ('bounced','blocked')) as undeliverable,
             count(*) filter (where lifecycle = 'unsubscribed') as unsubscribed,
             (select count(*) from consent_records where purpose = 'survey_contact' and status = 'granted') as consented
      from panelists`;
    const [activity] = await tx`
      select count(*) filter (where event_type = 'sent' and occurred_at > now() - interval '30 days') as sent30,
             count(*) filter (where event_type = 'opened' and occurred_at > now() - interval '30 days') as opened30,
             count(*) filter (where event_type = 'responded' and occurred_at > now() - interval '30 days') as responded30
      from contact_events`;
    const tags = await tx`select name from tags order by name`;
    const segments = await tx`select id, name from segments order by name`;
    return { rows, total, health, activity, tags: tags.map((t) => t.name as string), segments };
  });

  const openRate =
    Number(data.activity.sent30) > 0
      ? Math.round((Number(data.activity.opened30) / Number(data.activity.sent30)) * 100)
      : null;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Panel"
        description={`${data.total} panelister matcher de aktuelle filtre`}
        actions={
          <>
            <LinkButton href="/panel/segments">Segmenter</LinkButton>
            <LinkButton href="/panel/recruitment">Rekruttering</LinkButton>
            {can(session.role, "panel.import") && <LinkButton href="/panel/import" variant="primary">Importér</LinkButton>}
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <KpiTile label="Aktive" value={String(data.health.active)} hint={`af ${data.health.total} i alt`} />
        <KpiTile label="Samtykke til undersøgelser" value={String(data.health.consented)} hint="givet til survey_contact" />
        <KpiTile label="Afmeldte" value={String(data.health.unsubscribed)} />
        <KpiTile label="Kan ikke leveres" value={String(data.health.undeliverable)} hint="bounce eller blokeret" />
        <KpiTile label="Åbningsrate · 30 dage" value={openRate === null ? "—" : `${openRate} %`} hint={`${data.activity.sent30} sendt, ${data.activity.responded30} besvarede`} />
      </div>

      <Card>
        <FilterBar tags={data.tags} segments={data.segments.map((s) => ({ id: s.id as string, name: s.name as string }))} current={sp} />
        <div className="mt-3">
          <PanelTable
            canEdit={can(session.role, "panel.edit")}
            rows={data.rows.map((r) => ({
              id: r.id as string,
              externalId: r.external_id as string | null,
              name: [r.first_name, r.last_name].filter(Boolean).join(" ") || "(anonymiseret)",
              email: (r.email as string | null) ?? "—",
              language: r.language as string,
              birthYear: r.birth_year as number | null,
              gender: (r.gender as string | null) ?? "—",
              city: (r.city as string | null) ?? "—",
              customerStatus: (r.customer_status as string | null) ?? "—",
              lifecycle: r.lifecycle as string,
              tags: r.tags as string[],
              hasConsent: r.has_consent as boolean,
            }))}
          />
        </div>
      </Card>

      {data.total > 500 && (
        <p className="text-xs text-muted">
          Viser de første 500 match. Indsnævr filtrene for at se resten.
        </p>
      )}
    </div>
  );
}
