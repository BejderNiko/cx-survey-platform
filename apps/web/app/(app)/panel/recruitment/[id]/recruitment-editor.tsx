"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Card, Input, Label, Select, Textarea } from "@/components/ui";
import { CUSTOM_FIELD_TYPE, LOGO_POSITION, label as dkLabel } from "@/lib/labels";
import type { RecruitmentPageDetail, RecruitmentPagePatch } from "../actions";
import {
  addQuestionToPage,
  createAndAttachQuestion,
  deleteRecruitmentPage,
  removeQuestionFromPage,
  setQuestionRequired,
  setRecruitmentPageLink,
  updateRecruitmentPage,
} from "../actions";

interface QuestionRow {
  id: string; key: string; label: string; fieldType: string; options: string[]; required: boolean; position: number;
}
interface AvailableField {
  id: string; key: string; label: string; fieldType: string; options: string[];
}

const FIELD_TYPES = ["text", "number", "boolean", "select", "multi_select", "date"] as const;

function ImageField({
  label, value, onChange,
}: {
  label: string;
  value: string | null;
  onChange: (v: string | null) => void;
}) {
  return (
    <div>
      <Label>{label}</Label>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          className="flex-1"
          placeholder="Billed-URL eller data-URI"
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value || null)}
        />
        {value && (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={value} alt="" className="h-10 w-10 rounded border border-line object-cover" />
            <Button size="sm" variant="ghost" onClick={() => onChange(null)}>Fjern</Button>
          </>
        )}
      </div>
    </div>
  );
}

