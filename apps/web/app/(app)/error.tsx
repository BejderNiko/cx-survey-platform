"use client";

import { Button } from "@/components/ui";

/** Fejlgrænse for app-sektionen: manglende rettigheder og uventede fejl. */
export default function AppError({ error, reset }: { error: Error; reset: () => void }) {
  const isPermission = error.message.includes("not allowed to perform");
  return (
    <div className="mx-auto mt-16 max-w-md rounded-xl border border-line bg-surface p-6 text-center shadow-card">
      <h1 className="font-display text-lg text-heading">
        {isPermission ? "Ingen adgang" : "Noget gik galt"}
      </h1>
      <p className="mt-2 text-sm text-muted">
        {isPermission
          ? "Din rolle har ikke adgang til denne side. Kontakt en administrator, hvis du mener, du burde have det."
          : "Siden kunne ikke indlæses. Prøv igen, og tjek at den lokale database og analysetjenesten kører."}
      </p>
      {!isPermission && (
        <Button className="mt-4" variant="secondary" onClick={reset}>
          Prøv igen
        </Button>
      )}
    </div>
  );
}
