/**
 * Shared game types, physics, and constants (no Prisma / DB runtime).
 * Models and gameplay types land here in later tasks.
 */
export const VECTOR_RACERS_SHARED_VERSION = '0.0.0';

export * from "./types";
export * from "./physics";

export { applyMove } from "./physics";
