"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui";
import { requestReportJob } from "./report-job-actions";

export function ReportJobButtons({ studyId, filters }: { studyId: string; filters: string }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const request = (format: "docx" | "pptx") => startTransition(async () => {
    const result = await requestReportJob({ studyId, format, filters });
    setMessage(result.ok ? `Rapportjob ${result.id} er sat i kø.` : result.error);
  });
  return <div><div className="flex gap-2"><Button disabled={pending} onClick={() => request("docx")}>Bestil DOCX</Button><Button disabled={pending} variant="secondary" onClick={() => request("pptx")}>Bestil PPTX</Button></div>{message && <p role="status" className="mt-2 text-xs">{message}</p>}</div>;
}
