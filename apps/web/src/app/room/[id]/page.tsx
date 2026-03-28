import type { Metadata } from "next";

import { RoomClient } from "./room-client";

export const metadata: Metadata = {
  title: "Комната — Vector Racers",
  description: "Pre-race, гонка и результаты",
};

export default function RoomPage({ params }: { params: { id: string } }) {
  return <RoomClient roomId={params.id} />;
}
