import { can } from "@ok/domain";
import { Badge, Card, LinkButton, PageHeader } from "@/components/ui";
import { requireSession } from "@/lib/auth";
import { withUser } from "@/lib/db";
import {
  applyGovernance,
  getGovernance,
  listPanelistIds,
  listPanelists,
  MAX_AUDIENCE_IDS,
  parsePanelFilters,
  type PanelFilterGroup,
} from "@/lib/data/panel";
import { fmtDate } from "@/lib/format";
import { CUSTOMER_STATUS } from "@/lib/labels";
import { PanelFilterPanel, type FilterField, type MessageOption, type PanelFilterGroup as ClientFilterGroup } from "./panel-filter-panel";
import { PanelTable } from "./panel-table";

const PAGE_SIZE = 50;

const DEFAULT_OPTIONS: Record<string, string[]> = {
  uddannelse: ["Folkeskole", "Studentereksamen", "Erhvervsfaglig", "Kort videregående under 3 år", "Mellemlang videregående 3-4 år", "Lang videregående over 4 år", "Ønsker ikke at oplyse"],
  opvarmningskilde: ["Pillefyr", "Elvarme", "Varmepumpe", "Fjernvarme", "Jordvarme", "Solvarme", "Brændeovn", "Oliefyr", "Naturgas", "Bioenergi"],
};

function asClientFilters(filters: PanelFilterGroup[]): ClientFilterGroup[] {
  return filters.map((filter, index) => ({ ...filter, id: `server-group-${index}` }));
}

function optionList(values: unknown, fallback: string[]) {
  const configured = Array.isArray(values) ? values.filter((value): value is string => typeof value === "string") : [];
  return [...new Set([...fallback, ...configured])].map((value) => ({ value, label: value }));
}

export default async function PanelPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const session = await requireSession();
  const sp = await searchParams;
  const filters = parsePanelFilters(sp.filters);
  const requestedPage = Number.parseInt(sp.page ?? "1", 10);
  const page = Number.isFinite(requestedPage) ? Math.max(1, requestedPage) : 1;

  const data = await withUser(session.userId, session.orgId, async (tx) => {
    const requestedListParams = {
      q: sp.q,
      tag: sp.tag,
      lifecycle: sp.lifecycle,
      customerStatus: sp.status,
      language: sp.language,
      filters,
      sort: (sp.sort as "name" | "created" | "email") ?? "name",
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
    };
    const firstPage = await listPanelists(tx, requestedListParams);
    const lastPage = Math.max(1, Math.ceil(firstPage.total / PAGE_SIZE));
    const effectivePage = Math.min(page, lastPage);
    const listParams = effectivePage === page
      ? requestedListParams
      : { ...requestedListParams, offset: (effectivePage - 1) * PAGE_SIZE };
    const { rows, total: filtered } = effectivePage === page
      ? firstPage
      : await listPanelists(tx, listParams);
    const [totalRow] = await tx`select count(*)::int as count from panelists where org_id = ${session.orgId}`;

    let available: number | null = null;
    try {
      const ids = await listPanelistIds(tx, listParams, { max: MAX_AUDIENCE_IDS });
      const governance = await getGovernance(tx, session.orgId);
      available = (await applyGovernance(tx, ids, governance)).eligible.length;
    } catch {
      available = null;
    }

    const [tagRows, customFields, messageRows] = await Promise.all([
      tx`select name from tags where org_id = ${session.orgId} order by name`,
      tx`select key, label, options from custom_fields where org_id = ${session.orgId} order by key`,
      tx`
        select d.id, d.name, d.created_at, max(o.subject) as subject, max(o.created_at) as message_created_at
        from distributions d
        left join outbox_messages o on o.distribution_id = d.id and o.org_id = d.org_id
        where d.org_id = ${session.orgId}
        group by d.id, d.name, d.created_at
        order by coalesce(max(o.created_at), d.created_at) desc
        limit 100`,
    ]);
    const customByKey = new Map(customFields.map((field) => [String(field.key), field]));
    const filterFields: FilterField[] = [
      { key: "age", label: "Aldersgruppe", options: [] },
      { key: "uddannelse", label: "Uddannelse", options: optionList(customByKey.get("uddannelse")?.options, DEFAULT_OPTIONS.uddannelse) },
      { key: "opvarmningskilde", label: "Opvarmningskilde", options: optionList(customByKey.get("opvarmningskilde")?.options, DEFAULT_OPTIONS.opvarmningskilde) },
      { key: "customer_status", label: "Customer relation", options: Object.entries(CUSTOMER_STATUS).map(([value, label]) => ({ value, label })) },
      ...customFields
        .filter((field) => !["uddannelse", "opvarmningskilde"].includes(String(field.key)))
        .map((field) => ({ key: "custom" as const, attributeKey: String(field.key), label: String(field.label ?? field.key), options: optionList(field.options, []) })),
      { key: "tag", label: "Tags", options: tagRows.map((tag) => ({ value: String(tag.name), label: String(tag.name) })) },
    ];
    const messages: MessageOption[] = messageRows.map((message) => ({
      id: String(message.id),
      label: String(message.subject ?? message.name),
      date: fmtDate(message.message_created_at ?? message.created_at),
    }));

    return {
      rows,
      filtered,
      total: Number(totalRow.count),
      page: effectivePage,
      available,
      tags: tagRows.map((tag) => String(tag.name)),
      filterFields,
      messages,
    };
  });

  const totalPages = Math.max(1, Math.ceil(data.filtered / PAGE_SIZE));
  const currentPage = data.page;
  const pageHref = (targetPage: number) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(sp)) if (value) params.set(key, value);
    if (targetPage <= 1) params.delete("page");
    else params.set("page", String(targetPage));
    return `/panel?${params.toString()}`;
  };

  return (
    <div className="mx-auto max-w-[1500px] space-y-5">
      <PageHeader
        title="Panel"
        description={`${data.filtered} panelister matcher de aktive filtre`}
        actions={
          <>
            <LinkButton href="/panel/recruitment">Rekruttering</LinkButton>
            {can(session.role, "panel.import") && <LinkButton href="/panel/import" variant="primary">Importér</LinkButton>}
          </>
        }
      />

      <PanelFilterPanel
        key={sp.filters ?? "no-filters"}
        fields={data.filterFields}
        messages={data.messages}
        initialFilters={asClientFilters(filters)}
        total={data.total}
        filtered={data.filtered}
        available={data.available}
        currentSearch={sp.q}
      />

      <Card>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-line pb-3">
          <div>
            <h2 className="text-base font-semibold text-heading">Panelister</h2>
            <p className="mt-1 text-xs text-muted">Tags og paneldata følger hver panelist gennem import og profil.</p>
          </div>
          {data.tags.length > 0 && <Badge tone="blue">{data.tags.length} tags</Badge>}
        </div>
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
            tags: (r.tags as string[]) ?? [],
            hasConsent: r.has_consent as boolean,
          }))}
        />
        {data.filtered > PAGE_SIZE && (
          <nav className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4" aria-label="Panelist pages">
            <p className="text-xs text-muted">Side {currentPage} af {totalPages} · {data.filtered} match</p>
            <div className="flex gap-2">
              {currentPage > 1 && <LinkButton href={pageHref(currentPage - 1)} variant="secondary">Forrige</LinkButton>}
              {currentPage < totalPages && <LinkButton href={pageHref(currentPage + 1)} variant="secondary">Næste</LinkButton>}
            </div>
          </nav>
        )}
      </Card>
    </div>
  );
}
