import Link from "next/link";
import { notFound } from "next/navigation";
import { can } from "@ok/domain";
import { Badge, Card, PageHeader, Table, Td, Th } from "@/components/ui";
import { requireSession } from "@/lib/auth";
import { withUser } from "@/lib/db";
import { getPanelistProfile } from "@/lib/data/panel";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { CONSENT_STATUS, CONTACT_EVENT, CUSTOMER_STATUS, LIFECYCLE, RESPONSE_STATUS, label } from "@/lib/labels";
import { ProfileActions } from "./profile-actions";

export default async function PanelistProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  const { id } = await params;
  const profile = await withUser(session.userId, (tx) => getPanelistProfile(tx, id));
  if (!profile) notFound();
  const p = profile.panelist;
  const name = [p.first_name, p.last_name].filter(Boolean).join(" ") || "(anonymiseret)";
  const canEdit = can(session.role, "panel.edit");
  const canAnonymize = can(session.role, "panel.anonymize");

  return (
    <div className="space-y-4">
      <PageHeader
        title={name}
        description={
          <>
            {p.external_id ? `Eksternt id ${p.external_id} · ` : ""}
            i panelet siden {fmtDate(p.created_at)}
            {p.import_filename ? ` · importeret fra ${p.import_filename}` : ""}
          </>
        }
        actions={<Link href="/panel" className="text-sm text-accent hover:underline">← Panel</Link>}
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Identitet og kontakt">
          <dl className="space-y-1.5 text-sm">
            {[
              ["E-mail", p.email ?? "—"],
              ["Telefon", p.phone ?? "—"],
              ["Sprog", p.language === "da" ? "dansk" : p.language === "en" ? "engelsk" : p.language],
              ["Fødselsår", p.birth_year ?? "—"],
              ["Køn", p.gender ?? "—"],
              ["By", p.city ? `${p.postal_code ?? ""} ${p.city}` : "—"],
              ["Land", p.country],
              ["Kundestatus", label(CUSTOMER_STATUS, p.customer_status)],
              ["Rekrutteringskilde", p.recruitment_source ?? "—"],
            ].map(([k, v]) => (
              <div key={String(k)} className="flex justify-between gap-3">
                <dt className="text-muted">{k}</dt>
                <dd className="text-right">{String(v)}</dd>
              </div>
            ))}
            <div className="flex justify-between gap-3">
              <dt className="text-muted">Livscyklus</dt>
              <dd>
                <Badge tone={p.lifecycle === "active" ? "green" : p.lifecycle === "anonymized" ? "gray" : "amber"}>
                  {label(LIFECYCLE, p.lifecycle)}
                </Badge>
              </dd>
            </div>
          </dl>
        </Card>

        <Card title="Profilattributter">
          {profile.attributes.length === 0 ? (
            <p className="text-sm text-muted">Ingen brugerdefinerede attributter.</p>
          ) : (
            <dl className="space-y-1.5 text-sm">
              {profile.attributes.map((a) => (
                <div key={a.key} className="flex justify-between gap-3">
                  <dt className="text-muted">{a.label}</dt>
                  <dd className="text-right">
                    {Array.isArray(a.value) ? (a.value as string[]).join(", ") : String(a.value)}
                  </dd>
                </div>
              ))}
            </dl>
          )}
          <h3 className="mt-4 mb-1 text-xs font-semibold uppercase tracking-wider text-muted">Samtykke</h3>
          <ul className="space-y-1 text-sm">
            {profile.consents.map((c, i) => (
              <li key={i} className="flex items-center justify-between gap-2">
                <span>{c.purpose}</span>
                <span className="flex items-center gap-2 text-xs text-muted">
                  {c.status === "granted"
                    ? `givet ${fmtDate(c.granted_at)}`
                    : `${label(CONSENT_STATUS, c.status).toLowerCase()} ${fmtDate(c.withdrawn_at ?? c.granted_at)}`}
                  <Badge tone={c.status === "granted" ? "green" : "red"}>{label(CONSENT_STATUS, c.status)}</Badge>
                </span>
              </li>
            ))}
          </ul>
        </Card>

        <ProfileActions
          panelistId={p.id}
          tags={profile.tags.map((t) => ({ id: t.id as string, name: t.name as string }))}
          notes={profile.notes.map((n) => ({
            id: n.id as string,
            body: n.body as string,
            author: n.author as string,
            createdAt: fmtDateTime(n.created_at),
          }))}
          canEdit={canEdit}
          canAnonymize={canAnonymize && p.lifecycle !== "anonymized"}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Deltagelse i undersøgelser">
          <Table>
            <thead>
              <tr><Th>Studie</Th><Th>Status</Th><Th>Påbegyndt</Th></tr>
            </thead>
            <tbody>
              {profile.participation.map((r) => (
                <tr key={r.id}>
                  <Td>{r.study_title}</Td>
                  <Td><Badge tone={r.status === "completed" ? "green" : "amber"}>{label(RESPONSE_STATUS, r.status)}</Badge></Td>
                  <Td className="text-muted whitespace-nowrap">{fmtDateTime(r.started_at)}</Td>
                </tr>
              ))}
              {profile.participation.length === 0 && (
                <tr><Td colSpan={3} className="text-muted">Ingen deltagelse endnu.</Td></tr>
              )}
            </tbody>
          </Table>
        </Card>

        <Card title="Kontakthistorik (seneste 50)">
          <Table>
            <thead>
              <tr><Th>Hændelse</Th><Th>Udsendelse</Th><Th>Tidspunkt</Th></tr>
            </thead>
            <tbody>
              {profile.contacts.map((c, i) => (
                <tr key={i}>
                  <Td><Badge tone={c.event_type === "responded" ? "green" : c.event_type === "bounced" ? "red" : "gray"}>{label(CONTACT_EVENT, c.event_type)}</Badge></Td>
                  <Td>{c.distribution_name ?? "—"}</Td>
                  <Td className="text-muted whitespace-nowrap">{fmtDateTime(c.occurred_at)}</Td>
                </tr>
              ))}
              {profile.contacts.length === 0 && (
                <tr><Td colSpan={3} className="text-muted">Ingen kontakthændelser.</Td></tr>
              )}
            </tbody>
          </Table>
        </Card>
      </div>
    </div>
  );
}
