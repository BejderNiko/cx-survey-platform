import { redirect } from "next/navigation";
import { Button, Card, Input, Label } from "@/components/ui";
import { createSessionCookie, getSession, verifyCredentials } from "@/lib/auth";

async function login(formData: FormData) {
  "use server";
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const user = await verifyCredentials(email, password);
  if (!user) {
    redirect("/login?error=1");
  }
  await createSessionCookie(user);
  redirect("/home");
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await getSession();
  if (session) redirect("/home");
  const { error } = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="text-xl font-semibold tracking-tight">
            OK <span className="text-accent">· CX Survey Platform</span>
          </div>
          <p className="mt-1 text-sm text-muted">Internal research, CX, and analysis</p>
        </div>
        <Card>
          <form action={login} className="space-y-3">
            {error && (
              <p role="alert" className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-800">
                Wrong email or password.
              </p>
            )}
            <div>
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" autoComplete="username" required autoFocus />
            </div>
            <div>
              <Label htmlFor="password">Password</Label>
              <Input id="password" name="password" type="password" autoComplete="current-password" required />
            </div>
            <Button type="submit" className="w-full">
              Sign in
            </Button>
          </form>
        </Card>
        <div className="mt-4 rounded-md border border-line bg-surface px-3 py-2 text-xs text-muted">
          <p className="font-medium text-foreground mb-1">Local development sign-in</p>
          <p>
            Seeded users: owner@, admin@, researcher@, panel@, analyst@, viewer@
            (all <span className="font-mono">…@example.invalid</span>, password{" "}
            <span className="font-mono">demo1234!</span>).
          </p>
          <p className="mt-1">Production sign-in uses Microsoft Entra ID via Supabase Auth (not enabled in local dev).</p>
        </div>
      </div>
    </main>
  );
}