export function RecruitmentEditor({
  page, questions: initialQuestions, availableFields: initialAvailable,
}: {
  page: RecruitmentPageDetail;
  questions: QuestionRow[];
  availableFields: AvailableField[];
}) {
  const router = useRouter();
  const [form, setForm] = useState({
    internal_name: page.internalName,
    language: page.language,
    background_color: page.backgroundColor,
    some_thumbnail_url: page.someThumbnailUrl,
    page_title: page.pageTitle,
    page_content: page.pageContent,
    header_image_url: page.headerImageUrl,
    background_image_url: page.backgroundImageUrl,
    header_logo_position: page.headerLogoPosition,
    thank_you_content: page.thankYouContent,
    confirmation_email_title: page.confirmationEmailTitle,
    confirmation_email_content: page.confirmationEmailContent,
    confirmation_email_sender_name: page.confirmationEmailSenderName,
    screening_enabled: page.screeningEnabled,
    screening_question_content: page.screeningQuestionContent,
    screening_continue_label: page.screeningContinueLabel,
    screening_end_label: page.screeningEndLabel,
    screening_end_content: page.screeningEndContent,
  });
  const [linkValue, setLinkValue] = useState(page.publicToken);
  const [linkMsg, setLinkMsg] = useState<string | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [newQuestionField, setNewQuestionField] = useState("");
  const [showNewQuestion, setShowNewQuestion] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newType, setNewType] = useState<string>("text");
  const [newOptions, setNewOptions] = useState("");
  const [pending, startTransition] = useTransition();

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    setSaveMsg(null);
  }

  return (
    <div className="space-y-4">
      <Card title="Udseende">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="rp-name">Internt navn (vises ikke)</Label>
            <Input id="rp-name" value={form.internal_name} onChange={(e) => set("internal_name", e.target.value)} />
          </div>
          <div>
            <Label htmlFor="rp-bg">Baggrundsfarve</Label>
            <div className="flex items-center gap-2">
              <input type="color" className="h-9 w-12 rounded border border-line" value={form.background_color}
                onChange={(e) => set("background_color", e.target.value)} />
              <Input className="flex-1" value={form.background_color} onChange={(e) => set("background_color", e.target.value)} />
            </div>
          </div>
          <div>
            <Label htmlFor="rp-lang">Sprog</Label>
            <Select id="rp-lang" value={form.language} onChange={(e) => set("language", e.target.value)}>
              <option value="da">Dansk</option>
              <option value="en">Engelsk</option>
            </Select>
          </div>
          <ImageField label="SoMe-thumbnail" value={form.some_thumbnail_url} onChange={(v) => set("some_thumbnail_url", v)} />
        </div>
      </Card>

      <Card title="Sidelink">
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex-1" style={{ minWidth: 240 }}>
            <Label htmlFor="rp-link">Link til denne side</Label>
            <Input id="rp-link" value={linkValue} onChange={(e) => { setLinkValue(e.target.value); setLinkError(null); setLinkMsg(null); }} />
          </div>
          <Button
            variant="secondary"
            disabled={pending || linkValue === page.publicToken}
            onClick={() =>
              startTransition(async () => {
                setLinkError(null); setLinkMsg(null);
                try {
                  await setRecruitmentPageLink(page.id, linkValue);
                  setLinkMsg("Linket er opdateret.");
                  router.refresh();
                } catch (e) {
                  setLinkError(e instanceof Error ? e.message : "Linket kunne ikke gemmes.");
                }
              })
            }
          >
            Gem link
          </Button>
        </div>
        {linkMsg && <p className="mt-1 text-sm text-success">{linkMsg}</p>}
        {linkError && <p role="alert" className="mt-1 text-sm text-danger">{linkError}</p>}
      </Card>

      <Card title="Side">
        <div className="space-y-3">
          <div>
            <Label htmlFor="rp-title">Sidetitel (vises)</Label>
            <Input id="rp-title" value={form.page_title} onChange={(e) => set("page_title", e.target.value)} />
          </div>
          <div>
            <Label htmlFor="rp-content">Sideindhold</Label>
            <Textarea id="rp-content" rows={4} value={form.page_content} onChange={(e) => set("page_content", e.target.value)} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <ImageField label="Header-billede" value={form.header_image_url} onChange={(v) => set("header_image_url", v)} />
            <ImageField label="Baggrundsbillede" value={form.background_image_url} onChange={(v) => set("background_image_url", v)} />
          </div>
          <div>
            <Label htmlFor="rp-logopos">Placering af header-logo</Label>
            <Select id="rp-logopos" value={form.header_logo_position} onChange={(e) => set("header_logo_position", e.target.value)}>
              {["left", "center", "right"].map((p) => <option key={p} value={p}>{dkLabel(LOGO_POSITION, p)}</option>)}
            </Select>
          </div>
        </div>
      </Card>

      <Card title="Takkeside">
        <Label htmlFor="rp-thanks">Indhold</Label>
        <Textarea id="rp-thanks" rows={3} value={form.thank_you_content} onChange={(e) => set("thank_you_content", e.target.value)} />
      </Card>

      <Card title="Bekræftelsesmail">
        <div className="space-y-3">
          <div>
            <Label htmlFor="rp-email-title">Titel</Label>
            <Input id="rp-email-title" value={form.confirmation_email_title} onChange={(e) => set("confirmation_email_title", e.target.value)} />
          </div>
          <div>
            <Label htmlFor="rp-email-content">Indhold</Label>
            <Textarea id="rp-email-content" rows={4} value={form.confirmation_email_content} onChange={(e) => set("confirmation_email_content", e.target.value)} />
          </div>
          <div>
            <Label htmlFor="rp-email-sender">Afsendernavn</Label>
            <Input id="rp-email-sender" value={form.confirmation_email_sender_name} onChange={(e) => set("confirmation_email_sender_name", e.target.value)} />
          </div>
        </div>
      </Card>

      <Card title="Screeningsspørgsmål">
        <div className="space-y-3">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.screening_enabled} onChange={(e) => set("screening_enabled", e.target.checked)} />
            Screeningsspørgsmål aktivt
          </label>
          {form.screening_enabled && (
            <>
              <div>
                <Label htmlFor="rp-screen-q">Spørgsmål</Label>
                <Textarea id="rp-screen-q" rows={3} value={form.screening_question_content} onChange={(e) => set("screening_question_content", e.target.value)} />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label htmlFor="rp-screen-continue">Knap 1 (fortsæt)</Label>
                  <Input id="rp-screen-continue" value={form.screening_continue_label} onChange={(e) => set("screening_continue_label", e.target.value)} />
                </div>
                <div>
                  <Label htmlFor="rp-screen-end">Knap 2 (afslut)</Label>
                  <Input id="rp-screen-end" value={form.screening_end_label} onChange={(e) => set("screening_end_label", e.target.value)} />
                </div>
              </div>
              <div>
                <Label htmlFor="rp-screen-endcontent">Indhold ved afslutning af flow</Label>
                <Textarea id="rp-screen-endcontent" rows={2} value={form.screening_end_content} onChange={(e) => set("screening_end_content", e.target.value)} />
              </div>
            </>
          )}
        </div>
      </Card>

      <Card title="Spørgsmål">
        <p className="mb-2 text-xs text-muted">Navn og e-mail medtages altid.</p>
        <ul className="space-y-1.5">
          {initialQuestions.map((q) => (
            <li key={q.id} className="flex flex-wrap items-center gap-2 rounded-md border border-line px-3 py-2 text-sm">
              <span className="font-medium">{q.label}</span>
              <Badge>{dkLabel(CUSTOM_FIELD_TYPE, q.fieldType)}</Badge>
              <label className="ml-auto flex items-center gap-1.5 text-xs">
                <input
                  type="checkbox"
                  checked={q.required}
                  onChange={(e) =>
                    startTransition(async () => {
                      await setQuestionRequired(page.id, q.id, e.target.checked);
                      router.refresh();
                    })
                  }
                />
                Obligatorisk
              </label>
              <button
                className="px-1 text-muted hover:text-danger cursor-pointer"
                aria-label={`Fjern ${q.label}`}
                onClick={() =>
                  startTransition(async () => {
                    await removeQuestionFromPage(page.id, q.id);
                    router.refresh();
                  })
                }
              >
                ×
              </button>
            </li>
          ))}
          {initialQuestions.length === 0 && <li className="text-sm text-muted">Ingen spørgsmål tilføjet endnu.</li>}
        </ul>

        <div className="mt-3 flex flex-wrap items-end gap-2">
          <div>
            <Label htmlFor="rp-add-q">Vælg et rekrutteringsspørgsmål</Label>
            <Select id="rp-add-q" value={newQuestionField} onChange={(e) => setNewQuestionField(e.target.value)}>
              <option value="">vælg…</option>
              {initialAvailable.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
            </Select>
          </div>
          <Button
            size="sm"
            variant="secondary"
            disabled={!newQuestionField || pending}
            onClick={() =>
              startTransition(async () => {
                await addQuestionToPage(page.id, newQuestionField);
                setNewQuestionField("");
                router.refresh();
              })
            }
          >
            Tilføj
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setShowNewQuestion((s) => !s)}>
            {showNewQuestion ? "Fortryd" : "+ Opret nyt spørgsmål"}
          </Button>
        </div>

        {showNewQuestion && (
          <div className="mt-3 space-y-2 rounded-md border border-line bg-surface-raised p-3">
            <div className="flex flex-wrap items-end gap-2">
              <div className="w-56">
                <Label htmlFor="rp-new-q-label">Spørgsmål</Label>
                <Input id="rp-new-q-label" value={newLabel} onChange={(e) => setNewLabel(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="rp-new-q-type">Type</Label>
                <Select id="rp-new-q-type" value={newType} onChange={(e) => setNewType(e.target.value)}>
                  {FIELD_TYPES.map((t) => <option key={t} value={t}>{dkLabel(CUSTOM_FIELD_TYPE, t)}</option>)}
                </Select>
              </div>
              {(newType === "select" || newType === "multi_select") && (
                <div className="w-64">
                  <Label htmlFor="rp-new-q-opts">Svarmuligheder (kommasepareret)</Label>
                  <Input id="rp-new-q-opts" value={newOptions} onChange={(e) => setNewOptions(e.target.value)} placeholder="fx Ja, Nej, Ved ikke" />
                </div>
              )}
              <Button
                size="sm"
                disabled={!newLabel.trim() || pending}
                onClick={() =>
                  startTransition(async () => {
                    await createAndAttachQuestion(page.id, newLabel, newType, newOptions);
                    setNewLabel(""); setNewOptions(""); setShowNewQuestion(false);
                    router.refresh();
                  })
                }
              >
                Opret og tilføj
              </Button>
            </div>
          </div>
        )}
      </Card>

      <div className="flex items-center gap-2">
        {!confirmingDelete ? (
          <Button variant="danger" onClick={() => setConfirmingDelete(true)}>Slet side</Button>
        ) : (
          <>
            <span className="text-sm text-danger">Sikker? Dette kan ikke fortrydes.</span>
            <Button variant="danger" disabled={pending} onClick={() => startTransition(() => deleteRecruitmentPage(page.id))}>
              Bekræft sletning
            </Button>
            <Button variant="secondary" onClick={() => setConfirmingDelete(false)}>Annullér</Button>
          </>
        )}
        <Button
          className="ml-auto"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              await updateRecruitmentPage(page.id, form as RecruitmentPagePatch);
              setSaveMsg("Gemt.");
            })
          }
        >
          Gem
        </Button>
        {saveMsg && <span className="text-sm text-success">{saveMsg}</span>}
      </div>
    </div>
  );
}
