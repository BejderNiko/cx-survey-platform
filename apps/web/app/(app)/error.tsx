"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui";

type ErrorWithDigest = Error & { digest?: string };

/** Fejlgrænse for app-sektionen: manglende rettigheder og uventede fejl. */
export default function AppError({ error, reset }: { error: ErrorWithDigest; reset: () => void }) {
  const isPermission = error.message.includes("not allowed to perform");
  const [generatedReference] = useState(() =>
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? `ERR-${crypto.randomUUID().slice(0, 8).toUpperCase()}`
      : "ERR-UKENDT",
  );
  const reference = error.digest ?? generatedReference;

  useEffect(() => {
    // Safe correlation only: never send message, stack, SQL, tokens or respondent data.
    console.error("App route error reference", { reference });
  }, [reference]);

  return (
    <div className="mx-auto mt-16 max-w-md rounded-xl border border-line bg-surface p-6 text-center shadow-card">
      <h1 className="font-display text-lg text-heading">
        {isPermission ? "Ingen adgang" : "Siden kunne ikke indlæses"}
      </h1>
      <p className="mt-2 text-sm text-muted">
        {isPermission
          ? "Din rolle har ikke adgang til denne side. Kontakt en administrator, hvis du mener, du burde have det."
          : "Prøv igen. Hvis fejlen fortsætter, skal du oplyse fejlreferencen til support."}
      </p>
      {!isPermission && (
        <p className="mt-3 font-mono text-xs text-muted" aria-label="Fejlreference">
          Fejlreference: {reference}
        </p>
      )}
      {!isPermission && (
        <Button className="mt-4" variant="secondary" onClick={reset}>
          Prøv igen
        </Button>
      )}
    </div>
  );
}
