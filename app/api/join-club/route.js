// app/api/join-club/route.js
import { promises as fs } from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';
const GAME_FILE = path.join(process.cwd(), 'game-state.json');

async function loadGameState() {
  try {
    const data = await fs.readFile(GAME_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    return {
      turn: 1,
      members: [],
      votes: [],
    };
  }
}

async function saveGameState(state) {
  await fs.writeFile(GAME_FILE, JSON.stringify(state, null, 2), 'utf-8');
}

export async function POST(request) {
  const body = await request.json();
  const { country } = body;

  let state = await loadGameState();
  state.members = state.members || [];
  state.votes = Array.isArray(state.votes) ? state.votes : [];

  if (!state.members.find((m) => m.country === country)) {
    state.members.push({ country, joinedAt: new Date().toISOString() });
  }

  await saveGameState(state);

  return new Response(
    JSON.stringify({ ok: true, members: state.members, votes: state.votes }),
    {
      headers: { 'Content-Type': 'application/json' },
    }
  );
}

export async function GET() {
  const state = await loadGameState();
  return new Response(
    JSON.stringify({ members: state.members || [], votes: state.votes || [] }),
    {
      headers: { 'Content-Type': 'application/json' },
    }
  );
}
