import fs from "fs/promises";
import path from "path";

const DATA = path.join(process.cwd(), "data", "drafts.json");

type DraftPlayer = { id: string; gamertag: string; roles: string[] };
type DraftTeam = { id: string; name: string; players: string[] }; // массив id игроков
export type DraftSession = {
  id: string;
  name: string;
  status: "planned" | "live" | "finished";
  registered: DraftPlayer[];
  captains: string[];       // id игроков
  teams: DraftTeam[];       // обычно 4 команды
  picks: { teamId: string; playerId: string; ts: number }[];
  schedule: { round: number; homeId: string; awayId: string }[];
};

type Store = { sessions: DraftSession[] };

async function ensureFile(): Promise<Store> {
  await fs.mkdir(path.dirname(DATA), { recursive: true });
  try {
    const raw = await fs.readFile(DATA, "utf8");
    return JSON.parse(raw) as Store;
  } catch (e: any) {
    if (e.code === "ENOENT") return { sessions: [] };
    throw e;
  }
}

export async function readStore() {
  return ensureFile();
}

export async function writeStore(s: Store) {
  await fs.writeFile(DATA, JSON.stringify(s, null, 2));
}
