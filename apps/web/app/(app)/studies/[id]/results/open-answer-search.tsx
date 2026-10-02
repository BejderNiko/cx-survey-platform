"use client";

import { useMemo, useState } from "react";
import { Card, Input, Td, Th, Table } from "@/components/ui";

type OpenAnswer = { responseId: string; questionCode: string; questionLabel: string; text: string };

export function OpenAnswerSearch({ items }: { items: OpenAnswer[] }) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("da");
    if (!needle) return items;
    return items.filter((item) => `${item.questionLabel} ${item.questionCode} ${item.text}`.toLocaleLowerCase("da").includes(needle));
  }, [items, query]);
  return (
    <Card title={`Åbne svar (${filtered.length} af ${items.length})`}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted">Søgning bruger samme filtrerede svarbase som resultaterne. Tagging afventer.</p>
        <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Søg i åbne svar" aria-label="Søg i åbne svar" className="max-w-sm" />
      </div>
      <div className="overflow-x-auto">
        <Table>
          <thead><tr><Th>Spørgsmål</Th><Th>Svar</Th><Th>Respondent</Th></tr></thead>
          <tbody>
            {filtered.slice(0, 200).map((item) => <tr key={`${item.responseId}-${item.questionCode}`}><Td>{item.questionLabel}</Td><Td className="whitespace-pre-wrap">{item.text}</Td><Td className="font-mono text-xs">{item.responseId.slice(0, 8)}</Td></tr>)}
            {filtered.length === 0 && <tr><Td colSpan={3}>Ingen åbne svar matcher søgningen.</Td></tr>}
          </tbody>
        </Table>
      </div>
      {filtered.length > 200 && <p className="mt-2 text-xs text-muted">Viser 200 af {filtered.length}. Brug CSV-eksport til komplet udtræk.</p>}
    </Card>
  );
}