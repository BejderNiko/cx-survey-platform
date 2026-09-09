import type { Tx } from "../db";
import { fmtDate } from "../format";
import { CUSTOMER_STATUS } from "../labels";
import { panelFilterOptionValues } from "./panel";

export interface PanelFilterUiField {
  key: "uddannelse" | "opvarmningskilde" | "tag" | "message_open" | "custom" | "customer_status" | "age";
  label: string;
  options: { value: string; label: string }[];
  attributeKey?: string;
}

export interface PanelFilterUiMessage {
  id: string;
  label: string;
  date: string;
}

export async function getPanelFilterUiData(tx: Tx, orgId: string): Promise<{
  fields: PanelFilterUiField[];
  messages: PanelFilterUiMessage[];
  total: number;
}> {
  const [tagRows, customFields, observedRows, messageRows, totalRows] = await Promise.all([
    tx`select name from tags where org_id = ${orgId} order by name`,
    tx`select key, label, options from custom_fields where org_id = ${orgId} order by key`,
    tx`
      select cf.key, observed.value
      from custom_fields cf
      join panelist_attributes pa on pa.field_id = cf.id and pa.org_id = cf.org_id
      cross join lateral (
        select jsonb_array_elements_text(pa.value) as value where jsonb_typeof(pa.value) = 'array'
        union all
        select pa.value #>> '{}' as value where jsonb_typeof(pa.value) <> 'array'
      ) observed
      where cf.org_id = ${orgId} and observed.value is not null and btrim(observed.value) <> ''
      group by cf.key, observed.value order by cf.key, observed.value`,
    tx`
      select d.id, d.name, d.created_at, max(o.subject) as subject, max(o.created_at) as message_created_at
      from distributions d left join outbox_messages o on o.distribution_id = d.id and o.org_id = d.org_id
      where d.org_id = ${orgId}
      group by d.id, d.name, d.created_at
      order by coalesce(max(o.created_at), d.created_at) desc limit 100`,
    tx`select count(*)::int as count from panelists where org_id = ${orgId}`,
  ]);
  const observed = new Map<string, string[]>();
  for (const row of observedRows) observed.set(String(row.key), [...(observed.get(String(row.key)) ?? []), String(row.value)]);
  const optionList = (configured: unknown, values: string[]) => panelFilterOptionValues(configured, values)
    .sort((left, right) => left.localeCompare(right, "da", { numeric: true }))
    .map((value) => ({ value, label: value }));
  const fields: PanelFilterUiField[] = [
    { key: "age", label: "Alder", options: [] },
    { key: "customer_status", label: "Kunderelation", options: Object.entries(CUSTOMER_STATUS).map(([value, label]) => ({ value, label })) },
  ];
  for (const field of customFields) {
    const key = String(field.key);
    if (["age", "alder"].includes(key.toLocaleLowerCase("da"))) continue;
    const normalized = key.toLocaleLowerCase("da");
    fields.push({
      key: normalized === "uddannelse" ? "uddannelse" : normalized === "opvarmningskilde" ? "opvarmningskilde" : "custom",
      label: String(field.label ?? key),
      options: optionList(field.options, observed.get(key) ?? []),
      ...(normalized === "uddannelse" || normalized === "opvarmningskilde" ? {} : { attributeKey: key }),
    });
  }
  fields.push({ key: "tag", label: "Tags", options: tagRows.map((row) => ({ value: String(row.name), label: String(row.name) })) });
  return {
    fields,
    messages: messageRows.map((row) => ({ id: String(row.id), label: String(row.subject ?? row.name), date: fmtDate(row.message_created_at ?? row.created_at) })),
    total: Number(totalRows[0]?.count ?? 0),
  };
}
