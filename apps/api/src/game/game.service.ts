import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaClient, RoomStatus } from '@vector-racers/db';
import {
  applyMove,
  type CarState,
  type CarStats,
  type GameStatePayload,
  type MoveInput,
  type ReplayMoveEntry,
  type TrackDef,
} from '@vector-racers/shared';
import { RedisService } from '../redis/redis.service';
import { RoomsService } from '../rooms/rooms.service';
import type { RoomRedisSnapshot } from '../rooms/room-redis.types';
import type {
  GameEndResultRow,
  PlayerJoinedPlayer,
  StateUpdatePayload,
  StoredRaceGame,
} from './game.types';

export class GameMoveError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
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

function parseTrackDef(waypointsJson: string): TrackDef {
  try {
    const v = JSON.parse(waypointsJson) as TrackDef;
    if (
      !v ||
      !Array.isArray(v.waypoints) ||
      typeof v.halfWidth !== 'number' ||
      typeof v.lapCount !== 'number'
    ) {
      throw new Error('invalid shape');
    }
    return v;
  } catch {
    throw new BadRequestException('Invalid track definition in database');
  }
}

function parseCarStats(statsJson: string): CarStats {
  try {
    const v = JSON.parse(statsJson) as CarStats;
    if (
      typeof v?.speed !== 'number' ||
      typeof v?.acceleration !== 'number' ||
      typeof v?.grip !== 'number' ||
      typeof v?.mass !== 'number'
    ) {
      throw new Error('invalid');
    }
    return v;
  } catch {
    throw new BadRequestException('Invalid car stats in database');
  }
}

/** Spawn along the first segment normal; deterministic order by `playerOrder`. */
function initialCarStates(
  track: TrackDef,
  playerOrder: string[],
): Record<string, CarState> {
  const wps = track.waypoints;
  if (wps.length < 2) {
    throw new BadRequestException('Track needs at least two waypoints');
  }
  const [x0, y0] = wps[0]!;
  const [x1, y1] = wps[1]!;
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.hypot(dx, dy) || 1;
  const px = -dy / len;
  const py = dx / len;
  const gap = 14;
  const n = playerOrder.length;
  const out: Record<string, CarState> = {};
  for (let i = 0; i < n; i++) {
    const uid = playerOrder[i]!;
    const t = i - (n - 1) / 2;
    out[uid] = {
      x: x0 + px * gap * t,
      y: y0 + py * gap * t,
      vx: 0,
      vy: 0,
      laps: 0,
      mid: false,
      prog: 0,
      offTrack: false,
    };
  }
  return out;
}

function toGameStatePayload(g: StoredRaceGame): GameStatePayload {
  const { race, playerOrder } = g;
  const n = playerOrder.length;
  const currentPlayerId =
    n > 0 ? playerOrder[((race.turnIndex % n) + n) % n]! : '';
  return {
    cars: race.cars,
    turnIndex: race.turnIndex,
    track: race.track,
    moveSeq: race.moveSeq,
    currentPlayerId,
    playerOrder,
    carStatsByUserId: race.carStatsByUserId,
  };
}

@Injectable()
export class GameService {
  private readonly logger = new Logger(GameService.name);

  constructor(
    private readonly prisma: PrismaClient,
    private readonly redisService: RedisService,
    private readonly roomsService: RoomsService,
  ) {}

  private get redis() {
    return this.redisService.redis;
  }

  private gameKey(roomId: string): string {
    return `game:${roomId}`;
  }

  async loadStoredGame(roomId: string): Promise<StoredRaceGame | null> {
    const raw = await this.redis.get(this.gameKey(roomId));
    if (!raw) {
      return null;
    }
    try {
      return JSON.parse(raw) as StoredRaceGame;
    } catch {
      this.logger.warn(`Corrupt game payload for ${roomId}, dropping`);
      await this.redis.del(this.gameKey(roomId));
      return null;
    }
  }

