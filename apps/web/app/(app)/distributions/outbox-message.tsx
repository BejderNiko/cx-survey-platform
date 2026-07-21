"use client";

import { useState } from "react";
import { Badge, Td } from "@/components/ui";

export function OutboxMessageView({
  to, subject, body, distribution, status, createdAt,
}: {
  to: string; subject: string; body: string; distribution: string; status: string; createdAt: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <tr>
        <Td className="whitespace-nowrap">{to}</Td>
        <Td>{subject}</Td>
        <Td>{distribution}</Td>
        <Td><Badge tone="amber">{status}</Badge></Td>
        <Td className="whitespace-nowrap text-muted">{createdAt}</Td>
        <Td>
          <button className="text-xs text-accent underline cursor-pointer" onClick={() => setOpen((o) => !o)}>
            {open ? "Hide" : "View"}
          </button>
        </Td>
      </tr>
      {open && (
        <tr>
          <Td colSpan={6}>
            <pre className="whitespace-pre-wrap rounded-md bg-background p-3 text-xs">{body}</pre>
          </Td>
        </tr>
      )}
    </>
  );
}
