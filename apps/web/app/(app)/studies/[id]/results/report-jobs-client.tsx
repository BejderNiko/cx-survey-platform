"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui";
import { requestReportJob } from "./report-job-actions";

export function ReportJobButtons({ studyId, filters, manualWorkerEnabled }: { studyId: string; filters: string; manualWorkerEnabled: boolean }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const request = (format: "docx" | "pptx") => startTransition(async () => {
    const result = await requestReportJob({ studyId, format, filters });
    setMessage(result.ok ? `Rapportjob ${result.id} er sat i sikker kø. Worker behandler automatisk.` : result.error);
  });
  const runWorker = () => startTransition(async () => {
    const response = await fetch("/api/internal/report-worker", { method: "POST", headers: { "content-type": "application/json" } });
    const result = await response.json() as { processed?: boolean; status?: string; error?: string };
    setMessage(response.ok ? (result.processed ? `Worker: ${result.status}.` : "Køen er tom.") : `Worker afvist: ${result.error ?? response.status}.`);
  });
  return <div><div className="flex flex-wrap gap-2"><Button disabled={pending} onClick={() => request("docx")}>Bestil DOCX</Button><Button disabled={pending} variant="secondary" onClick={() => request("pptx")}>Bestil PPTX</Button>{manualWorkerEnabled && <Button disabled={pending} variant="ghost" onClick={runWorker}>Kør ét job manuelt</Button>}</div>{message && <p role="status" className="mt-2 text-xs">{message}</p>}</div>;
}