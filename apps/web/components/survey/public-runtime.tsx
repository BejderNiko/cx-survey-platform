"use client";

import { useCallback, useRef } from "react";
import type { InstrumentDefinition, Locale } from "@ok/domain";
import { SurveyRenderer, type AnswerPayload, type InteractionPayload } from "./renderer";

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
  const requestedLanguage = language === "en" || language === "da" ? language : null;
  const resolvedLanguage: Locale = requestedLanguage && definition.languages.includes(requestedLanguage)
    ? requestedLanguage
    : definition.defaultLanguage;


  const ensureStarted = useCallback((): Promise<string | null> => {
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
  }, [token, resolvedLanguage]);

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
      <SurveyRenderer
        definition={definition}
        locale={resolvedLanguage}
        mode="live"
        studyTitle={studyTitle}
        onComplete={onComplete}
        assetToken={token}
      />
    </div>
  );
}
