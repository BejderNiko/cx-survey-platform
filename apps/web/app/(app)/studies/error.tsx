"use client";

import { Button, Card } from "@/components/ui";

export default function StudiesError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <Card title="Studier kunne ikke indlæses">
      <p role="alert" className="text-sm text-danger">
        Databasen eller forbindelsen svarede ikke som forventet. Ingen studiedata er ændret.
      </p>
      <Button className="mt-4" type="button" onClick={reset}>Prøv igen</Button>
    </Card>
  );
}
