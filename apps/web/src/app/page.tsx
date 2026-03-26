import React from "react";
import Link from "next/link";
import { VECTOR_RACERS_SHARED_VERSION } from "@vector-racers/shared";

export default function Home() {
  return (
    <main className="min-h-screen flex items-center justify-center p-8 sm:p-20">
      <section className="w-full max-w-xl rounded-2xl border border-zinc-200 dark:border-zinc-800 p-8 sm:p-10">
        <h1 className="text-2xl font-semibold">Vector Racers</h1>
        <p className="mt-2 text-sm text-zinc-500">
          @vector-racers/shared {VECTOR_RACERS_SHARED_VERSION}
        </p>
        <p className="mt-6 text-sm text-zinc-600 dark:text-zinc-300">
          Authentication smoke-check links:
        </p>
        <div className="mt-4 flex gap-3">
          <Link
            href="/login"
            className="rounded-md bg-foreground text-background px-4 py-2 text-sm font-medium"
          >
            Go to login
          </Link>
          <Link
            href="/register"
            className="rounded-md border border-zinc-300 dark:border-zinc-700 px-4 py-2 text-sm font-medium"
          >
            Go to register
          </Link>
        </div>
      </section>
    </main>
  );
}
