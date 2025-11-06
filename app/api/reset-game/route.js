// app/api/reset-game/route.js
export const dynamic = 'force-dynamic';

import { createDefaultState, saveGameState } from '../../../lib/gameState';

export async function POST() {
  const fresh = await createDefaultState();
  await saveGameState(fresh);
  return new Response(JSON.stringify(fresh), {
    headers: { 'Content-Type': 'application/json' },
  });
}
