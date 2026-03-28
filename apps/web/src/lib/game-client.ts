"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import {
  applyMove,
  type CarState,
  type GameEndResultRow,
  type GameStatePayload,
  type MoveInput,
  type RoomLobbyPlayer,
} from "@vector-racers/shared";

/** Same notion as in vector-racers-tasks.md (world / physics units). */
export const GAME_STATE_RECONCILE_POSITION_THRESHOLD_WORLD = 2;

export type GameConnectionStatus =
  | "idle"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "disconnected"
  | "error";

interface StateUpdatePayload {
  gameState: GameStatePayload;
  lastMove: { userId: string; input: MoveInput };
  moveSeq: number;
}

interface GameStartPayload {
  gameState: GameStatePayload;
  playerOrder: string[];
  moveSeq: number;
}

function defaultSocketBaseUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_API_URL?.trim();
  if (fromEnv) {
    return fromEnv.replace(/\/+$/, "");
  }
  return "http://localhost:3001";
}

function clampMoveInput(input: MoveInput): MoveInput {
  const m = Math.hypot(input.inputX, input.inputY);
  if (m <= 1e-9) {
    return { inputX: 0, inputY: 0 };
  }
  if (m <= 1) {
    return { inputX: input.inputX, inputY: input.inputY };
  }
  return { inputX: input.inputX / m, inputY: input.inputY / m };
}

/** Max Euclidean car position delta across shared user ids; structural mismatch → Infinity. */
export function maxCarPositionDriftWorld(
  a: Record<string, CarState>,
  b: Record<string, CarState>,
): number {
  const ids = Array.from(
    new Set([...Object.keys(a), ...Object.keys(b)]),
  );
  let max = 0;
  for (const id of ids) {
    const ca = a[id];
    const cb = b[id];
    if (!ca || !cb) {
      return Number.POSITIVE_INFINITY;
    }
    const d = Math.hypot(ca.x - cb.x, ca.y - cb.y);
    if (d > max) {
      max = d;
    }
  }
  return max;
}

function applyOptimisticMove(
  game: GameStatePayload,
  userId: string,
  input: MoveInput,
): GameStatePayload {
  const clamped = clampMoveInput(input);
  const stats = game.carStatsByUserId[userId];
  const prev = game.cars[userId];
  if (!stats || !prev) {
    return game;
  }
  const physicsTrack = { ...game.track, ...stats };
  const nextCar = applyMove(prev, clamped, physicsTrack);
  const order = game.playerOrder;
  const n = order.length;
  if (n === 0) {
    return game;
  }
  const nextTurn = (game.turnIndex + 1) % n;
  const nextCurrent = order[nextTurn] ?? "";
  return {
    ...game,
    cars: { ...game.cars, [userId]: nextCar },
    turnIndex: nextTurn,
    moveSeq: game.moveSeq + 1,
    currentPlayerId: nextCurrent,
  };
}

async function fetchSocketAccessToken(): Promise<string> {
  const res = await fetch("/api/auth/socket-token", {
    credentials: "include",
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`socket-token: ${res.status}`);
  }
  const data = (await res.json()) as { token?: string };
  if (typeof data.token !== "string" || !data.token) {
    throw new Error("socket-token: missing token");
  }
  return data.token;
}

type SocketAuth = { token: string };

let sharedSocket: Socket | null = null;
let sharedAuth: SocketAuth | null = null;
let attachCount = 0;

function destroySharedSocket(): void {
  if (sharedSocket) {
    sharedSocket.removeAllListeners();
    sharedSocket.disconnect();
    sharedSocket = null;
  }
  sharedAuth = null;
}

/**
 * Lazily creates a single Socket.io client for the app tab (auto-reconnect via socket.io-client).
 */
export async function getGameSocket(): Promise<Socket> {
  const token = await fetchSocketAccessToken();
  const baseUrl = defaultSocketBaseUrl();

  if (sharedSocket && sharedAuth?.token !== token) {
    destroySharedSocket();
  }

  if (!sharedSocket) {
    sharedSocket = io(baseUrl, {
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 800,
      transports: ["websocket", "polling"],
      auth: { token },
    });
    sharedAuth = { token };
  }

  return sharedSocket;
}

export function attachGameSocketConsumer(): void {
  attachCount += 1;
}

export function detachGameSocketConsumer(): void {
  attachCount = Math.max(0, attachCount - 1);
  if (attachCount === 0) {
    destroySharedSocket();
  }
}

export interface UseGameSocketOptions {
  /** Authenticated user id (must match JWT / `currentPlayerId` when it is their turn). */
  userId: string;
  /** From GET /rooms/:id before first `player_joined` (optional). */
  initialLobbyPlayers?: RoomLobbyPlayer[] | null;
}

