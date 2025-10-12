import fs from "fs/promises";
import path from "path";

const DATA = path.join(process.cwd(), "data", "drafts.json");

export type DraftPlayer = { id: string; gamertag: string; roles: string[] };
export type DraftTeam = {
  id: string;
  name: string;
  players: string[]; // массив id игроков
  captainId?: string; // id капитана (если назначен)
  draftOrder?: number; // номер очереди при драфте
};
export type DraftPick = { teamId: string; playerId: string; ts: number };
export type DraftMatch = { round: number; homeId: string; awayId: string };
export type DraftSession = {
  id: string;
  name: string;
  status: "planned" | "live" | "finished";
  registered: DraftPlayer[];
  captains: string[];       // id игроков
  teams: DraftTeam[];       // обычно 4 команды
  picks: DraftPick[];
  schedule: DraftMatch[];
};

type Store = { sessions: DraftSession[] };

async function ensureFile(): Promise<Store> {
  await fs.mkdir(path.dirname(DATA), { recursive: true });
  try {
    const raw = await fs.readFile(DATA, "utf8");
    return JSON.parse(raw) as Store;
  } catch (error: unknown) {
    if (isNodeErrorWithCode(error, "ENOENT")) return { sessions: [] };
    throw error;
  }
}

function isNodeErrorWithCode(error: unknown, code: string): error is NodeJS.ErrnoException {
  return typeof error === "object" && error !== null && "code" in error && (error as NodeJS.ErrnoException).code === code;
}

export async function readStore() {
  return ensureFile();
}

export async function writeStore(s: Store) {
  await fs.writeFile(DATA, JSON.stringify(s, null, 2));
}
