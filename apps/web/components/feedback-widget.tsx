"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Button, Input, Textarea } from "@/components/ui";
import { createFeatureRequest } from "@/app/(app)/feature-requests/actions";

type SelectionRect = { left: number; top: number; width: number; height: number };
type Target = {
  tagName: string;
  id: string;
  role: string;
  ariaLabel: string;
  text: string;
  className: string;
  selection: SelectionRect;
  elementRect: SelectionRect;
  viewport: { width: number; height: number; devicePixelRatio: number };
};

function rectBetween(start: { x: number; y: number }, end: { x: number; y: number }): SelectionRect {
  return {
    left: Math.min(start.x, end.x),
    top: Math.min(start.y, end.y),
    width: Math.abs(end.x - start.x),
    height: Math.abs(end.y - start.y),
  };
}

function rectSnapshot(rect: DOMRect): SelectionRect {
  return { left: Math.round(rect.left), top: Math.round(rect.top), width: Math.round(rect.width), height: Math.round(rect.height) };
}

export function FeedbackWidget() {
  const [open, setOpen] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [draftRect, setDraftRect] = useState<SelectionRect | null>(null);
  const [target, setTarget] = useState<Target | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const captureRef = useRef<HTMLDivElement>(null);
  const startRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!selecting) return;
    const cancel = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSelecting(false);
        setDraftRect(null);
      }
    };
    document.addEventListener("keydown", cancel);
    return () => document.removeEventListener("keydown", cancel);
  }, [selecting]);

  function beginCapture(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    startRef.current = { x: event.clientX, y: event.clientY };
    setDraftRect({ left: event.clientX, top: event.clientY, width: 0, height: 0 });
  }

  function moveCapture(event: ReactPointerEvent<HTMLDivElement>) {
    if (!startRef.current) return;
    setDraftRect(rectBetween(startRef.current, { x: event.clientX, y: event.clientY }));
  }

  function endCapture(event: ReactPointerEvent<HTMLDivElement>) {
    const start = startRef.current;
    startRef.current = null;
    if (!start) return;
    const selection = rectBetween(start, { x: event.clientX, y: event.clientY });
    setDraftRect(null);
    if (selection.width < 8 || selection.height < 8) {
      setMessage("Drag over an area to capture it.");
      return;
    }

    const overlay = captureRef.current;
    if (overlay) overlay.style.pointerEvents = "none";
    const rawElement = document.elementFromPoint(selection.left + selection.width / 2, selection.top + selection.height / 2);
    if (overlay) overlay.style.pointerEvents = "auto";
    const element = rawElement?.closest("button,a,input,textarea,select,[role],h1,h2,h3,section,article") ?? rawElement;
    if (!(element instanceof HTMLElement)) {
      setMessage("No interface element found in selected area.");
      return;
    }
    if (element.closest("[data-feedback-widget]")) {
      setSelecting(false);
      setMessage("Select a page area outside the feedback panel.");
      return;
    }

    const text = (element.innerText || element.textContent || "").replace(/\s+/g, " ").trim().slice(0, 240);
    const elementRect = element.getBoundingClientRect();
    const nextTarget: Target = {
      tagName: element.tagName.toLowerCase(),
      id: element.id,
      role: element.getAttribute("role") ?? "",
      ariaLabel: element.getAttribute("aria-label") ?? "",
      text,
      className: String(element.className).slice(0, 240),
      selection,
      elementRect: rectSnapshot(elementRect),
      viewport: { width: window.innerWidth, height: window.innerHeight, devicePixelRatio: window.devicePixelRatio },
    };
    element.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
    setTarget(nextTarget);
    setTitle(`Feedback on ${nextTarget.tagName}${nextTarget.id ? `#${nextTarget.id}` : ""}`);
    setMessage("Area captured. Add context and send it as a feature request.");
    setSelecting(false);
    setOpen(true);
  }

  async function submit() {
    const sourceType = target ? "feedback" : "manual";
    const result = await createFeatureRequest({
      title,
      description,
      sourceType,
      sourcePath: window.location.pathname,
      section: target?.id || target?.tagName || "page",
      targetSnapshot: target ?? { sourceType: "manual" },
    });
    setMessage(result.ok ? "Feedback added to feature requests." : result.error);
    if (result.ok) {
      setDescription("");
      setTarget(null);
      setTitle("");
    }
  }

  return (
    <>
      {selecting && (
        <div
          ref={captureRef}
          className="fixed inset-0 z-[80] cursor-crosshair bg-[#460019]/10"
          onPointerDown={beginCapture}
          onPointerMove={moveCapture}
          onPointerUp={endCapture}
        >
          <div className="pointer-events-none fixed left-1/2 top-5 -translate-x-1/2 rounded-full bg-[#460019] px-4 py-2 text-xs font-medium text-white shadow-pop">
            Drag to select UI area · Escape to cancel
          </div>
          {draftRect && <div className="pointer-events-none fixed border-2 border-accent bg-accent/10" style={draftRect} />}
        </div>
      )}
      <div data-feedback-widget className="fixed bottom-4 right-4 z-50">
        {!open ? (
          <Button size="sm" onClick={() => { setOpen(true); setMessage(null); }}>Give feedback</Button>
        ) : (
          <div className="w-[min(380px,calc(100vw-2rem))] rounded-xl border border-line bg-surface p-4 shadow-pop">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-heading">Give feedback</h2>
              <button type="button" className="text-xs text-muted underline" onClick={() => { setOpen(false); setSelecting(false); }}>Close</button>
            </div>
            <p className="mt-1 text-xs leading-5 text-muted">Drag over the part of page you want to comment on, like a clipping tool.</p>
            <Button size="sm" variant="secondary" className="mt-3" onClick={() => { setMessage(null); setSelecting(true); }}>{target ? "Capture another area" : "Capture UI area"}</Button>
            {target && (
              <div className="mt-2 rounded-lg border border-accent/20 bg-accent-wash px-3 py-2 text-xs">
                <p className="font-medium text-heading">Captured: {target.tagName}{target.id ? `#${target.id}` : ""}</p>
                <p className="mt-1 text-muted">{target.selection.width} × {target.selection.height}px · {target.text || "No visible text"}</p>
              </div>
            )}
            <Input className="mt-3" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Short title" maxLength={160} />
            <Textarea className="mt-2" rows={4} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="What should improve?" maxLength={5000} />
            <Button className="mt-2" disabled={!title.trim() || !description.trim()} onClick={submit}>Add to feature requests</Button>
            {message && <p role="status" className="mt-2 text-xs text-muted">{message}</p>}
          </div>
        )}
      </div>
    </>
  );
}