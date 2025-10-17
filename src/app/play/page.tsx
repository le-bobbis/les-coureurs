import React, { Suspense } from "react";
import { PlayPageClient } from "./PlayPageClient";

export const dynamic = "force-dynamic"; // allowed here (server component)

export default function Page() {
  return (
    <Suspense fallback={<div className="p-4 text-white">Loading…</div>}>
      <PlayPageClient />
    </Suspense>
  );
}
