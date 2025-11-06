import { promises as fs } from 'fs';
import path from 'path';
import { generateProjects, normalizeProject } from './data';

const GAME_FILE = path.join(process.cwd(), 'game-state.json');

function baseState() {
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
    votes: [],
  };
}

function normalizeProjects(projects) {
  const safe = Array.isArray(projects) ? projects : [];
  return safe
    .map((proj) => normalizeProject(proj))
    .filter((proj) => proj && proj.id);
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
    const state = { ...baseState(), ...parsed };
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
