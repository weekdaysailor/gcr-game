// app/api/votes/route.js
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
      votes: [],
    };
  }
}

async function saveGameState(state) {
  await fs.writeFile(GAME_FILE, JSON.stringify(state, null, 2), 'utf-8');
}

const VALID_VOTES = new Set(['hold', 'raise', 'lower']);

export async function GET() {
  const state = await loadGameState();
  return new Response(
    JSON.stringify({ votes: Array.isArray(state.votes) ? state.votes : [] }),
    {
      headers: { 'Content-Type': 'application/json' },
    }
  );
}

export async function POST(request) {
  const body = await request.json();
  const { vote, turn } = body;
  const countryInput = typeof body.country === 'string' ? body.country.trim() : '';
  const country = countryInput.toUpperCase();

  if (!country) {
    return new Response(JSON.stringify({ error: 'country required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!VALID_VOTES.has(vote)) {
    return new Response(JSON.stringify({ error: 'invalid vote' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const state = await loadGameState();
  const votes = Array.isArray(state.votes) ? state.votes : [];
  const now = new Date().toISOString();
  let parsedTurn = Number(turn);
  if (!Number.isFinite(parsedTurn)) {
    const coerced = Number.parseInt(turn, 10);
    parsedTurn = Number.isFinite(coerced) ? coerced : undefined;
  }

  const numericStateTurn = Number(Number(state.turn));
  const stateTurn = Number.isFinite(numericStateTurn) && numericStateTurn > 0 ? numericStateTurn : 1;
  const normalizedTurn = Number.isFinite(parsedTurn) ? parsedTurn : Math.max(1, stateTurn);

  const existingIndex = votes.findIndex((v) => v.country === country);
  const entry = { country, vote, updatedAt: now, turn: normalizedTurn };

  if (existingIndex >= 0) {
    votes[existingIndex] = { ...votes[existingIndex], ...entry };
  } else {
    votes.push(entry);
  }

  state.votes = votes;
  await saveGameState(state);

  return new Response(JSON.stringify({ ok: true, votes }), {
    headers: { 'Content-Type': 'application/json' },
  });
}
