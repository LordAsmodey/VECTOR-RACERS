import Link from "next/link";

/**
 * Minimal room route so TASK-013 lobby can redirect after create/join.
 * Full pre-race / race UI: TASK-014.
 */
export default function RoomPage({ params }: { params: { id: string } }) {
  return (
    <main style={{ padding: "2rem", fontFamily: "system-ui, sans-serif", maxWidth: 560 }}>
      <h1 style={{ fontSize: "1.25rem" }}>Room</h1>
      <p style={{ opacity: 0.8 }}>Room id: {params.id}</p>
      <p style={{ marginTop: "1rem" }}>Pre-race and race UI will be added in TASK-014.</p>
      <p style={{ marginTop: "1.5rem" }}>
        <Link href="/lobby">← Back to lobby</Link>
      </p>
    </main>
  );
}
