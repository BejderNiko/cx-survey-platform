"use client";

import { useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Badge, Button, Card, Select } from "@/components/ui";

export type FilterOperator = "any" | "all" | "none";
export type FilterGroupField = "uddannelse" | "opvarmningskilde" | "tag" | "message_open" | "custom" | "customer_status";
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

  function addGroup(filterField: FilterField) {
    setGroups((current) => [...current, { id: nextGroupId(), field: filterField.key, key: filterField.attributeKey, operator: "any", values: [] }]);
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

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const params = new URLSearchParams(searchParams.toString());
    if (currentSearch?.trim()) params.set("q", currentSearch.trim());
    if (groups.length > 0) params.set("filters", JSON.stringify(groups.map(({ field, key, operator, values }) => ({ field, ...(key ? { key } : {}), operator, values }))));
    else params.delete("filters");
    router.push(`/panel?${params.toString()}`);
  }

  function fieldFor(group: PanelFilterGroup) {
    return fields.find((field) => field.key === group.field && (group.field !== "custom" || field.attributeKey === group.key));
  }

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
          <div className="flex flex-wrap gap-2">
            {fields.filter((field) => field.key !== "message_open").map((field) => (
              <Button key={field.key} type="button" size="sm" variant="ghost" onClick={() => addGroup(field)}>
                + {field.label}
              </Button>
            ))}
            {messages.length > 0 && <Button type="button" size="sm" variant="ghost" onClick={() => addGroup({ key: "message_open", label: "Message open", options: [] })}>+ Message open</Button>}
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
            <Button type="submit" variant="primary">Anvend filtre</Button>
            {groups.length > 0 && <Badge tone="blue">{groups.length} filtergruppe{groups.length === 1 ? "" : "r"}</Badge>}
          </div>
        </form>
      )}
    </Card>
  );
}