  async buildPlayerJoinedPayload(
    snapshot: RoomRedisSnapshot,
  ): Promise<{ players: PlayerJoinedPlayer[] }> {
    const userIds = snapshot.players.map((p) => p.userId);
    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, username: true },
    });
    const nameById = new Map(users.map((u) => [u.id, u.username] as const));
    const players: PlayerJoinedPlayer[] = snapshot.players.map((p) => ({
      userId: p.userId,
      username: nameById.get(p.userId) ?? p.userId,
      carId: p.carId,
      position: p.position,
      laps: p.laps,
      isReady: p.isReady,
    }));
    return { players };
  }

  async tryResyncAfterJoin(roomId: string): Promise<{
    gameState: GameStatePayload;
    playerOrder: string[];
    moveSeq: number;
  } | null> {
    const stored = await this.loadStoredGame(roomId);
    if (!stored) {
      return null;
    }
    return {
      gameState: toGameStatePayload(stored),
      playerOrder: stored.playerOrder,
      moveSeq: stored.race.moveSeq,
    };
  }

  async onPlayerReady(
    userId: string,
    roomId: string,
  ): Promise<{
    playerJoined: { players: PlayerJoinedPlayer[] };
    /** All players ready: gateway shows countdown then calls `finalizeScheduledRaceStart`. */
    raceCountdownPending?: true;
  }> {
    const snapshot = await this.roomsService.markPlayerReady(roomId, userId);
    const playerJoined = await this.buildPlayerJoinedPayload(snapshot);

    if (
      snapshot.status === RoomStatus.WAITING &&
      snapshot.players.length > 0 &&
      snapshot.players.every((p) => p.isReady)
    ) {
      return { playerJoined, raceCountdownPending: true };
    }

    return { playerJoined };
  }

  /**
   * After client-side 3-2-1-GO countdown (TASK-014). No-op if lobby state changed.
   */
  async finalizeScheduledRaceStart(roomId: string): Promise<{
    gameState: GameStatePayload;
    playerOrder: string[];
    moveSeq: number;
  } | null> {
    const snapshot = await this.roomsService.loadRoomSnapshot(roomId);
    if (!snapshot || snapshot.status !== RoomStatus.WAITING) {
      return null;
    }
    if (
      snapshot.players.length === 0 ||
      !snapshot.players.every((p) => p.isReady)
    ) {
      return null;
    }
    return this.startRace(roomId, snapshot);
  }

  private async startRace(
    roomId: string,
    snapshot: RoomRedisSnapshot,
  ): Promise<{
    gameState: GameStatePayload;
    playerOrder: string[];
    moveSeq: number;
  }> {
    const trackRow = await this.prisma.track.findUnique({
      where: { id: snapshot.trackId },
    });
    if (!trackRow) {
      throw new NotFoundException('Track not found');
    }
    const track = parseTrackDef(trackRow.waypointsJson);

    const ordered = [...snapshot.players].sort(
      (a, b) => a.position - b.position,
    );
    const playerOrder = ordered.map((p) => p.userId);

    const carRows = await this.prisma.car.findMany({
      where: { id: { in: ordered.map((p) => p.carId) } },
    });
    const statsByCarId = new Map(
      carRows.map((c) => [c.id, parseCarStats(c.stats)] as const),
    );

    const carStatsByUserId: Record<string, CarStats> = {};
    for (const p of ordered) {
      const st = statsByCarId.get(p.carId);
      if (!st) {
        throw new NotFoundException(`Car ${p.carId} not found`);
      }
      carStatsByUserId[p.userId] = st;
    }

    const replay = await this.prisma.replay.create({
      data: { roomId, movesJson: '[]' },
    });

    const cars = initialCarStates(track, playerOrder);

    const stored: StoredRaceGame = {
      roomId,
      replayId: replay.id,
      playerOrder,
      race: {
        cars,
        turnIndex: 0,
        track,
        moveSeq: 0,
        carStatsByUserId,
      },
    };

    await this.redis.set(this.gameKey(roomId), JSON.stringify(stored));
    await this.roomsService.setRoomStatus(roomId, RoomStatus.RACING);

    return {
      gameState: toGameStatePayload(stored),
      playerOrder,
      moveSeq: stored.race.moveSeq,
    };
  }

  async applySubmitMove(
    userId: string,
    roomId: string,
    input: MoveInput,
    clientMoveSeq?: number,
  ): Promise<{
    stateUpdate?: StateUpdatePayload;
    gameEnd?: { results: GameEndResultRow[] };
  }> {
    const raw = await this.redis.get(this.gameKey(roomId));
    if (!raw) {
      throw new GameMoveError('GAME_NOT_ACTIVE', 'No active race in this room');
    }
    let stored: StoredRaceGame;
    try {
      stored = JSON.parse(raw) as StoredRaceGame;
    } catch {
      throw new GameMoveError('GAME_CORRUPT', 'Race state is corrupt');
    }

    const { race, playerOrder, replayId } = stored;
    const n = playerOrder.length;
    if (n === 0) {
      throw new GameMoveError('GAME_INVALID', 'Race has no players');
    }

    const currentId =
      playerOrder[((race.turnIndex % n) + n) % n]!;
    if (userId !== currentId) {
      throw new GameMoveError('NOT_YOUR_TURN', 'It is not your turn');
    }

    if (
      clientMoveSeq !== undefined &&
      clientMoveSeq !== race.moveSeq
    ) {
      throw new GameMoveError(
        'STALE_MOVE_SEQ',
        'Move sequence does not match server; refresh state',
      );
    }

    const clamped = clampMoveInput(input);
    const stats = race.carStatsByUserId[userId];
    if (!stats) {
      throw new GameMoveError('NO_CAR_STATS', 'Missing car stats for player');
    }

    const prev = race.cars[userId];
    if (!prev) {
      throw new GameMoveError('NO_CAR_STATE', 'Missing car state for player');
    }

    const physicsTrack = {
      ...race.track,
      ...stats,
    };

    const nextCar = applyMove(prev, clamped, physicsTrack);
    const nextCars: Record<string, CarState> = {
      ...race.cars,
      [userId]: nextCar,
    };

    const nextMoveSeq = race.moveSeq + 1;

    await this.appendReplayMove(replayId, {
      moveSeq: nextMoveSeq,
      userId,
      input: clamped,
    });

    const lapTarget = race.track.lapCount;
    const allDone = playerOrder.every(
      (pid) => (nextCars[pid]?.laps ?? 0) >= lapTarget,
    );

    if (allDone) {
      const results = this.rankResults(nextCars, playerOrder);
      await this.redis.del(this.gameKey(roomId));
      await this.roomsService.setRoomStatus(roomId, RoomStatus.FINISHED);
      return { gameEnd: { results } };
    }

    const nextTurn = (race.turnIndex + 1) % n;
    const nextStored: StoredRaceGame = {
      ...stored,
      race: {
        ...race,
        cars: nextCars,
        turnIndex: nextTurn,
        moveSeq: nextMoveSeq,
      },
    };
    await this.redis.set(this.gameKey(roomId), JSON.stringify(nextStored));

    const stateUpdate: StateUpdatePayload = {
      gameState: toGameStatePayload(nextStored),
      lastMove: { userId, input: clamped },
      moveSeq: nextMoveSeq,
    };
    return { stateUpdate };
  }

  private rankResults(
    cars: Record<string, CarState>,
    playerOrder: string[],
  ): GameEndResultRow[] {
    const rows = playerOrder.map((userId) => {
      const c = cars[userId]!;
      return { userId, laps: c.laps, prog: c.prog };
    });
    rows.sort((a, b) => {
      if (b.laps !== a.laps) {
        return b.laps - a.laps;
      }
      if (b.prog !== a.prog) {
        return b.prog - a.prog;
      }
      return a.userId.localeCompare(b.userId);
    });
    return rows.map((r, i) => ({
      userId: r.userId,
      laps: r.laps,
      finishPosition: i + 1,
    }));
  }

  private async appendReplayMove(
    replayId: string,
    entry: ReplayMoveEntry,
  ): Promise<void> {
    const row = await this.prisma.replay.findUnique({
      where: { id: replayId },
      select: { movesJson: true },
    });
    if (!row) {
      this.logger.error(`Replay ${replayId} missing while appending move`);
      return;
    }
    let list: ReplayMoveEntry[] = [];
    try {
      list = JSON.parse(row.movesJson) as ReplayMoveEntry[];
      if (!Array.isArray(list)) {
        list = [];
      }
    } catch {
      list = [];
    }
    list.push(entry);
    await this.prisma.replay.update({
      where: { id: replayId },
      data: { movesJson: JSON.stringify(list) },
    });
  }
}
