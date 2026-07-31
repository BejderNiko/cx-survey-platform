"use client";

import { useEffect, useMemo, useRef, useState, useTransition, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Badge, Button, Card, Input, Select } from "@/components/ui";

export type FilterOperator = "any" | "all" | "none";
export type FilterGroupField = "uddannelse" | "opvarmningskilde" | "tag" | "message_open" | "custom" | "customer_status" | "age";
export interface PanelFilterGroup {
  id: string;
  field: FilterGroupField;
  operator: FilterOperator;
  values: string[];
  key?: string;
}
export interface FilterOption {
  value: string;
  label: string;
}
export interface FilterField {
  key: FilterGroupField;
  label: string;
  options: FilterOption[];
  attributeKey?: string;
}
export interface MessageOption {
  id: string;
  label: string;
  date: string;
}

const OPERATOR_LABELS: Record<FilterOperator, string> = {
  any: "Any of the selected",
  all: "All of the selected",
  none: "None of the selected",
};

function nextGroupId() {
  return `group-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function messageValue(id: string, mode: "opened" | "not_opened") {
  return `${mode}:${id}`;
}

function serializeFilterGroups(groups: PanelFilterGroup[]) {
  return JSON.stringify(groups.map(({ field, key, operator, values }) => ({ field, ...(key ? { key } : {}), operator, values })));
}

export function PanelFilterPanel({
  fields,
  messages,
  initialFilters,
  total,
  filtered,
  available,
  currentSearch,
}: {
  fields: FilterField[];
  messages: MessageOption[];
  initialFilters: PanelFilterGroup[];
  total: number;
  filtered: number | null;
  available: number | null;
  currentSearch?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(initialFilters.length > 0);
  const [groups, setGroups] = useState<PanelFilterGroup[]>(initialFilters);
  const [showAllMessages, setShowAllMessages] = useState(false);
  const [fieldQuery, setFieldQuery] = useState("");
  const [pending, startTransition] = useTransition();
  const filterSignature = useMemo(() => serializeFilterGroups(groups), [groups]);
  const lastAutoAppliedSignature = useRef(filterSignature);

  function addGroup(filterField: FilterField) {
    const values = filterField.key === "age" ? ["", ""] : [];
    const operator = filterField.key === "age" ? "all" : "any";
    setGroups((current) => [...current, { id: nextGroupId(), field: filterField.key, key: filterField.attributeKey, operator, values }]);
    setOpen(true);
  }

  function updateGroup(id: string, patch: Partial<PanelFilterGroup>) {
    setGroups((current) => current.map((group) => group.id === id ? { ...group, ...patch } : group));
  }

  function removeGroup(id: string) {
    setGroups((current) => current.filter((group) => group.id !== id));
  }

  function toggleValue(group: PanelFilterGroup, value: string) {
    updateGroup(group.id, {
      values: group.values.includes(value)
        ? group.values.filter((item) => item !== value)
        : [...group.values, value],
    });
  }

  const panelUrl = useMemo(() => {
    const complete = groups.every((group) => {
      if (group.field !== "age") return group.values.length > 0;
      const [minAge, maxAge] = group.values.map(Number);
      return group.values.length === 2 && Number.isInteger(minAge) && Number.isInteger(maxAge) && minAge >= 0 && maxAge <= 120 && minAge <= maxAge;
    });
    if (!complete) return null;
    const params = new URLSearchParams(searchParams.toString());
    params.delete("page");
    if (currentSearch?.trim()) params.set("q", currentSearch.trim());
    if (groups.length > 0) params.set("filters", serializeFilterGroups(groups));
    else params.delete("filters");
    const query = params.toString();
    return query ? `/panel?${query}` : "/panel";
  }, [currentSearch, groups, searchParams]);

  useEffect(() => {
    if (!panelUrl || lastAutoAppliedSignature.current === filterSignature) return;
    lastAutoAppliedSignature.current = filterSignature;
    const timer = window.setTimeout(() => {
      startTransition(() => router.replace(panelUrl, { scroll: false }));
    }, 300);
    return () => window.clearTimeout(timer);
  }, [filterSignature, panelUrl, router]);

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (panelUrl) router.push(panelUrl);
  }

  function fieldFor(group: PanelFilterGroup) {
    return fields.find((field) => field.key === group.field && (group.field !== "custom" || field.attributeKey === group.key));
  }

  const normalizedFieldQuery = fieldQuery.trim().toLocaleLowerCase("da");
  const selectableFields = fields.filter((field) =>
    field.key !== "message_open" && (!normalizedFieldQuery || field.label.toLocaleLowerCase("da").includes(normalizedFieldQuery)),
  );

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-heading">Panelistvælger</p>
          <p className="mt-1 text-xs text-muted">Byg én eller flere filtergrupper. Grupper kombineres med AND.</p>
        </div>
        <Button type="button" variant="secondary" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
          <span aria-hidden>⌘</span> Filter panelists
        </Button>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 sm:gap-3">
        <div className="rounded-xl border border-line bg-surface px-3 py-3"><p className="text-[11px] uppercase tracking-wide text-muted">panelists</p><p className="mt-1 text-xl font-semibold text-heading">{total}</p></div>
        <div className="rounded-xl border border-line bg-surface px-3 py-3"><p className="text-[11px] uppercase tracking-wide text-muted">filtered</p><p className="mt-1 text-xl font-semibold text-heading">{filtered === null ? "-" : filtered}</p></div>
        <div className="rounded-xl border border-line bg-surface px-3 py-3"><p className="text-[11px] uppercase tracking-wide text-muted">available</p><p className="mt-1 text-xl font-semibold text-heading">{available === null ? "-" : available}</p></div>
      </div>

      {open && (
        <form onSubmit={applyFilters} className="mt-4 max-h-[min(640px,70vh)] space-y-3 overflow-y-auto pr-1">
          <Input
            type="search"
            value={fieldQuery}
            onChange={(event) => setFieldQuery(event.target.value)}
            placeholder="Søg efter filterfelt"
            aria-label="Søg efter filterfelt"
          />
          <div className="flex flex-wrap gap-2">
            {selectableFields.map((field) => {
              const active = groups.some((group) => group.field === field.key && (field.key !== "custom" || group.key === field.attributeKey));
              return (
                <Button key={`${field.key}:${field.attributeKey ?? ""}`} type="button" size="sm" variant={active ? "secondary" : "ghost"} onClick={() => addGroup(field)}>
                  + {field.label} {active && <Badge tone="blue">ACTIVE</Badge>}
                </Button>
              );
            })}
            {messages.length > 0 && (!normalizedFieldQuery || "message open".includes(normalizedFieldQuery)) && (
              <Button type="button" size="sm" variant={groups.some((group) => group.field === "message_open") ? "secondary" : "ghost"} onClick={() => addGroup({ key: "message_open", label: "Message open", options: [] })}>
                + Message open {groups.some((group) => group.field === "message_open") && <Badge tone="blue">ACTIVE</Badge>}
              </Button>
            )}
          </div>

          {groups.map((group) => {
            const field = fieldFor(group);
            const options = field?.options ?? [];
            const visibleMessages = showAllMessages ? messages : messages.slice(0, 20);
            return (
              <section key={group.id} className="rounded-xl border border-line bg-surface px-3 py-3 sm:px-4" aria-label={`${field?.label ?? group.field} filter`}>
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-heading">{field?.label ?? group.field}</h3>
                  <Button type="button" variant="ghost" size="sm" aria-label={`Remove ${field?.label ?? group.field} filter`} onClick={() => removeGroup(group.id)}>×</Button>
                </div>
                {group.field === "age" ? (
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <label className="text-xs font-medium text-heading">
                      Fra og med
                      <Input className="mt-1" type="number" min={0} max={120} value={group.values[0] ?? ""} onChange={(event) => updateGroup(group.id, { values: [event.target.value, group.values[1] ?? ""] })} />
                    </label>
                    <label className="text-xs font-medium text-heading">
                      Til og med
                      <Input className="mt-1" type="number" min={0} max={120} value={group.values[1] ?? ""} onChange={(event) => updateGroup(group.id, { values: [group.values[0] ?? "", event.target.value] })} />
                    </label>
                    <p className="text-xs text-muted sm:col-span-2">Alder beregnes omtrentligt fra fødselsår. Fødselsdato findes ikke i panelets datamodel.</p>
                  </div>
                ) : (
                  <>
                    <Select className="mt-2 w-full sm:max-w-xs" value={group.operator} onChange={(event) => updateGroup(group.id, { operator: event.target.value as FilterOperator })} aria-label={`${field?.label ?? group.field} operator`}>
                      {Object.entries(OPERATOR_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </Select>
                    <p className="mt-2 text-xs text-muted">Select options to filter</p>
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      {group.field === "message_open"
                        ? visibleMessages.flatMap((message) => [
                          [messageValue(message.id, "opened"), `Have opened · ${message.label}`, message.date],
                          [messageValue(message.id, "not_opened"), `Have not opened · ${message.label}`, message.date],
                        ] as const).map(([value, label, date]) => (
                          <label key={value} className="flex min-w-0 items-start gap-2 rounded-lg border border-line/70 px-2 py-2 text-sm">
                            <input type="checkbox" checked={group.values.includes(value)} onChange={() => toggleValue(group, value)} />
                            <span className="min-w-0"><span className="block truncate">{label}</span><span className="text-xs text-muted">{date}</span></span>
                          </label>
                        ))
                        : options.map((option) => (
                          <label key={option.value} className="flex min-w-0 items-center gap-2 rounded-lg border border-line/70 px-2 py-2 text-sm">
                            <input type="checkbox" checked={group.values.includes(option.value)} onChange={() => toggleValue(group, option.value)} />
                            <span className="truncate">{option.label}</span>
                          </label>
                        ))}
                    </div>
                  </>
                )}
                {group.field === "message_open" && messages.length > 20 && (
                  <Button type="button" variant="ghost" size="sm" className="mt-2" onClick={() => setShowAllMessages((value) => !value)}>
                    {showAllMessages ? "SHOW FEWER MESSAGES" : "SHOW ALL MESSAGES"}
                  </Button>
                )}
              </section>
            );
          })}

          {groups.length === 0 && <p className="rounded-xl border border-dashed border-line px-4 py-5 text-sm text-muted">Tilføj Uddannelse, Opvarmningskilde, et panelspørgsmål, tags, kunderelation eller Message open.</p>}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Button type="submit" variant="primary" disabled={!panelUrl || pending}>{pending ? "Opdaterer…" : "Anvend filtre"}</Button>
            {groups.length > 0 && <Badge tone="blue">{groups.length} filtergruppe{groups.length === 1 ? "" : "r"}</Badge>}{pending && <span className="text-xs text-muted">Tællere og tabel opdateres…</span>}
          </div>
        </form>
      )}
    </Card>
  );
}