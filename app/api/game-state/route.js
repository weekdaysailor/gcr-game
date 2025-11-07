// app/api/game-state/route.js
export const dynamic = 'force-dynamic';

import { loadGameState } from '../../../lib/gameState';

export async function GET() {
  const state = await loadGameState();
  return new Response(JSON.stringify(state), {
    headers: { 'Content-Type': 'application/json' },
  });
}
