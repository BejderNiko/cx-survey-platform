import { can } from "@ok/domain";
import { Card, LinkButton, PageHeader } from "@/components/ui";
import { requireSession } from "@/lib/auth";
import { withUser } from "@/lib/db";
import {
  applyGovernance,
  getGovernance,
  listPanelistIds,
  listPanelists,
  MAX_AUDIENCE_IDS,
  panelFilterOptionValues,
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
  return filters.map((filter, index) => ({ ...filter, id: "server-group-" + String(index) }));
}
function optionList(values: unknown, fallback: string[] = [], observed: string[] = []) {
  return panelFilterOptionValues(fallback, values, observed).sort((left, right) => left.localeCompare(right, "da", { numeric: true }))
    .map((value) => ({ value, label: value }));
}
function normalizeFieldName(value: unknown): string {
  return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("da").replace(/[^a-z0-9]/g, "");
}
function findFieldKey(fields: Iterable<unknown>, exactNames: string[], partialNames: string[] = []): string | undefined {
  const exact = new Set(exactNames.map(normalizeFieldName));
  const normalized = Array.from(fields, (item) => {
    const field = item as { key?: unknown; label?: unknown };
    return { key: String(field.key), names: [normalizeFieldName(field.key), normalizeFieldName(field.label)] };
  });
  const exactMatch = normalized.find((field) => field.names.some((name) => exact.has(name)));
  if (exactMatch) return exactMatch.key;
  const partial = partialNames.map(normalizeFieldName);
  return normalized.find((field) => field.names.some((name) => partial.some((part) => name.includes(part))))?.key;
}
function attributeDisplay(attributes: unknown, key: string | undefined): string {
  if (!key || !attributes || typeof attributes !== "object" || Array.isArray(attributes)) return "—";
  const value = (attributes as Record<string, unknown>)[key];
  if (Array.isArray(value)) {
    const values = value.map(String).map((item) => item.trim()).filter(Boolean);
    return values.length > 0 ? values.join(", ") : "—";
  }
  if (value === null || value === undefined || String(value).trim() === "") return "—";
  return String(value);
}
function displayAge(attributes: unknown, ageKey: string | undefined, birthYear: unknown): string {
  const importedAge = attributeDisplay(attributes, ageKey);
  if (importedAge !== "—") return importedAge;
  const year = Number(birthYear);
  const currentYear = new Date().getFullYear();
  return Number.isInteger(year) && year > currentYear - 121 && year <= currentYear ? String(currentYear - year) : "—";
}

