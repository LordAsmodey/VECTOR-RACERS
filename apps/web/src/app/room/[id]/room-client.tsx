"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { GameEndResultRow, RoomLobbyPlayer } from "@vector-racers/shared";

import { RaceMinimap } from "@/components/game/RaceMinimap";
import { TrackRenderer, type TrackRendererCar } from "@/components/game/TrackRenderer";
import { useGameSocket } from "@/lib/game-client";

import styles from "./room.module.css";
import lobbyStyles from "../../lobby/lobby.module.css";

type RoomDetail = {
  id: string;
  code: string;
  status: string;
  maxPlayers: number;
  track: { name: string; slug: string };
  players: RoomLobbyPlayer[];
};

type CarRow = { id: string; name: string };

function countdownLabel(until: number | null): string | null {
  if (!until) {
    return null;
  }
  const ms = until - Date.now();
  if (ms <= 0) {
    return null;
  }
  if (ms > 3000) {
    return "3";
  }
  if (ms > 2000) {
    return "2";
  }
  if (ms > 1000) {
    return "1";
  }
  return "GO";
}

function usernameForResult(
  rows: RoomLobbyPlayer[],
  userId: string,
): string {
  return rows.find((p) => p.userId === userId)?.username ?? userId.slice(0, 8);
}

