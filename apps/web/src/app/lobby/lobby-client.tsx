"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import styles from "./lobby.module.css";

const CAR_STORAGE_KEY = "vr_lobby_car_id";
const PUBLIC_REFRESH_MS = 5000;

type CarStats = {
  speed: number;
  acceleration: number;
  grip: number;
  mass: number;
};

type CarRow = {
  id: string;
  slug: string;
  name: string;
  stats: CarStats;
  imageUrl: string;
  unlockedByDefault: boolean;
};

type TrackRow = {
  id: string;
  slug: string;
  name: string;
  previewUrl: string;
  lapCount: number;
  difficulty: string;
};

type PublicRoomRow = {
  id: string;
  code: string;
  status: string;
  maxPlayers: number;
  playerCount: number;
  track: { id: string; slug: string; name: string; previewUrl: string };
};

type PublicRoomsPayload = {
  items: PublicRoomRow[];
  page: number;
  limit: number;
  total: number;
};

function statPercent(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n * 100)));
}

function errorMessage(data: unknown): string {
  if (!data || typeof data !== "object") {
    return "Request failed";
  }
  const msg = (data as { message?: unknown }).message;
  if (typeof msg === "string") {
    return msg;
  }
  if (Array.isArray(msg)) {
    return msg.map(String).join(", ");
  }
  return "Request failed";
}

