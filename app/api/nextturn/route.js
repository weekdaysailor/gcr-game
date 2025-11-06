// app/api/nextturn/route.js
export const dynamic = 'force-dynamic';

import { loadGameState, saveGameState } from '../../../lib/gameState';
import {
  applyProjectUpgrade,
  generateProjects,
  getEventDefinitions,
  getProjectLibrary,
  normalizeProject,
} from '../../../lib/data';

function applyEventOperations(state, event) {
  if (!event) return state;
  for (const operation of event.operations || []) {
    if (!operation) continue;
    if (operation.type === 'stat') {
      const target = operation.target;
      if (!target) continue;
      const current = Number(state[target]) || 0;
      const value = Number(operation.value);
      if (!Number.isFinite(value)) continue;
      const op = (operation.operation || 'add').toLowerCase();
      if (op === 'set') {
        state[target] = value;
      } else if (op === 'multiply' || op === 'mul' || op === 'times') {
        state[target] = current * value;
      } else {
        state[target] = current + value;
      }
    } else if (operation.type === 'projectUpgrade') {
      applyProjectUpgrade(operation);
    }
  }
  return state;
}

export async function POST(request) {
  const clientState = await request.json();
  const { chosenProjectId, floorDecision, playerCountry } = clientState;

  let state = await loadGameState();
  state.votes = Array.isArray(state.votes) ? state.votes : [];

  // start of turn
  state.incomingSupply = 0;

  // make sure player is a member
  if (playerCountry) {
    const exists = state.members.find((m) => m.country === playerCountry);
    if (!exists) {
      state.members.push({ country: playerCountry, joinedAt: new Date().toISOString() });
    }
  }

  // 1) apply chosen project
  const projectLibrary = await getProjectLibrary();

  let projectAvoidedEmissions = 0;
  let rewardAmount = 0;
  if (chosenProjectId) {
    const fromState = Array.isArray(state.projects)
      ? state.projects.find((p) => p && p.id === chosenProjectId)
      : null;
    const rawProject = fromState || projectLibrary.find((p) => p.id === chosenProjectId);
    const proj = normalizeProject(rawProject);
    if (proj) {
      state.totalMitigation += proj.co2eMitigation;
      state.sentiment += proj.sentimentEffect;
      state.incomingSupply = (state.incomingSupply || 0) + proj.supplyPressure;

      projectAvoidedEmissions = proj.co2eMitigation;
      rewardAmount = proj.xcrBid || proj.co2eMitigation;
    }
  } else {
    state.incomingSupply = state.incomingSupply || 0;
  }

  // 2) event
  const events = await getEventDefinitions();
  let event = null;
  if (events.length) {
    event = events[Math.floor(Math.random() * events.length)];
    applyEventOperations(state, event);
    state.lastEvent = {
      id: event.id,
      title: event.title,
      description: event.description,
      justified: event.justified === true,
      occurredAt: new Date().toISOString(),
    };
  } else {
    state.lastEvent = null;
  }

  // 3) clamp to client view to stop wild jumps
  const prevSentiment = clientState.sentiment ?? 0;
  const prevPrivateShare = clientState.privateShare ?? 0;
  const prevInflation = clientState.inflation ?? 0;

  const MAX_SENTIMENT_STEP = 0.04;
  const sDelta = state.sentiment - prevSentiment;
  if (sDelta > MAX_SENTIMENT_STEP) {
    state.sentiment = prevSentiment + MAX_SENTIMENT_STEP;
  } else if (sDelta < -MAX_SENTIMENT_STEP) {
    state.sentiment = prevSentiment - MAX_SENTIMENT_STEP;
  }

  const MAX_PRIVATE_STEP = 0.03;
  const pDelta = state.privateShare - prevPrivateShare;
  if (pDelta > MAX_PRIVATE_STEP) {
    state.privateShare = prevPrivateShare + MAX_PRIVATE_STEP;
  } else if (pDelta < -MAX_PRIVATE_STEP) {
    state.privateShare = prevPrivateShare - MAX_PRIVATE_STEP;
  }

  const MAX_INFL_STEP = 0.02;
  const iDelta = state.inflation - prevInflation;
  if (iDelta > MAX_INFL_STEP) {
    state.inflation = prevInflation + MAX_INFL_STEP;
  }

  // 4) floor forward-guidance
  const FLOOR_COOLDOWN = 3;
  let guidanceBroken = false;

  if (floorDecision && floorDecision !== 'hold') {
    const turnsSince = state.turn - (state.lastFloorChangeTurn || 0);
    const allowed = turnsSince >= FLOOR_COOLDOWN || (event && event.justified === true);

    if (allowed) {
      if (floorDecision === 'raise') {
        state.floor += state.floorStep;
      } else if (floorDecision === 'lower') {
        state.floor -= state.floorStep;
        if (state.floor < 10) state.floor = 10;
      }
      state.lastFloorChangeTurn = state.turn;
    } else {
      guidanceBroken = true;
      state.credibility -= 0.1;
      if (state.credibility < 0) state.credibility = 0;
      state.privateShare -= 0.05;
      if (state.privateShare < 0) state.privateShare = 0;
    }
  }

  // 5) market move ONCE
  const supplyShock = Math.min(state.incomingSupply || 0, 500000);
  let newMarket =
    (state.market || 0) + state.sentiment * 5 - supplyShock * 0.00001;

  // 6) CQE if needed
  state.cqeBuy = 0;
  if (newMarket < state.floor) {
    const gap = state.floor - newMarket;
    const rawCqe = gap * (1 - state.privateShare);
    state.cqeBuy = Math.max(0, rawCqe);
    newMarket = state.floor;
    state.inflation += state.cqeBuy * 0.001;
  }

  state.market = newMarket;

  // 7) private capital reacts
  state.privateShare +=
    0.02 * state.sentiment -
    0.02 * state.inflation +
    0.03 * (state.credibility - 0.5);
  state.privateShare = Math.max(0, Math.min(1, state.privateShare));

  // 8) history
  state.history = state.history || [];
  state.history.unshift({
    turn: state.turn,
    event: event ? event.title : 'none',
    project: chosenProjectId || 'none',
    floor: state.floor,
    market: state.market,
    mitigation: projectAvoidedEmissions,
    xcrAwarded: rewardAmount,
    inflation: state.inflation,
    guidanceBroken,
    time: new Date().toISOString(),
  });
  state.history = state.history.slice(0, 20);

  // 9) next turn
  state.turn += 1;
  state.projects = await generateProjects();

  await saveGameState(state);

  return new Response(JSON.stringify(state), {
    headers: { 'Content-Type': 'application/json' },
  });
}
