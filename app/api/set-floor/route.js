// app/api/set-floor/route.js
import { promises as fs } from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

const GAME_FILE = path.join(process.cwd(), 'game-state.json');

async function loadGameState() {
  try {
    const data = await fs.readFile(GAME_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (e) {
    return {
      turn: 1,
      floor: 80,
      market: 82,
      inflation: 1.1,
      privateShare: 0.7,
      sentiment: 0.2,
      cqeBuy: 0,
      totalMitigation: 0,
      lastEvent: null,
      projects: [],
      history: [],
      members: [],
      credibility: 1.0,
      lastFloorChangeTurn: 0,
      floorStep: 5,
    };
  }
}

async function saveGameState(state) {
  await fs.writeFile(GAME_FILE, JSON.stringify(state, null, 2), 'utf-8');
}

export async function POST(request) {
  const body = await request.json();
  const { floor } = body;

  if (typeof floor !== 'number' || Number.isNaN(floor) || floor < 10) {
    return new Response(JSON.stringify({ error: 'bad floor' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const state = await loadGameState();
  state.floor = floor;
  state.lastFloorChangeTurn = state.turn;

  // if the market is currently below the new floor, lift it
  if (state.market < state.floor) {
    state.market = state.floor;
  }

  await saveGameState(state);

  return new Response(JSON.stringify({ ok: true, floor: state.floor }), {
    headers: { 'Content-Type': 'application/json' },
  });
}
