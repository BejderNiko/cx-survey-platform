"use client";

import { useEffect, useState } from "react";
import { Button, Input, Textarea } from "@/components/ui";
import { createFeatureRequest } from "@/app/(app)/feature-requests/actions";

type Target = { tagName: string; id: string; role: string; ariaLabel: string; text: string; className: string };

export function FeedbackWidget() {
  const [open, setOpen] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [target, setTarget] = useState<Target | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => {
    if (!selecting) return;
    const pick = (event: MouseEvent) => {
      const element = event.target instanceof HTMLElement ? event.target : null;
      if (!element || element.closest("[data-feedback-widget]")) return;
      event.preventDefault();
      event.stopPropagation();
      const text = (element.innerText || element.textContent || "").replace(/\s+/g, " ").trim().slice(0, 160);
      setTarget({ tagName: element.tagName.toLowerCase(), id: element.id, role: element.getAttribute("role") ?? "", ariaLabel: element.getAttribute("aria-label") ?? "", text, className: String(element.className).slice(0, 240) });
      setTitle(`Feedback på ${element.tagName.toLowerCase()}${element.id ? `#${element.id}` : ""}`);
      setSelecting(false);
      setOpen(true);
    };
    document.addEventListener("click", pick, true);
    return () => document.removeEventListener("click", pick, true);
  }, [selecting]);
  async function submit() {
    const result = await createFeatureRequest({ title, description, sourcePath: window.location.pathname, section: target?.id || target?.tagName || "side", targetSnapshot: target ?? {} });
    setMessage(result.ok ? "Feedback gemt." : result.error);
    if (result.ok) { setDescription(""); setTarget(null); }
  }
  return <div data-feedback-widget className="fixed bottom-4 right-4 z-50">
    {!open ? <Button size="sm" onClick={() => setOpen(true)}>Feedback</Button> : <div className="w-[min(360px,calc(100vw-2rem))] rounded-xl border border-line bg-surface p-4 shadow-pop">
      <div className="flex items-center justify-between gap-3"><h2 className="text-sm font-semibold">Giv feedback</h2><button type="button" className="text-xs text-muted underline" onClick={() => setOpen(false)}>Luk</button></div>
      <p className="mt-1 text-xs text-muted">Vælg element på siden, og skriv hvad der skal forbedres.</p>
      <Button size="sm" variant="secondary" className="mt-3" onClick={() => setSelecting(true)}>{selecting ? "Klik på element…" : target ? "Vælg andet element" : "Markér element"}</Button>
      {target && <p className="mt-2 rounded bg-background px-2 py-1 text-xs">Valgt: {target.tagName}{target.id ? `#${target.id}` : ""} {target.text}</p>}
      <Input className="mt-3" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Kort titel" maxLength={160} />
      <Textarea className="mt-2" rows={4} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Hvad skal forbedres?" maxLength={5000} />
      <Button className="mt-2" disabled={!title.trim() || !description.trim()} onClick={submit}>Send feedback</Button>
      {message && <p role="status" className="mt-2 text-xs text-muted">{message}</p>}
    </div>}
  </div>;
}