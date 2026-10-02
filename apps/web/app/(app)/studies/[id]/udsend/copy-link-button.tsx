"use client";

import { useState } from "react";
import { Button } from "@/components/ui";

export function CopyLinkButton({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  return <div className="flex items-center gap-2">
    <Button size="sm" variant="secondary" onClick={async () => {
      try {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setMessage(null);
        window.setTimeout(() => setCopied(false), 1600);
      } catch {
        setMessage("Kunne ikke kopiere linket.");
      }
    }}>{copied ? "Kopieret" : "Kopiér"}</Button>
    {message && <span role="status" className="text-xs text-muted">{message}</span>}
  </div>;
}