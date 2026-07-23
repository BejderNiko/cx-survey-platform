import Link from "next/link";
import { can } from "@ok/domain";
import { Card, PageHeader, Table, Td, Th } from "@/components/ui";
import { requireSession } from "@/lib/auth";
import { withUser } from "@/lib/db";
import { fmtDate } from "@/lib/format";
import { SegmentBuilder, SegmentDeleteButton } from "./segment-builder";

export default async function SegmentsPage() {
  const session = await requireSession();
  const canManage = can(session.role, "segments.manage");

  const data = await withUser(session.userId, session.orgId, async (tx) => {
    const segments = await tx`
      select s.id, s.name, s.description, s.definition, s.created_at, u.full_name as author
      from segments s join users u on u.id = s.created_by
      order by s.name`;
    const fields = await tx`select key, label, field_type, options from custom_fields order by key`;
    const tags = await tx`select name from tags order by name`;
    return { segments, fields, tags: tags.map((t) => t.name as string) };
  });

  return (
    <div className="space-y-4">
      <PageHeader
        title="Segmenter"
        description="Genbrugelige panelistudvalg til udsendelser og analyse."
        actions={<Link href="/panel" className="text-sm text-accent hover:underline">← Panel</Link>}
      />

      <Card title="Gemte segmenter">
        <Table>
          <thead>
            <tr>
              <Th>Navn</Th><Th>Filtre</Th><Th>Oprettet af</Th><Th>Oprettet</Th>{canManage && <Th />}
            </tr>
          </thead>
          <tbody>
            {data.segments.map((s) => (
              <tr key={s.id}>
                <Td>
                  <Link href={`/panel?segment=${s.id}`} className="font-medium text-accent hover:underline">
                    {s.name}
                  </Link>
                  {s.description && <p className="text-xs text-muted">{s.description}</p>}
                </Td>
                <Td>
                  <code className="text-xs text-muted">
                    {(s.definition?.filters ?? [])
                      .map((f: { field: string; key?: string; op: string; value: unknown }) =>
                        `${f.field}${f.key ? `.${f.key}` : ""} ${f.op} ${JSON.stringify(f.value)}`)
                      .join(" OG ")}
                  </code>
                </Td>
                <Td>{s.author}</Td>
                <Td className="whitespace-nowrap text-muted">{fmtDate(s.created_at)}</Td>
                {canManage && (
                  <Td><SegmentDeleteButton segmentId={s.id} /></Td>
                )}
              </tr>
            ))}
            {data.segments.length === 0 && (
              <tr><Td colSpan={5} className="text-muted">Ingen segmenter gemt endnu.</Td></tr>
            )}
          </tbody>
        </Table>
      </Card>

      {canManage && (
        <Card title="Opret segment">
          <SegmentBuilder
            attributeFields={data.fields.map((f) => ({
              key: f.key as string,
              label: f.label as string,
              fieldType: f.field_type as string,
              options: (f.options as string[]) ?? [],
            }))}
            tags={data.tags}
          />
        </Card>
      )}
    </div>
  );
}
