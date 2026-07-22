"use client";

import { useState, useTransition } from "react";
import { Badge, Button, Card, Input, Textarea } from "@/components/ui";
import { addNote, addTagToPanelist, anonymizePanelist, removeTagFromPanelist } from "../actions";

export function ProfileActions({
  panelistId,
  tags,
  notes,
  canEdit,
  canAnonymize,
}: {
  panelistId: string;
  tags: { id: string; name: string }[];
  notes: { id: string; body: string; author: string; createdAt: string }[];
  canEdit: boolean;
  canAnonymize: boolean;
}) {
  const [newTag, setNewTag] = useState("");
  const [noteBody, setNoteBody] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <Card title="Tags, noter og databeskyttelse">
      <div>
        <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted">Tags</h3>
        <div className="flex flex-wrap items-center gap-1.5">
          {tags.map((t) => (
            <span key={t.id} className="inline-flex items-center gap-1">
              <Badge>{t.name}</Badge>
              {canEdit && (
                <button
                  aria-label={`Fjern tagget ${t.name}`}
                  className="text-xs text-muted hover:text-danger cursor-pointer"
                  onClick={() => startTransition(() => removeTagFromPanelist(panelistId, t.id))}
                >
                  ×
                </button>
              )}
            </span>
          ))}
          {tags.length === 0 && <span className="text-sm text-muted">Ingen tags.</span>}
        </div>
        {canEdit && (
          <div className="mt-2 flex gap-2">
            <Input
              aria-label="Nyt tag"
              placeholder="tilføj tag"
              value={newTag}
              onChange={(e) => setNewTag(e.target.value)}
              className="h-7 w-36 text-xs"
            />
            <Button
              size="sm"
              variant="secondary"
              disabled={pending || !newTag.trim()}
              onClick={() =>
                startTransition(async () => {
                  await addTagToPanelist(panelistId, newTag);
                  setNewTag("");
                })
              }
            >
              Tilføj
            </Button>
          </div>
        )}
      </div>

      <div className="mt-4">
        <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted">Noter</h3>
        <ul className="space-y-2">
          {notes.map((n) => (
            <li key={n.id} className="rounded-lg border border-line bg-surface-raised px-2.5 py-1.5 text-sm">
              <p>{n.body}</p>
              <p className="mt-0.5 text-xs text-muted">
                {n.author} · {n.createdAt}
              </p>
            </li>
          ))}
          {notes.length === 0 && <li className="text-sm text-muted">Ingen noter.</li>}
        </ul>
        {canEdit && (
          <div className="mt-2 space-y-2">
            <Textarea
              aria-label="Ny note"
              rows={2}
              placeholder="Skriv en note…"
              value={noteBody}
              onChange={(e) => setNoteBody(e.target.value)}
            />
            <Button
              size="sm"
              variant="secondary"
              disabled={pending || !noteBody.trim()}
              onClick={() =>
                startTransition(async () => {
                  await addNote(panelistId, noteBody);
                  setNoteBody("");
                })
              }
            >
              Gem note
            </Button>
          </div>
        )}
      </div>

      {canAnonymize && (
        <div className="mt-4 border-t border-line pt-3">
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted">GDPR</h3>
          {!confirming ? (
            <Button size="sm" variant="danger" onClick={() => setConfirming(true)}>
              Anonymisér panelist…
            </Button>
          ) : (
            <div className="rounded-lg border border-danger/30 bg-red-50 p-2.5 text-xs">
              <p className="mb-2">
                Dette fjerner uigenkaldeligt alle identitetsdata og bryder koblingen til
                eksisterende besvarelser. Det kan ikke fortrydes.
              </p>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="danger"
                  disabled={pending}
                  onClick={() => startTransition(() => anonymizePanelist(panelistId))}
                >
                  Bekræft anonymisering
                </Button>
                <Button size="sm" variant="secondary" onClick={() => setConfirming(false)}>
                  Annullér
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
