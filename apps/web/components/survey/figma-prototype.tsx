"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { PrototypeTestConfig } from "@ok/domain";
import { Button } from "@/components/ui";
import type { InteractionPayload } from "./renderer";

const FIGMA_ORIGIN = "https://www.figma.com";
const MAX_EVENTS_PER_PROTOTYPE = 40;

type PrototypeAnswer = {
  reachedGoal: boolean;
  lastFrameId: string | null;
};

export function FigmaPrototype({
  code,
  config,
  value,
  onChange,
  interactions: interactionsRef,
}: {
  code: string;
  config: PrototypeTestConfig;
  value: unknown;
  onChange: (value: PrototypeAnswer) => void;
  interactions: React.RefObject<InteractionPayload[]>;
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const startedAtRef = useRef<number | null>(null);
  const lastFrameRef = useRef<string | null>(null);
  const lastClickRef = useRef<{ signature: string; at: number } | null>(null);
  const [consented, setConsented] = useState(!config.consentRequired);
  const [loaded, setLoaded] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const answer = value as PrototypeAnswer | undefined;
  const clientId = process.env.NEXT_PUBLIC_FIGMA_EMBED_CLIENT_ID?.trim();

  const src = useMemo(() => {
    if (!clientId || !config.fileKey || !config.startFrameId) return null;
    const params = new URLSearchParams({
      "embed-host": "cx-survey-platform",
      "client-id": clientId,
      "node-id": config.startFrameId.replaceAll(":", "-"),
      "starting-point-node-id": config.startFrameId.replaceAll(":", "-"),
      footer: "false",
    });
    if (config.versionId) params.set("version-id", config.versionId);
    return `https://embed.figma.com/proto/${encodeURIComponent(config.fileKey)}?${params.toString()}`;
  }, [clientId, config.fileKey, config.startFrameId, config.versionId]);

  useEffect(() => {
    if (!consented || !src) return;
    const startedAt = startedAtRef.current ?? Date.now();
    startedAtRef.current = startedAt;
    const append = (eventType: string, payload: Record<string, unknown>) => {
      const own = interactionsRef.current.filter((entry) => entry.code === code);
      if (own.length >= MAX_EVENTS_PER_PROTOTYPE) return;
      interactionsRef.current = [...interactionsRef.current, { code, eventType, payload }];
    };
    const recordFrame = (frameId: string, initial = false) => {
      if (!frameId || lastFrameRef.current === frameId) return;
      const previousFrameId = lastFrameRef.current;
      lastFrameRef.current = frameId;
      append("prototype_frame", {
        frameId,
        previousFrameId,
        elapsedMs: Date.now() - startedAt,
        initial,
      });
      onChange({ reachedGoal: Boolean(config.goalFrameId && frameId === config.goalFrameId), lastFrameId: frameId });
    };
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== FIGMA_ORIGIN || event.source !== iframeRef.current?.contentWindow) return;
      if (!event.data || typeof event.data !== "object") return;
      const message = event.data as { type?: unknown; data?: Record<string, unknown> };
      const data = message.data ?? {};
      if (message.type === "INITIAL_LOAD") {
        setLoaded(true);
        setStatus(null);
        recordFrame(config.startFrameId, true);
        return;
      }
      if (message.type === "PRESENTED_NODE_CHANGED") {
        recordFrame(typeof data.presentedNodeId === "string" ? data.presentedNodeId : "");
        return;
      }
      if (message.type === "LOGIN_SCREEN_SHOWN" || message.type === "PASSWORD_SCREEN_SHOWN") {
        const nextStatus = message.type === "LOGIN_SCREEN_SHOWN" ? "Figma-login kræves." : "Figma-password kræves.";
        setStatus(nextStatus);
        append("prototype_status", { status: message.type, elapsedMs: Date.now() - startedAt });
        return;
      }
      if (message.type !== "MOUSE_PRESS_OR_RELEASE") return;
      const frameId = typeof data.presentedNodeId === "string" ? data.presentedNodeId : lastFrameRef.current;
      const position = data.nearestScrollingFrameMousePosition;
      if (!frameId || !position || typeof position !== "object") return;
      const point = position as Record<string, unknown>;
      const x = Number(point.x);
      const y = Number(point.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;
      const signature = `${frameId}:${x}:${y}:${String(data.handled)}`;
      const now = Date.now();
      if (lastClickRef.current?.signature === signature && now - lastClickRef.current.at < 150) return;
      lastClickRef.current = { signature, at: now };
      append("prototype_click", {
        frameId,
        x,
        y,
        isMisclick: data.handled === false,
        targetNodeId: typeof data.targetNodeId === "string" ? data.targetNodeId : null,
        scrollingFrameId: typeof data.nearestScrollingFrameId === "string" ? data.nearestScrollingFrameId : null,
        elapsedMs: now - startedAt,
      });
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [code, config.goalFrameId, config.startFrameId, consented, interactionsRef, onChange, src]);

  if (!clientId) {
    return <p role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">Figma Embed API mangler konfiguration. Sæt NEXT_PUBLIC_FIGMA_EMBED_CLIENT_ID og registrér dette domæne som tilladt embed-origin.</p>;
  }
  if (!src) {
    return <p role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">Figma file key og starting frame mangler.</p>;
  }
  if (!consented) {
    return (
      <div className="rounded-lg border border-line bg-surface-raised p-4 text-sm">
        <p>Figma indlæses først efter samtykke. Figma kan kræve cookies, login eller prototype-password. Platformen gemmer frame-skift og klikpositioner.</p>
        <Button className="mt-3" onClick={() => { startedAtRef.current = Date.now(); setConsented(true); }}>Accepter og indlæs prototype</Button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <iframe
        ref={iframeRef}
        title="Figma prototype"
        src={src}
        className="h-[min(72vh,760px)] min-h-[520px] w-full rounded-lg border border-line bg-white"
        allowFullScreen
        allow="fullscreen"
        referrerPolicy="strict-origin-when-cross-origin"
      />
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
        <span>{loaded ? "Figma eventforbindelse aktiv" : "Venter på Figma…"}</span>
        {status && <span role="alert">{status}</span>}
        {answer?.reachedGoal && config.showSuccessScreen && <strong className="text-success">Målskærm nået</strong>}
      </div>
    </div>
  );
}
