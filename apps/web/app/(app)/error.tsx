"use client";

import { Button } from "@/components/ui";

/** App-section error boundary: permission denials and unexpected failures. */
export default function AppError({ error, reset }: { error: Error; reset: () => void }) {
  const isPermission = error.message.includes("not allowed to perform");
  return (
    <div className="mx-auto mt-16 max-w-md rounded-lg border border-line bg-surface p-6 text-center">
      <h1 className="text-base font-semibold">
        {isPermission ? "No access" : "Something went wrong"}
      </h1>
      <p className="mt-2 text-sm text-muted">
        {isPermission
          ? "Your role does not have access to this page. Ask an administrator if you believe it should."
          : "The page failed to load. Try again, and check that the local database and analytics service are running."}
      </p>
      {!isPermission && (
        <Button className="mt-4" variant="secondary" onClick={reset}>
          Try again
        </Button>
      )}
    </div>
  );
}