export default async function PanelPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const session = await requireSession();
  const sp = await searchParams;
  const filters = parsePanelFilters(sp.filters);
  const requestedPage = Number.parseInt(sp.page ?? "1", 10);
  const page = Number.isFinite(requestedPage) ? Math.max(1, requestedPage) : 1;

  const data = await withUser(session.userId, session.orgId, async (tx) => {
    const requestedListParams = {
      q: sp.q, tag: sp.tag, lifecycle: sp.lifecycle, customerStatus: sp.status, language: sp.language, filters,
      sort: (sp.sort as "name" | "created" | "email") ?? "name",
      limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE,
    };
    const firstPage = await listPanelists(tx, requestedListParams);
    const lastPage = Math.max(1, Math.ceil(firstPage.total / PAGE_SIZE));
    const effectivePage = Math.min(page, lastPage);
    const listParams = effectivePage === page ? requestedListParams : { ...requestedListParams, offset: (effectivePage - 1) * PAGE_SIZE };
    const { rows, total: filtered } = effectivePage === page ? firstPage : await listPanelists(tx, listParams);
    const [totalRow] = await tx`select count(*)::int as count from panelists where org_id = ${session.orgId}`;

    let available: number | null = null;
    try {
      const ids = await listPanelistIds(tx, listParams, { max: MAX_AUDIENCE_IDS });
      const governance = await getGovernance(tx, session.orgId);
      available = (await applyGovernance(tx, ids, governance)).eligible.length;
    } catch {
      available = null;
    }

    const [tagRows, customFields, messageRows, observedRows] = await Promise.all([
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
      tx`
        select cf.key, observed.value
        from custom_fields cf
        join panelist_attributes pa on pa.field_id = cf.id and pa.org_id = cf.org_id
        cross join lateral (
          select jsonb_array_elements_text(pa.value) as value where jsonb_typeof(pa.value) = 'array'
          union all
          select pa.value #>> '{}' as value where jsonb_typeof(pa.value) <> 'array'
        ) observed
        where cf.org_id = ${session.orgId} and observed.value is not null and btrim(observed.value) <> ''
        group by cf.key, observed.value
        order by cf.key, observed.value`,
    ]);

    const observedByKey = new Map<string, string[]>();
    for (const row of observedRows) {
      const key = String(row.key);
      observedByKey.set(key, [...(observedByKey.get(key) ?? []), String(row.value)]);
    }
    const customByKey = new Map(customFields.map((field) => [String(field.key), field]));
    const ageAttributeKey = findFieldKey(customFields, ["age", "alder"]);
    const carAttributeKey = findFieldKey(customFields, ["bil", "car", "vehicle", "biler"]);
    const productsAttributeKey = findFieldKey(customFields, ["products", "produkter", "produkter ved ok", "products at ok"], ["produkt", "product"]);
    const ageFilter: FilterField = ageAttributeKey
      ? { key: "custom", attributeKey: ageAttributeKey, label: String(customByKey.get(ageAttributeKey)?.label ?? "Age"), options: optionList(customByKey.get(ageAttributeKey)?.options, [], observedByKey.get(ageAttributeKey) ?? []) }
      : { key: "age", label: "Alder", options: [] };

    const filterFields: FilterField[] = [
      ageFilter,
      { key: "uddannelse", label: "Uddannelse", options: optionList(customByKey.get("uddannelse")?.options, DEFAULT_OPTIONS.uddannelse, observedByKey.get("uddannelse") ?? []) },
      { key: "opvarmningskilde", label: "Opvarmningskilde", options: optionList(customByKey.get("opvarmningskilde")?.options, DEFAULT_OPTIONS.opvarmningskilde, observedByKey.get("opvarmningskilde") ?? []) },
      { key: "customer_status", label: "Customer relation", options: Object.entries(CUSTOMER_STATUS).map(([value, label]) => ({ value, label })) },
      ...customFields.filter((field) => !["uddannelse", "opvarmningskilde", ageAttributeKey].includes(String(field.key)))
        .map((field) => ({ key: "custom" as const, attributeKey: String(field.key), label: String(field.label ?? field.key), options: optionList(field.options, [], observedByKey.get(String(field.key)) ?? []) })),
      { key: "tag", label: "Tags", options: tagRows.map((tag) => ({ value: String(tag.name), label: String(tag.name) })) },
    ];
    const messages: MessageOption[] = messageRows.map((message) => ({
      id: String(message.id), label: String(message.subject ?? message.name), date: fmtDate(message.message_created_at ?? message.created_at),
    }));
    return { rows, filtered, total: Number(totalRow.count), page: effectivePage, available, filterFields, messages, ageAttributeKey, carAttributeKey, productsAttributeKey };
  });

  const totalPages = Math.max(1, Math.ceil(data.filtered / PAGE_SIZE));
  const currentPage = data.page;
  const pageHref = (targetPage: number) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(sp)) if (value) params.set(key, value);
    if (targetPage <= 1) params.delete("page"); else params.set("page", String(targetPage));
    const query = params.toString();
    return query ? "/panel?" + query : "/panel";
  };

  return (
    <div className="mx-auto max-w-[1500px] space-y-5">
      <PageHeader title="Panel" description={String(data.filtered) + " panelister matcher de aktive filtre"} actions={<>
        <LinkButton href="/panel/recruitment">Rekruttering</LinkButton>
        {can(session.role, "panel.import") && <LinkButton href="/panel/import" variant="primary">Importér</LinkButton>}
      </>} />
      <PanelFilterPanel key={sp.filters ?? "no-filters"} fields={data.filterFields} messages={data.messages} initialFilters={asClientFilters(filters)}
        total={data.total} filtered={data.filtered} available={data.available} currentSearch={sp.q} />
      <Card>
        <div className="mb-3 border-b border-line pb-3">
          <h2 className="text-base font-semibold text-heading">Panelister</h2>
          <p className="mt-1 text-xs text-muted">Standardvisning med kontakt og centrale OK-paneldata.</p>
        </div>
        <PanelTable canEdit={can(session.role, "panel.edit")} rows={data.rows.map((row) => ({
          id: row.id as string,
          name: [row.first_name, row.last_name].filter(Boolean).join(" ") || "(anonymiseret)",
          email: (row.email as string | null) ?? "—",
          car: attributeDisplay(row.attributes, data.carAttributeKey),
          age: displayAge(row.attributes, data.ageAttributeKey, row.birth_year),
          products: attributeDisplay(row.attributes, data.productsAttributeKey),
        }))} />
        {data.filtered > PAGE_SIZE && <nav className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4" aria-label="Panelist pages">
          <p className="text-xs text-muted">Side {currentPage} af {totalPages} · {data.filtered} match</p>
          <div className="flex gap-2">
            {currentPage > 1 && <LinkButton href={pageHref(currentPage - 1)} variant="secondary">Forrige</LinkButton>}
            {currentPage < totalPages && <LinkButton href={pageHref(currentPage + 1)} variant="secondary">Næste</LinkButton>}
          </div>
        </nav>}
      </Card>
    </div>
  );
}
