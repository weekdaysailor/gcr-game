// app/api/submit-turn/route.js
export const dynamic = 'force-dynamic';

import { loadGameState, saveGameState } from '../../../lib/gameState';

export async function POST(request) {
  const body = await request.json();
  const { country, chosenProjectId, floorDecision, rAdjustments } = body;

  if (!country) {
    return new Response(JSON.stringify({ error: 'country required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const state = await loadGameState();
  state.turnSubmissions = Array.isArray(state.turnSubmissions) ? state.turnSubmissions : [];
  state.members = Array.isArray(state.members) ? state.members : [];
  state.projectRAdjustments = state.projectRAdjustments || {};

  // Remove any existing submission from this country for this turn
  state.turnSubmissions = state.turnSubmissions.filter(
    (s) => s.country !== country || s.turn !== state.turn
  );

  // Add new submission
  state.turnSubmissions.push({
    country,
    turn: state.turn,
    chosenProjectId: chosenProjectId || null,
    floorDecision: floorDecision || 'hold',
    submittedAt: new Date().toISOString(),
  });

  // Save R adjustments for this player
  if (rAdjustments && typeof rAdjustments === 'object') {
    Object.keys(rAdjustments).forEach(projectId => {
      if (!state.projectRAdjustments[projectId]) {
        state.projectRAdjustments[projectId] = {};
      }
      state.projectRAdjustments[projectId][country] = rAdjustments[projectId];
    });
  }

  await saveGameState(state);

  // Calculate readiness status
  const currentTurnSubmissions = state.turnSubmissions.filter((s) => s.turn === state.turn);
  const allReady = state.members.length > 0 &&
                   currentTurnSubmissions.length >= state.members.length;
  const waitingFor = state.members
    .filter((m) => !currentTurnSubmissions.find((s) => s.country === m.country))
    .map((m) => m.country);

  return new Response(
    JSON.stringify({
      ok: true,
      allReady,
      waitingFor,
      submissionsCount: currentTurnSubmissions.length,
      totalPlayers: state.members.length,
      turnSubmissions: state.turnSubmissions,
    }),
    {
      headers: { 'Content-Type': 'application/json' },
    }
  );
}

export async function GET() {
  const state = await loadGameState();
  state.turnSubmissions = Array.isArray(state.turnSubmissions) ? state.turnSubmissions : [];
  state.members = Array.isArray(state.members) ? state.members : [];

  const currentTurnSubmissions = state.turnSubmissions.filter((s) => s.turn === state.turn);
  const allReady = state.members.length > 0 &&
                   currentTurnSubmissions.length >= state.members.length;
  const waitingFor = state.members
    .filter((m) => !currentTurnSubmissions.find((s) => s.country === m.country))
    .map((m) => m.country);

  return new Response(
    JSON.stringify({
      allReady,
      waitingFor,
      submissionsCount: currentTurnSubmissions.length,
      totalPlayers: state.members.length,
      turnSubmissions: state.turnSubmissions,
      currentTurn: state.turn,
    }),
    {
      headers: { 'Content-Type': 'application/json' },
    }
  );
}
