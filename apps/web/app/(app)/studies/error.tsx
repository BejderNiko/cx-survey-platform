"use client";

import { Button, Card } from "@/components/ui";

export default function StudiesError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const reference = error.digest ?? "STUDIES-UNKNOWN";
  return (
    <Card title="Studier kunne ikke indlæses">
      <p role="alert" className="text-sm text-danger">
        Databasen eller forbindelsen svarede ikke som forventet. Ingen studiedata er ændret.
      </p>
      <p className="mt-2 font-mono text-xs text-muted">Fejlreference: {reference}</p>
      <Button className="mt-4" type="button" onClick={reset}>Prøv igen</Button>
    </Card>
  );
}
