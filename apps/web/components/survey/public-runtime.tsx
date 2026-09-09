"use client";

import { useCallback, useRef, useSyncExternalStore } from "react";
import { participantDeviceAllows, type InstrumentDefinition, type Locale } from "@ok/domain";
import { SurveyRenderer, type AnswerPayload, type InteractionPayload } from "./renderer";

type Viewport = "desktop" | "mobile";

function getViewport(): Viewport {
  return window.innerWidth < 640 ? "mobile" : "desktop";
}

function subscribeViewport(onChange: () => void) {
  window.addEventListener("resize", onChange);
  return () => window.removeEventListener("resize", onChange);
}

function getServerViewport(): null {
  return null;
}

/** Live wrapper: starts the response lazily and submits on completion. */
export function PublicRuntime({
  token,
  definition,
  studyTitle,
  language,
}: {
  token: string;
  definition: InstrumentDefinition;
  studyTitle: string;
  language?: string | null;
}) {
  const responseIdPromise = useRef<Promise<string | null> | null>(null);
  const viewport = useSyncExternalStore(subscribeViewport, getViewport, getServerViewport);
  const deviceAllowed = viewport === null ? null : participantDeviceAllows(definition.participantDevice, viewport);
  const requestedLanguage = language === "en" || language === "da" ? language : null;
  const resolvedLanguage: Locale = requestedLanguage && definition.languages.includes(requestedLanguage)
    ? requestedLanguage
    : definition.defaultLanguage;


  const ensureStarted = useCallback((): Promise<string | null> => {
    if (deviceAllowed !== true) return Promise.resolve(null);
    if (responseIdPromise.current) return responseIdPromise.current;
    const pending = fetch("/api/respond/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token,
        language: resolvedLanguage,
        viewport: typeof window !== "undefined" && window.innerWidth < 640 ? "mobile" : "desktop",
      }),
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((body) => body?.responseId ?? null)
      .catch(() => null);
    responseIdPromise.current = pending;
    void pending.then((responseId) => {
      if (!responseId && responseIdPromise.current === pending) responseIdPromise.current = null;
    });
    return pending;
  }, [deviceAllowed, token, resolvedLanguage]);

  const onComplete = useCallback(
    async (result: {
      status: "completed" | "disqualified";
      answers: AnswerPayload[];
      interactions: InteractionPayload[];
    }) => {
      const responseId = await ensureStarted();
      if (!responseId) throw new Error("Could not start response.");
      const response = await fetch("/api/respond/complete", {
        method: "POST",
        keepalive: true,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          responseId,
          token,
          status: result.status,
          answers: result.answers,
          interactions: result.interactions.map((interaction) => ({
            code: interaction.code,
            eventType: interaction.eventType,
            payload: interaction.payload,
          })),
        }),
      });
      if (!response.ok) throw new Error("Could not save response.");
    },
    [ensureStarted, token],
  );

  return (
    <div
      // Start tracking as soon as the respondent interacts at all.
      onPointerDown={() => void ensureStarted()}
      onKeyDown={() => void ensureStarted()}
    >
      {deviceAllowed === false ? (
        <p role="alert" className="mx-auto max-w-xl rounded-lg border border-line bg-surface p-6 text-center">
          Denne undersøgelse kan ikke besvares fra denne enhed.
        </p>
      ) : deviceAllowed === null ? (
        <p className="mx-auto max-w-xl p-6 text-center text-muted">Indlæser undersøgelse…</p>
      ) : (
        <SurveyRenderer
          definition={definition}
          locale={resolvedLanguage}
          mode="live"
          studyTitle={studyTitle}
          onComplete={onComplete}
          assetToken={token}
        />
      )}
    </div>
  );
}
