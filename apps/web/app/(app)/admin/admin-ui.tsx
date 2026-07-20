"use client";

import { useState, useTransition } from "react";
import { ROLES } from "@ok/domain";
import { Badge, Button, Input, Label, Select, Td } from "@/components/ui";
import { changeRole, inviteMember, setMemberActive } from "./actions";

export function InviteForm() {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState("viewer");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="w-64">
        <Label htmlFor="inv-email">Email</Label>
        <Input id="inv-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div className="w-48">
        <Label htmlFor="inv-name">Full name</Label>
        <Input id="inv-name" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div>
        <Label htmlFor="inv-role">Role</Label>
        <Select id="inv-role" value={role} onChange={(e) => setRole(e.target.value)}>
          {ROLES.map((r) => <option key={r} value={r}>{r.replace("_", " ")}</option>)}
        </Select>
      </div>
      <Button
        disabled={pending || !email.includes("@") || !name.trim()}
        onClick={() =>
          startTransition(async () => {
            const res = await inviteMember(email, name, role);
            setMessage(
              res.oneTimePassword
                ? `Member created. One-time password (share securely): ${res.oneTimePassword}`
                : "Existing user added to the organization.",
            );
            setEmail(""); setName("");
          })
        }
      >
        Invite
      </Button>
      {message && <span className="text-sm text-success">{message}</span>}
    </div>
  );
}

export function MemberRow({
  membershipId, name, email, role, active, since, isSelf,
}: {
  membershipId: string; name: string; email: string; role: string;
  active: boolean; since: string; isSelf: boolean;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <tr className={!active ? "opacity-50" : undefined}>
      <Td>{name}{isSelf && <Badge className="ml-1.5" tone="accent">you</Badge>}</Td>
      <Td>{email}</Td>
      <Td>
        <Select
          aria-label={`Role for ${name}`}
          value={role}
          disabled={pending || isSelf}
          onChange={(e) => startTransition(() => changeRole(membershipId, e.target.value))}
        >
          {ROLES.map((r) => <option key={r} value={r}>{r.replace("_", " ")}</option>)}
        </Select>
      </Td>
      <Td><Badge tone={active ? "green" : "gray"}>{active ? "active" : "deactivated"}</Badge></Td>
      <Td className="whitespace-nowrap text-muted">{since}</Td>
      <Td>
        {!isSelf && (
          <Button size="sm" variant={active ? "ghost" : "secondary"} disabled={pending}
            onClick={() => startTransition(() => setMemberActive(membershipId, !active))}>
            {active ? "Deactivate" : "Reactivate"}
          </Button>
        )}
      </Td>
    </tr>
  );
}