export function RoomClient({ roomId }: { roomId: string }) {
  const router = useRouter();
  const [me, setMe] = useState<{ userId: string } | null>(null);
  const [room, setRoom] = useState<RoomDetail | null>(null);
  const [carsCatalog, setCarsCatalog] = useState<CarRow[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [meRes, roomRes, carsRes] = await Promise.all([
        fetch("/api/me", { credentials: "include", cache: "no-store" }),
        fetch(`/api/rooms/${encodeURIComponent(roomId)}`, {
          credentials: "include",
          cache: "no-store",
        }),
        fetch("/api/catalog/cars", { credentials: "include", cache: "no-store" }),
      ]);
      if (cancelled) {
        return;
      }
      if (meRes.status === 401 || roomRes.status === 401) {
        router.replace("/login");
        return;
      }
      if (!meRes.ok || !roomRes.ok) {
        setLoadError("Не удалось загрузить комнату");
        return;
      }
      const meJson = (await meRes.json()) as { userId?: string };
      const roomJson = (await roomRes.json()) as RoomDetail;
      if (typeof meJson.userId !== "string") {
        setLoadError("Нет данных профиля");
        return;
      }
      setMe({ userId: meJson.userId });
      setRoom(roomJson);
      if (carsRes.ok) {
        const list = (await carsRes.json()) as { id: string; name: string }[];
        if (Array.isArray(list)) {
          setCarsCatalog(list.map((x) => ({ id: x.id, name: x.name })));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [roomId, router]);

  const initialPlayers = room?.players ?? null;

  const {
    gameState,
    submitMove,
    sendPlayerReady,
    connectionStatus,
    raceResults,
    socketError,
    lobbyPlayers,
    raceCountdownUntil,
    offlineUserIds,
  } = useGameSocket(roomId, {
    userId: me?.userId ?? "",
    initialLobbyPlayers: initialPlayers,
  });

  const players = lobbyPlayers ?? room?.players ?? [];

  const carNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of carsCatalog) {
      m.set(c.id, c.name);
    }
    return m;
  }, [carsCatalog]);

  const selfId = me?.userId ?? "";
  const selfRow = players.find((p) => p.userId === selfId);

  const sortedSlots = useMemo(() => {
    if (!room) {
      return [];
    }
    const sorted = [...players].sort((a, b) => a.position - b.position);
    return Array.from(
      { length: room.maxPlayers },
      (_, i) => sorted[i] ?? null,
    );
  }, [players, room]);

  const showPreRace =
    room?.status === "WAITING" && !gameState && !raceResults;
  const showRace = gameState !== null;
  const showPost = raceResults !== null;
  const showFinishedNoResults =
    room?.status === "FINISHED" && !raceResults && !gameState;

  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!raceCountdownUntil && !showRace) {
      return undefined;
    }
    const id = window.setInterval(() => {
      setTick((t) => t + 1);
    }, 100);
    return () => window.clearInterval(id);
  }, [raceCountdownUntil, showRace]);

  const turnEndsAtRef = useRef(0);
  useEffect(() => {
    if (gameState) {
      turnEndsAtRef.current = Date.now() + 60_000;
    }
  }, [gameState?.moveSeq, gameState?.currentPlayerId, gameState]);

  const turnFractionRemaining = useMemo(() => {
    if (!gameState || !showRace) {
      return 0;
    }
    void tick;
    const end = turnEndsAtRef.current;
    return Math.max(0, Math.min(1, (end - Date.now()) / 60_000));
  }, [gameState, showRace, tick]);

  const trackCars: TrackRendererCar[] = useMemo(() => {
    if (!gameState) {
      return [];
    }
    const out: TrackRendererCar[] = [];
    for (const pid of gameState.playerOrder) {
      const st = gameState.cars[pid];
      if (!st) {
        continue;
      }
      out.push({
        ...st,
        playerId: pid,
        label:
          players.find((q) => q.userId === pid)?.username ?? pid.slice(0, 6),
      });
    }
    return out;
  }, [gameState, players]);

  const offlineNames = offlineUserIds
    .filter((id) => id !== selfId)
    .map((id) => players.find((p) => p.userId === id)?.username ?? id);

  const disconnectMsg =
    connectionStatus === "disconnected" || connectionStatus === "error"
      ? "Соединение с игрой потеряно. Ожидаем переподключение…"
      : connectionStatus === "reconnecting"
        ? "Восстанавливаем соединение…"
        : null;

  const cd = countdownLabel(raceCountdownUntil);

  const myCar = gameState && selfId ? gameState.cars[selfId] : undefined;
  const myStats = gameState && selfId ? gameState.carStatsByUserId[selfId] : undefined;
  const speedVal = myCar ? Math.round(Math.hypot(myCar.vx, myCar.vy)) : 0;
  const inertiaPct =
    myStats !== undefined
      ? Math.round(
          Math.min(
            100,
            Math.max(
              0,
              myStats.mass * Math.min(1, speedVal / 80) * 100 +
                (1 - myStats.grip) * 18,
            ),
          ),
        )
      : 0;

  const goLobby = useCallback(() => {
    router.push("/lobby");
  }, [router]);

  const ringR = 26;
  const ringCirc = 2 * Math.PI * ringR;
  const ringDash = ringCirc * turnFractionRemaining;

  if (loadError) {
    return (
      <div className={styles.raceRoot}>
        <p className={`${styles.banner} ${styles.bannerWarn}`}>{loadError}</p>
        <button type="button" className={styles.btnSecondary} onClick={goLobby}>
          В лобби
        </button>
      </div>
    );
  }

  if (!me || !room) {
    return <div className={styles.loading}>Загрузка комнаты…</div>;
  }

  return (
    <div className={styles.raceRoot}>
      {disconnectMsg ? (
        <div className={`${styles.banner} ${styles.bannerWarn}`} role="status">
          {disconnectMsg}
        </div>
      ) : null}

      {offlineNames.length > 0 ? (
        <div className={`${styles.banner} ${styles.bannerMuted}`} role="status">
          {offlineNames.map((n) => (
            <span key={n}>
              Игрок <strong>{n}</strong> отключился (сокет).{" "}
            </span>
          ))}
        </div>
      ) : null}

      {socketError ? (
        <div className={`${styles.banner} ${styles.bannerWarn}`} role="alert">
          {socketError.message} ({socketError.code})
        </div>
      ) : null}

      <div className={styles.raceHead}>
        <h1 className={styles.raceTitle}>{room.track.name}</h1>
        <div>
          <span className={lobbyStyles.formHint}>Код комнаты</span>
          <div className={styles.codeBadge} translate="no">
            {room.code}
          </div>
        </div>
      </div>

      {cd ? (
        <div className={styles.countdownOverlay} aria-live="assertive">
          <div className={styles.countdownText}>{cd}</div>
        </div>
      ) : null}

      {showFinishedNoResults ? (
        <section className={styles.panel}>
          <h2 className={styles.panelTitle}>Гонка завершена</h2>
          <p className={styles.hint}>
            Таблица результатов доступна только сразу после финиша; после
            обновления страницы прошлая гонка здесь не восстанавливается.
          </p>
          <div className={styles.postActions}>
            <button type="button" className={styles.btnSecondary} onClick={goLobby}>
              В лобби
            </button>
          </div>
        </section>
      ) : null}

      {showPreRace ? (
        <section className={styles.panel} aria-labelledby="players-heading">
          <h2 id="players-heading" className={styles.panelTitle}>
            Игроки
          </h2>
          <ul className={styles.playerList}>
            {sortedSlots.map((slot, idx) => (
              <li key={slot?.userId ?? `open-${idx}`} className={styles.playerRow}>
                {slot ? (
                  <>
                    <span className={styles.playerMeta}>
                      <strong>
                        {slot.userId === selfId ? "Вы" : slot.username}
                      </strong>
                      {carNameById.get(slot.carId) ? (
                        <span className={styles.playerNote}>
                          {" "}
                          ({carNameById.get(slot.carId)})
                        </span>
                      ) : null}
                    </span>
                    {slot.isReady ? (
                      <span className={styles.readyOk}>✓ Готов</span>
                    ) : (
                      <span className={styles.readyWait}>Ожидание…</span>
                    )}
                  </>
                ) : (
                  <>
                    <span className={styles.playerMeta}>
                      <span className={styles.playerNote}>Свободный слот</span>
                    </span>
                    <span className={styles.readyWait}>—</span>
                  </>
                )}
              </li>
            ))}
          </ul>
          <div className={styles.ctaRow}>
            <button
              type="button"
              className={styles.btnReady}
              disabled={!selfRow || selfRow.isReady || Boolean(cd)}
              onClick={() => sendPlayerReady()}
            >
              ГОТОВ
            </button>
            <p className={styles.hint}>
              Когда все нажмут «Готов», стартовый отсчёт 3-2-1-GO и гонка
              начнётся.
            </p>
          </div>
        </section>
      ) : null}

      {showRace && gameState ? (
        <div className={styles.raceStage}>
          <div className={styles.canvasWrap}>
            <TrackRenderer
              track={gameState.track}
              cars={trackCars}
              currentPlayerId={gameState.currentPlayerId}
              localPlayerId={selfId}
              carStatsByUserId={gameState.carStatsByUserId}
              onMoveInput={submitMove}
              style={{ width: "100%", height: "min(58vh, 560px)" }}
            />
          </div>
          <aside className={styles.sidePanel}>
            <div className={styles.hudCard}>
              <p className={styles.hudTitle}>Таймер хода</p>
              <div className={styles.turnRingWrap}>
                <svg
                  width={72}
                  height={72}
                  viewBox="0 0 64 64"
                  aria-hidden
                >
                  <circle
                    cx="32"
                    cy="32"
                    r={ringR}
                    fill="none"
                    stroke="rgba(255,255,255,0.08)"
                    strokeWidth="6"
                  />
                  <circle
                    cx="32"
                    cy="32"
                    r={ringR}
                    fill="none"
                    stroke="url(#vrTurnGrad)"
                    strokeWidth="6"
                    strokeLinecap="round"
                    strokeDasharray={`${ringDash} ${ringCirc}`}
                    transform="rotate(-90 32 32)"
                  />
                  <defs>
                    <linearGradient id="vrTurnGrad" x1="0" y1="0" x2="1" y2="1">
                      <stop offset="0%" stopColor="#00f5ff" />
                      <stop offset="100%" stopColor="#ff2ea6" />
                    </linearGradient>
                  </defs>
                </svg>
                <span className={styles.turnRingLabel}>
                  60 с на ход · сервер штрафует (0,0) по таймауту
                </span>
              </div>
            </div>
            <div className={styles.hudCard}>
              <p className={styles.hudTitle}>Ваш HUD</p>
              <div className={styles.hudStat}>
                <span>Скорость</span>
                <span>{speedVal}</span>
              </div>
              <div className={styles.hudStat}>
                <span>Инерция (оценка)</span>
                <span>{inertiaPct}%</span>
              </div>
              <p className={styles.currentTurn}>
                Сейчас ход:{" "}
                <strong>
                  {gameState.currentPlayerId === selfId
                    ? "вы"
                    : usernameForResult(players, gameState.currentPlayerId)}
                </strong>
              </p>
            </div>
            <div className={styles.hudCard}>
              <p className={styles.hudTitle}>Круги</p>
              <ul className={styles.lapList}>
                {gameState.playerOrder.map((pid) => {
                  const c = gameState.cars[pid];
                  return (
                    <li key={pid}>
                      <span>
                        {pid === selfId
                          ? "Вы"
                          : usernameForResult(players, pid)}
                      </span>
                      <span>{c?.laps ?? 0}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
            <div className={styles.minimapWrap}>
              <RaceMinimap
                track={gameState.track}
                cars={gameState.cars}
                highlightUserId={selfId}
              />
            </div>
          </aside>
        </div>
      ) : null}

      {showPost && raceResults ? (
        <section className={styles.panel}>
          <h2 className={styles.panelTitle}>Результаты</h2>
          <table className={styles.resultsTable}>
            <thead>
              <tr>
                <th>Место</th>
                <th>Игрок</th>
                <th>Круги</th>
                <th>Время</th>
                <th>Лучший круг</th>
              </tr>
            </thead>
            <tbody>
              {raceResults.map((r: GameEndResultRow) => (
                <tr key={r.userId}>
                  <td>{r.finishPosition}</td>
                  <td>{usernameForResult(players, r.userId)}</td>
                  <td>{r.laps}</td>
                  <td>—</td>
                  <td>—</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className={styles.postActions}>
            <button type="button" className={styles.btnSecondary} onClick={goLobby}>
              В лобби
            </button>
            <button type="button" className={styles.btnReady} onClick={goLobby}>
              Реванш
            </button>
          </div>
          <p className={styles.hint}>
            Реванш: создайте новую комнату из лобби с теми же участниками.
          </p>
        </section>
      ) : null}
    </div>
  );
}
