import { promises as fs } from 'fs';
import path from 'path';
import { generateProjects, normalizeProject } from './data';
import { initializeTimeState, getPhase } from './timePhase';

const GAME_FILE = path.join(process.cwd(), 'game-state.json');

function baseState() {
  return {
    // Legacy turn counter (maintained for backward compatibility)
    turn: 1,

    // New time tracking (Phase 1)
    year: 2025,
    quarter: 1,
    phase: 1,
    isAnnualAnchor: false,

    // Market & economic state
    floor: 80,
    market: 82,
    inflation: 1.1,
    privateShare: 0.7,
    sentiment: 0.2,
    cqeBuy: 0,

    // Mitigation tracking
    totalMitigation: 0,

    // Events
    lastEvent: null,

    // Projects & history
    projects: [],
    history: [],

    // Members & governance
    members: [],
    credibility: 1.0,
    lastFloorChangeTurn: 0,
    floorStep: 5,
    votes: [],
    turnSubmissions: [],

    // Supply pressure
    incomingSupply: 0,

    // Project R (reward multiplier) adjustments per player
    projectRAdjustments: {},

    // Phase 2: Cooperation & Coalitions
    coalitions: [],
    supermajorityDividend: {
      active: false,
      credibilityBoost: 0,
      interventionMultiplier: 1.0,
      milestoneBonusPct: 0,
      turnsRemaining: 0,
      wasConsecutive: false,
    },
    jointMRVActive: false,
    jointMRVMembers: [],
    jointMRVStartTurn: 0,
    rndSurges: [],
    reciprocityEscrow: {},
    coordinationIndex: {
      value: 0,
      components: {
        coalitionSize: 0,
        supermajorityRate: 0,
        standardsAlignment: 0,
        reciprocity: 0,
      },
      effects: {
        privateDemandMultiplier: 1.0,
        trustPremiumUSD: 0,
        volatilityMultiplier: 1.0,
        interventionProbMultiplier: 1.0,
      },
    },
  };
}

function normalizeProjects(projects) {
  const safe = Array.isArray(projects) ? projects : [];
  return safe
    .map((proj) => normalizeProject(proj))
    .filter((proj) => proj && proj.id);
}

/**
 * Migrate old game state to new time-based system
 * Converts legacy 'turn' to year/quarter/phase
 * Safe to call multiple times - preserves existing time fields if present
 */
function migrateToTimeSystem(state) {
  // If state already has year/quarter, it's been migrated
  if (typeof state.year === 'number' && typeof state.quarter === 'number') {
    // Just ensure phase is set correctly
    if (typeof state.phase !== 'number') {
      state.phase = getPhase(state.year);
    }
    if (typeof state.isAnnualAnchor !== 'boolean') {
      state.isAnnualAnchor = state.quarter === 4;
    }
    return state;
  }

  // Migrate from legacy turn number
  const legacyTurn = typeof state.turn === 'number' ? state.turn : 1;
  const timeState = initializeTimeState(legacyTurn);

  // Add time fields while preserving all other state
  return {
    ...state,
    turn: legacyTurn, // Keep legacy field
    year: timeState.year,
    quarter: timeState.quarter,
    phase: timeState.phase,
    isAnnualAnchor: timeState.isAnnualAnchor,
  };
}

export async function createDefaultState() {
  const state = baseState();
  state.projects = await generateProjects();
  return state;
}

export async function loadGameState() {
  try {
    const data = await fs.readFile(GAME_FILE, 'utf-8');
    const parsed = JSON.parse(data);

    // Merge with baseState to ensure all fields exist
    let state = { ...baseState(), ...parsed };

    // Migrate to time system if needed
    state = migrateToTimeSystem(state);

    // Normalize projects
    const normalizedProjects = normalizeProjects(parsed.projects);
    state.projects = normalizedProjects.length ? normalizedProjects : await generateProjects();

    return state;
  } catch {
    return createDefaultState();
  }
}

export async function saveGameState(state) {
  const copy = { ...state };
  copy.projects = normalizeProjects(copy.projects);
  if (!copy.projects.length) {
    copy.projects = await generateProjects();
  }
  await fs.writeFile(GAME_FILE, JSON.stringify(copy, null, 2), 'utf-8');
}

export { GAME_FILE };
