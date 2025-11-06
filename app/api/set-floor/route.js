// app/api/set-floor/route.js
export const dynamic = 'force-dynamic';

import { loadGameState, saveGameState } from '../../../lib/gameState';

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