export function LobbyClient() {
  const router = useRouter();
  const [cars, setCars] = useState<CarRow[] | null>(null);
  const [tracks, setTracks] = useState<TrackRow[] | null>(null);
  const [publicRooms, setPublicRooms] = useState<PublicRoomRow[]>([]);
  const [selectedCarId, setSelectedCarId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createTrackId, setCreateTrackId] = useState<string>("");
  const [maxPlayers, setMaxPlayers] = useState(4);
  const [joinCode, setJoinCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedCar = useMemo(
    () => cars?.find((c) => c.id === selectedCarId) ?? null,
    [cars, selectedCarId],
  );

  const loadCatalog = useCallback(async () => {
    setError(null);
    const [carsRes, tracksRes] = await Promise.all([
      fetch("/api/catalog/cars", { credentials: "include", cache: "no-store" }),
      fetch("/api/catalog/tracks", { credentials: "include", cache: "no-store" }),
    ]);

    if (carsRes.status === 401 || tracksRes.status === 401) {
      router.replace("/login");
      return;
    }

    if (!carsRes.ok) {
      setError(errorMessage(await carsRes.json().catch(() => null)));
      return;
    }
    if (!tracksRes.ok) {
      setError(errorMessage(await tracksRes.json().catch(() => null)));
      return;
    }

    const carsJson = (await carsRes.json()) as CarRow[];
    const tracksJson = (await tracksRes.json()) as TrackRow[];
    setCars(carsJson);
    setTracks(tracksJson);

    const stored = typeof window !== "undefined" ? window.localStorage.getItem(CAR_STORAGE_KEY) : null;
    const pick =
      stored && carsJson.some((c) => c.id === stored && c.unlockedByDefault)
        ? stored
        : carsJson.find((c) => c.unlockedByDefault)?.id ?? null;
    setSelectedCarId(pick);
    if (pick && typeof window !== "undefined") {
      window.localStorage.setItem(CAR_STORAGE_KEY, pick);
    }

    if (tracksJson.length > 0) {
      setCreateTrackId((prev) => {
        if (prev && tracksJson.some((t) => t.id === prev)) {
          return prev;
        }
        return tracksJson[0]!.id;
      });
    }
  }, [router]);

  const loadPublicRooms = useCallback(async () => {
    try {
      const res = await fetch("/api/rooms/public?page=1&limit=50", {
        credentials: "include",
        cache: "no-store",
      });
      if (!res.ok) {
        return;
      }
      const data = (await res.json()) as PublicRoomsPayload;
      setPublicRooms(data.items ?? []);
    } catch {
      /* ignore poll errors */
    }
  }, []);

  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

  useEffect(() => {
    void loadPublicRooms();
    const id = window.setInterval(() => {
      void loadPublicRooms();
    }, PUBLIC_REFRESH_MS);
    return () => window.clearInterval(id);
  }, [loadPublicRooms]);

  useEffect(() => {
    if (!createOpen) {
      return;
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setCreateOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [createOpen]);

  const selectCar = (car: CarRow) => {
    if (!car.unlockedByDefault) {
      return;
    }
    setSelectedCarId(car.id);
    window.localStorage.setItem(CAR_STORAGE_KEY, car.id);
  };

  const requireCarId = (): string | null => {
    if (!selectedCarId || !selectedCar?.unlockedByDefault) {
      setError("Choose an unlocked car first.");
      return null;
    }
    return selectedCarId;
  };

  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    const carId = requireCarId();
    if (!carId || !createTrackId) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/rooms", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          trackId: createTrackId,
          carId,
          maxPlayers,
        }),
      });
      const data: unknown = await res.json().catch(() => null);
      if (res.status === 401) {
        router.replace("/login");
        return;
      }
      if (!res.ok) {
        setError(errorMessage(data));
        return;
      }
      const room = data as { id: string };
      setCreateOpen(false);
      router.push(`/room/${room.id}`);
    } finally {
      setBusy(false);
    }
  };

  const handleJoinByCode = async (e: React.FormEvent) => {
    e.preventDefault();
    const carId = requireCarId();
    const code = joinCode.trim().toUpperCase();
    if (!carId || code.length !== 6) {
      setError("Enter a 6-character room code.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/rooms/join", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, carId }),
      });
      const data: unknown = await res.json().catch(() => null);
      if (res.status === 401) {
        router.replace("/login");
        return;
      }
      if (!res.ok) {
        setError(errorMessage(data));
        return;
      }
      const room = data as { id: string };
      router.push(`/room/${room.id}`);
    } finally {
      setBusy(false);
    }
  };

  const handleJoinRoom = async (room: PublicRoomRow) => {
    const carId = requireCarId();
    if (!carId) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/rooms/join", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: room.code, carId }),
      });
      const data: unknown = await res.json().catch(() => null);
      if (res.status === 401) {
        router.replace("/login");
        return;
      }
      if (!res.ok) {
        setError(errorMessage(data));
        return;
      }
      const joined = data as { id: string };
      router.push(`/room/${joined.id}`);
    } finally {
      setBusy(false);
    }
  };

  if (!cars || !tracks) {
    return (
      <div>
        <p className={`${styles.banner} ${styles.bannerInfo}`} role="status">
          Loading lobby…
        </p>
        {error ? (
          <p className={`${styles.banner} ${styles.bannerError}`} role="alert">
            {error}{" "}
            <button type="button" className={`${styles.btn} ${styles.btnGhost}`} onClick={() => void loadCatalog()}>
              Retry
            </button>
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <>
      <h1 className={styles.pageTitle}>
        Lobby
        <span className={styles.pageTitleSub}>Pick a car, join or host a room</span>
      </h1>

      {error ? (
        <div className={`${styles.banner} ${styles.bannerError}`} role="alert">
          {error}
        </div>
      ) : null}

      <section aria-labelledby="cars-heading">
        <h2 id="cars-heading" className={styles.sectionTitle}>
          Choose your machine
        </h2>
        <div className={styles.carGrid}>
          {cars.map((car) => {
            const selected = car.id === selectedCarId;
            const locked = !car.unlockedByDefault;
            return (
              <button
                key={car.id}
                type="button"
                className={`${styles.carCard} ${selected ? styles.carCardSelected : ""} ${locked ? styles.carCardLocked : ""}`}
                onClick={() => selectCar(car)}
                disabled={locked}
                aria-pressed={selected}
                aria-disabled={locked}
              >
                <div className={styles.carImgWrap}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- remote seed URLs */}
                  <img className={styles.carImg} src={car.imageUrl} alt="" />
                </div>
                <div className={styles.carBody}>
                  {locked ? <div className={styles.lockBadge}>Locked</div> : null}
                  <h3 className={styles.carName}>{car.name}</h3>
                  <div className={styles.statBars} role="group" aria-label={`Stats for ${car.name}`}>
                    {(
                      [
                        ["Speed", car.stats.speed],
                        ["Accel", car.stats.acceleration],
                        ["Grip", car.stats.grip],
                        ["Mass", car.stats.mass],
                      ] as const
                    ).map(([label, val]) => (
                      <div key={label} className={styles.statBar}>
                        <span>{label}</span>
                        <span className={styles.statTrack}>
                          <span
                            className={styles.statFill}
                            style={{
                              width: `${statPercent(val)}%`,
                            }}
                          />
                        </span>
                        <span className={styles.statVal}>{statPercent(val)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      <section aria-labelledby="actions-heading">
        <h2 id="actions-heading" className={styles.srOnly}>
          Room actions
        </h2>
        <div className={styles.actionsRow}>
          <button
            type="button"
            className={`${styles.btn} ${styles.btnPrimary}`}
            onClick={() => setCreateOpen(true)}
            disabled={busy}
          >
            Create Room
          </button>
          <form className={styles.joinForm} onSubmit={handleJoinByCode}>
            <label className={styles.srOnly} htmlFor="join-code">
              Room code
            </label>
            <input
              id="join-code"
              className={styles.joinInput}
              maxLength={6}
              placeholder="AB12CD"
              autoComplete="off"
              value={joinCode}
              onChange={(ev) => setJoinCode(ev.target.value.toUpperCase())}
              aria-describedby="join-code-hint"
            />
            <span id="join-code-hint" className={styles.srOnly}>
              Six character room code
            </span>
            <button type="submit" className={`${styles.btn} ${styles.btnSecondary}`} disabled={busy}>
              Join by Code
            </button>
          </form>
        </div>
      </section>

      <section aria-labelledby="rooms-heading">
        <h2 id="rooms-heading" className={styles.sectionTitle}>
          Public rooms
        </h2>
        <div className={styles.cardFlush}>
          {publicRooms.length === 0 ? (
            <p className={styles.bannerInfo} style={{ margin: 0, padding: "1rem 1.25rem" }}>
              No public waiting rooms. Create one or check again in a few seconds.
            </p>
          ) : (
            <ul className={styles.roomList}>
              {publicRooms.map((room) => (
                <li key={room.id} className={styles.roomItem}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    className={styles.roomThumb}
                    src={room.track.previewUrl}
                    alt=""
                    width={72}
                    height={48}
                  />
                  <div className={styles.roomInfo}>
                    <strong>{room.track.name}</strong>
                    <span className={`${styles.badge} ${styles.badgeLive}`}>Open</span>
                  </div>
                  <span className={styles.roomMeta}>
                    {room.playerCount} / {room.maxPlayers} waiting
                  </span>
                  <button
                    type="button"
                    className={`${styles.btn} ${styles.btnGhost} ${styles.roomJoin}`}
                    disabled={busy}
                    onClick={() => void handleJoinRoom(room)}
                  >
                    Join
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {createOpen ? (
        <div
          className={styles.modalRoot}
          role="presentation"
          onMouseDown={(ev) => {
            if (ev.target === ev.currentTarget) {
              setCreateOpen(false);
            }
          }}
        >
          <div className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="modal-create-title">
            <h2 className={styles.modalTitle} id="modal-create-title">
              Create room
            </h2>
            <form onSubmit={handleCreateRoom}>
              <div className={styles.formGroup}>
                <label className={styles.formLabel} htmlFor="modal-track">
                  Track
                </label>
                <select
                  id="modal-track"
                  className={styles.formSelect}
                  required
                  value={createTrackId}
                  onChange={(ev) => setCreateTrackId(ev.target.value)}
                >
                  {tracks.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel} htmlFor="modal-max-players">
                  Max players
                </label>
                <select
                  id="modal-max-players"
                  className={styles.formSelect}
                  required
                  value={maxPlayers}
                  onChange={(ev) => setMaxPlayers(Number(ev.target.value))}
                  aria-describedby="max-players-hint"
                >
                  {[2, 3, 4, 5, 6].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
                <p id="max-players-hint" className={styles.formHint}>
                  Between 2 and 6 players.
                </p>
              </div>
              <div className={styles.modalActions}>
                <button
                  type="button"
                  className={`${styles.btn} ${styles.btnSecondary}`}
                  onClick={() => setCreateOpen(false)}
                  disabled={busy}
                >
                  Cancel
                </button>
                <button type="submit" className={`${styles.btn} ${styles.btnPrimary}`} disabled={busy}>
                  Create
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