export interface UseGameSocketResult {
  gameState: GameStatePayload | null;
  submitMove: (input: MoveInput) => void;
  sendPlayerReady: () => void;
  connectionStatus: GameConnectionStatus;
  lastMoveSeq: number;
  raceResults: GameEndResultRow[] | null;
  socketError: { code: string; message: string } | null;
  lobbyPlayers: RoomLobbyPlayer[] | null;
  /** Epoch ms when 3-2-1-GO overlay should end (TASK-014). */
  raceCountdownUntil: number | null;
  /** User ids reported offline via `player_connection_change` (TASK-014). */
  offlineUserIds: string[];
}

/**
 * Connects to the game gateway, joins `roomId`, keeps state in sync with optimistic moves + reconciliation.
 */
export function useGameSocket(
  roomId: string | null,
  options: UseGameSocketOptions,
): UseGameSocketResult {
  const { userId, initialLobbyPlayers } = options;
  const [gameState, setGameState] = useState<GameStatePayload | null>(null);
  const [connectionStatus, setConnectionStatus] =
    useState<GameConnectionStatus>("idle");
  const [raceResults, setRaceResults] = useState<GameEndResultRow[] | null>(
    null,
  );
  const [socketError, setSocketError] = useState<{
    code: string;
    message: string;
  } | null>(null);
  const [lobbyPlayers, setLobbyPlayers] = useState<RoomLobbyPlayer[] | null>(
    initialLobbyPlayers ?? null,
  );
  const [raceCountdownUntil, setRaceCountdownUntil] = useState<number | null>(
    null,
  );
  const [offlineUserIds, setOfflineUserIds] = useState<string[]>([]);

  const lastAckMoveSeqRef = useRef(0);
  const preOptimisticRef = useRef<GameStatePayload | null>(null);
  const gameStateRef = useRef<GameStatePayload | null>(null);
  gameStateRef.current = gameState;

  const lastMoveSeq = gameState?.moveSeq ?? lastAckMoveSeqRef.current;

  useEffect(() => {
    if (initialLobbyPlayers && initialLobbyPlayers.length > 0) {
      setLobbyPlayers(initialLobbyPlayers);
    }
  }, [roomId, initialLobbyPlayers]);

  const applyStateUpdate = useCallback((payload: StateUpdatePayload) => {
    const { gameState: incoming, moveSeq } = payload;
    if (moveSeq <= lastAckMoveSeqRef.current) {
      return;
    }
    // Server payload is always authoritative; `GAME_STATE_RECONCILE_POSITION_THRESHOLD_WORLD`
    // documents the sync contract (see maxCarPositionDriftWorld + game-client tests).
    setGameState(incoming);
    lastAckMoveSeqRef.current = moveSeq;
    preOptimisticRef.current = null;
  }, []);

  useEffect(() => {
    if (!roomId || !userId) {
      setConnectionStatus("idle");
      return;
    }

    let cancelled = false;
    const removals: Array<() => void> = [];
    attachGameSocketConsumer();

    setConnectionStatus("connecting");
    setSocketError(null);

    void getGameSocket()
      .then((socket) => {
        if (cancelled) {
          return;
        }

        const onConnect = () => {
          if (cancelled) {
            return;
          }
          setConnectionStatus("connected");
          socket.emit("join_room", { roomId });
        };

        const onDisconnect = () => {
          if (cancelled) {
            return;
          }
          setConnectionStatus("disconnected");
        };

        const onReconnectAttempt = () => {
          if (cancelled) {
            return;
          }
          setConnectionStatus("reconnecting");
        };

        const onConnectError = () => {
          if (cancelled) {
            return;
          }
          setConnectionStatus("error");
        };

        const onGameStart = (payload: GameStartPayload) => {
          if (cancelled) {
            return;
          }
          lastAckMoveSeqRef.current = payload.moveSeq;
          preOptimisticRef.current = null;
          setRaceCountdownUntil(null);
          setGameState(payload.gameState);
          setRaceResults(null);
        };

        const onStateUpdate = (payload: StateUpdatePayload) => {
          if (cancelled) {
            return;
          }
          applyStateUpdate(payload);
        };

        const onGameEnd = (payload: { results: GameEndResultRow[] }) => {
          if (cancelled) {
            return;
          }
          setRaceResults(payload.results ?? []);
          lastAckMoveSeqRef.current = 0;
          setGameState(null);
          setRaceCountdownUntil(null);
        };

        const onPlayerJoined = (payload: { players?: RoomLobbyPlayer[] }) => {
          if (cancelled) {
            return;
          }
          const list = payload?.players;
          if (Array.isArray(list)) {
            setLobbyPlayers(list);
          }
        };

        const onRaceCountdown = (payload: { totalMs?: number }) => {
          if (cancelled) {
            return;
          }
          const ms =
            typeof payload?.totalMs === "number" && payload.totalMs > 0
              ? payload.totalMs
              : 4000;
          setRaceCountdownUntil(Date.now() + ms);
        };

        const onPlayerConnectionChange = (payload: {
          userId?: string;
          online?: boolean;
        }) => {
          if (cancelled) {
            return;
          }
          const uid = payload?.userId;
          if (typeof uid !== "string" || !uid) {
            return;
          }
          const online = payload.online === true;
          setOfflineUserIds((prev) => {
            const set = new Set(prev);
            if (online) {
              set.delete(uid);
            } else {
              set.add(uid);
            }
            return Array.from(set);
          });
        };

        const onError = (payload: { code?: string; message?: string }) => {
          if (cancelled) {
            return;
          }
          const code =
            typeof payload.code === "string" ? payload.code : "ERROR";
          const message =
            typeof payload.message === "string"
              ? payload.message
              : "Unknown error";
          setSocketError({ code, message });

          const rollbackCodes = new Set([
            "STALE_MOVE_SEQ",
            "NOT_YOUR_TURN",
            "GAME_NOT_ACTIVE",
            "GAME_CORRUPT",
            "GAME_INVALID",
            "NO_CAR_STATS",
            "NO_CAR_STATE",
          ]);
          if (rollbackCodes.has(code) && preOptimisticRef.current) {
            setGameState(preOptimisticRef.current);
            preOptimisticRef.current = null;
          }
        };

        socket.on("connect", onConnect);
        removals.push(() => socket.off("connect", onConnect));

        socket.on("disconnect", onDisconnect);
        removals.push(() => socket.off("disconnect", onDisconnect));

        socket.io.on("reconnect_attempt", onReconnectAttempt);
        removals.push(() =>
          socket.io.off("reconnect_attempt", onReconnectAttempt),
        );

        socket.on("connect_error", onConnectError);
        removals.push(() => socket.off("connect_error", onConnectError));

        socket.on("game_start", onGameStart);
        removals.push(() => socket.off("game_start", onGameStart));

        socket.on("state_update", onStateUpdate);
        removals.push(() => socket.off("state_update", onStateUpdate));

        socket.on("game_end", onGameEnd);
        removals.push(() => socket.off("game_end", onGameEnd));

        socket.on("player_joined", onPlayerJoined);
        removals.push(() => socket.off("player_joined", onPlayerJoined));

        socket.on("race_countdown", onRaceCountdown);
        removals.push(() => socket.off("race_countdown", onRaceCountdown));

        socket.on("player_connection_change", onPlayerConnectionChange);
        removals.push(() =>
          socket.off("player_connection_change", onPlayerConnectionChange),
        );

        socket.on("error", onError);
        removals.push(() => socket.off("error", onError));

        if (socket.connected) {
          onConnect();
        }
      })
      .catch(() => {
        if (!cancelled) {
          setConnectionStatus("error");
        }
      });

    return () => {
      cancelled = true;
      for (const off of removals) {
        off();
      }
      removals.length = 0;
      detachGameSocketConsumer();
      lastAckMoveSeqRef.current = 0;
      preOptimisticRef.current = null;
      setGameState(null);
      setRaceResults(null);
      setRaceCountdownUntil(null);
      setOfflineUserIds([]);
      setLobbyPlayers(null);
    };
  }, [roomId, userId, applyStateUpdate]);

  const sendPlayerReady = useCallback(() => {
    if (!roomId) {
      return;
    }
    void getGameSocket().then((socket) => {
      socket.emit("player_ready");
    });
  }, [roomId]);

  const submitMove = useCallback(
    (input: MoveInput) => {
      const current = gameStateRef.current;
      if (!current || !roomId) {
        return;
      }
      if (current.currentPlayerId !== userId) {
        return;
      }

      const clientMoveSeq = current.moveSeq;
      preOptimisticRef.current = current;
      setGameState(applyOptimisticMove(current, userId, input));

      void getGameSocket().then((socket) => {
        socket.emit("submit_move", {
          inputX: input.inputX,
          inputY: input.inputY,
          clientMoveSeq,
        });
      });
    },
    [roomId, userId],
  );

  return {
    gameState,
    submitMove,
    sendPlayerReady,
    connectionStatus,
    lastMoveSeq,
    raceResults,
    socketError,
    lobbyPlayers,
    raceCountdownUntil,
    offlineUserIds,
  };
}
