"use client";

import { Button, Card } from "@/components/ui";

export default function PanelError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const reference = error.digest ?? "PANEL-UNKNOWN";
  return (
    <Card title="Panel kunne ikke indlæses">
      <p role="alert" className="text-sm text-danger">
        Paneldata kunne ikke hentes. Ingen paneldata er ændret.
      </p>
      <p className="mt-2 font-mono text-xs text-muted">Fejlreference: {reference}</p>
      <Button className="mt-4" type="button" onClick={reset}>Prøv igen</Button>
    </Card>
  );
}
