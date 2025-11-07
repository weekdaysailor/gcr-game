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
import { advanceTimeState } from '../../../lib/timePhase';
import { createCoalitionManager } from '../../../lib/coalition';
import { updateCoordinationIndex } from '../../../lib/coordination';

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
  const { playerCountry, forceAdvance } = clientState;

  let state = await loadGameState();
  state.votes = Array.isArray(state.votes) ? state.votes : [];
  state.turnSubmissions = Array.isArray(state.turnSubmissions) ? state.turnSubmissions : [];
  state.members = Array.isArray(state.members) ? state.members : [];

  // start of turn
  state.incomingSupply = 0;

  // make sure player is a member
  if (playerCountry) {
    const exists = state.members.find((m) => m.country === playerCountry);
    if (!exists) {
      state.members.push({ country: playerCountry, joinedAt: new Date().toISOString() });
    }
  }

  // Check if all players are ready
  const currentTurnSubmissions = state.turnSubmissions.filter((s) => s.turn === state.turn);
  const allReady = state.members.length > 0 &&
                   currentTurnSubmissions.length >= state.members.length;

  // If not all ready and not forcing advance, return waiting status
  if (!allReady && !forceAdvance) {
    const waitingFor = state.members
      .filter((m) => !currentTurnSubmissions.find((s) => s.country === m.country))
      .map((m) => m.country);

    return new Response(
      JSON.stringify({
        ok: false,
        waiting: true,
        waitingFor,
        submissionsCount: currentTurnSubmissions.length,
        totalPlayers: state.members.length,
        message: 'Waiting for all players to submit their turn',
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }

  // Initialize coalition manager
  const coalitionManager = createCoalitionManager(state);

  // Aggregate choices from all players
  // Floor decisions use GDP-weighted voting
  // Project selection uses equal weight (random pick)
  const projectChoices = [];

  currentTurnSubmissions.forEach((submission) => {
    if (submission.chosenProjectId) {
      projectChoices.push(submission.chosenProjectId);
    }
  });

  // Check for supermajority on floor decision (GDP-weighted)
  const floorVotes = currentTurnSubmissions
    .filter(s => s.floorDecision)
    .map(s => ({
      country: s.country,
      vote: s.floorDecision,
    }));

  const supermajorityResult = coalitionManager.checkSupermajorityVote(
    floorVotes,
    state.members,
    'floor'
  );

  let floorDecision = supermajorityResult.decision;
  const supermajorityPassed = supermajorityResult.passed;

  // Pick a random project from the choices (equal weight)
  const chosenProjectId = projectChoices.length > 0
    ? projectChoices[Math.floor(Math.random() * projectChoices.length)]
    : null;

  // 1) apply chosen project
  const projectLibrary = await getProjectLibrary();

  let projectAvoidedEmissions = 0;
  let rewardAmount = 0;
  let appliedRMultiplier = 1.0;

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

      // Get R multiplier from project adjustments
      const projectRAdjustments = state.projectRAdjustments?.[chosenProjectId] || {};
      const rValues = Object.values(projectRAdjustments).map(adj => adj.R);

      // Check for R consensus (all submitted values must be the same)
      if (rValues.length > 0) {
        const uniqueRValues = [...new Set(rValues)];
        if (uniqueRValues.length === 1) {
          // Consensus exists - use the agreed R value
          appliedRMultiplier = uniqueRValues[0];
        }
        // If no consensus, default to 1.0 (already set above)
      }

      // Apply R multiplier to reward
      const baseReward = proj.xcrBid || proj.co2eMitigation;
      rewardAmount = baseReward * appliedRMultiplier;
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

  // 4.5) Coalition mechanics (Phase 2)
  // Apply supermajority dividend if vote passed
  if (supermajorityPassed && floorDecision !== 'hold') {
    coalitionManager.applySupermajorityDividend({
      credibilityBoost: 10,
      interventionMult: 0.8,
      milestoneBonusPct: 10,
      duration: 4,
    });
  }

  // Decay coalitions
  coalitionManager.decayAll();

  // Update coordination index
  updateCoordinationIndex(state);

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
    year: state.year,
    quarter: state.quarter,
    event: event ? event.title : 'none',
    project: chosenProjectId || 'none',
    floor: state.floor,
    market: state.market,
    mitigation: projectAvoidedEmissions,
    xcrAwarded: rewardAmount,
    rMultiplier: appliedRMultiplier, // Track R multiplier used
    inflation: state.inflation,
    guidanceBroken,
    supermajorityPassed, // Phase 2: track supermajority
    time: new Date().toISOString(),
  });
  state.history = state.history.slice(0, 20);

  // 9) next turn - advance time
  const nextTime = advanceTimeState({
    year: state.year,
    quarter: state.quarter,
    turn: state.turn,
  });

  state.year = nextTime.year;
  state.quarter = nextTime.quarter;
  state.turn = nextTime.turn;
  state.phase = nextTime.phase;
  state.isAnnualAnchor = nextTime.isAnnualAnchor;

  // Generate new projects for next turn
  state.projects = await generateProjects();

  // Clear turn submissions and R adjustments for the new turn
  state.turnSubmissions = [];
  state.projectRAdjustments = {};

  await saveGameState(state);

  return new Response(JSON.stringify(state), {
    headers: { 'Content-Type': 'application/json' },
  });
}
