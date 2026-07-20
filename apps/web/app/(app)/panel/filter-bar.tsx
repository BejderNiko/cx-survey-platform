"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Button, Input, Select } from "@/components/ui";

const LIFECYCLES = ["", "active", "invited", "paused", "unsubscribed", "bounced", "blocked", "anonymized", "archived"];
const STATUSES = ["", "customer", "former", "prospect"];

export function FilterBar({
  tags,
  segments,
  current,
}: {
  tags: string[];
  segments: { id: string; name: string }[];
  current: Record<string, string | undefined>;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function submit(formData: FormData) {
    const params = new URLSearchParams();
    for (const key of ["q", "lifecycle", "status", "tag", "language", "segment", "sort"]) {
      const v = String(formData.get(key) ?? "").trim();
      if (v) params.set(key, v);
    }
    router.push(`/panel?${params.toString()}`);
  }

  return (
    <form action={submit} className="flex flex-wrap items-end gap-2" role="search" aria-label="Filter panelists">
      <div className="w-56">
        <label htmlFor="pf-q" className="mb-1 block text-xs font-medium text-muted">Search</label>
        <Input id="pf-q" name="q" placeholder="Name, email, external ID" defaultValue={current.q ?? ""} />
      </div>
      <div>
        <label htmlFor="pf-lifecycle" className="mb-1 block text-xs font-medium text-muted">Lifecycle</label>
        <Select id="pf-lifecycle" name="lifecycle" defaultValue={current.lifecycle ?? ""}>
          {LIFECYCLES.map((l) => <option key={l} value={l}>{l || "All"}</option>)}
        </Select>
      </div>
      <div>
        <label htmlFor="pf-status" className="mb-1 block text-xs font-medium text-muted">Customer status</label>
        <Select id="pf-status" name="status" defaultValue={current.status ?? ""}>
          {STATUSES.map((s) => <option key={s} value={s}>{s || "All"}</option>)}
        </Select>
      </div>
      <div>
        <label htmlFor="pf-tag" className="mb-1 block text-xs font-medium text-muted">Tag</label>
        <Select id="pf-tag" name="tag" defaultValue={current.tag ?? ""}>
          <option value="">All</option>
          {tags.map((t) => <option key={t} value={t}>{t}</option>)}
        </Select>
      </div>
      <div>
        <label htmlFor="pf-language" className="mb-1 block text-xs font-medium text-muted">Language</label>
        <Select id="pf-language" name="language" defaultValue={current.language ?? ""}>
          <option value="">All</option>
          <option value="da">da</option>
          <option value="en">en</option>
        </Select>
      </div>
      <div>
        <label htmlFor="pf-segment" className="mb-1 block text-xs font-medium text-muted">Segment</label>
        <Select id="pf-segment" name="segment" defaultValue={current.segment ?? ""}>
          <option value="">None</option>
          {segments.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </Select>
      </div>
      <div>
        <label htmlFor="pf-sort" className="mb-1 block text-xs font-medium text-muted">Sort</label>
        <Select id="pf-sort" name="sort" defaultValue={current.sort ?? "name"}>
          <option value="name">Name</option>
          <option value="email">Email</option>
          <option value="created">Newest</option>
        </Select>
      </div>
      <Button type="submit" variant="secondary">Apply</Button>
      {searchParams.size > 0 && (
        <Button type="button" variant="ghost" onClick={() => router.push("/panel")}>
          Clear
        </Button>
      )}
    </form>
  );
}
