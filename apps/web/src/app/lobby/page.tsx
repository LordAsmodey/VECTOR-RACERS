import type { Metadata } from "next";

import { LobbyClient } from "./lobby-client";

export const metadata: Metadata = {
  title: "Lobby — Vector Racers",
  description: "Choose a car, join or host a room",
};

export default function LobbyPage() {
  return <LobbyClient />;
}
