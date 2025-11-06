// app/api/reset-game/route.js
import { promises as fs } from 'fs';
import path from 'path';
import { generateProjects } from '../../../lib/projects';

export const dynamic = 'force-dynamic';

const GAME_FILE = path.join(process.cwd(), 'game-state.json');

async function defaultState() {
  const projects = await generateProjects();
  return {
    turn: 1,
    floor: 80,
    market: 82,
    inflation: 1.1,
    privateShare: 0.7,
    sentiment: 0.2,
    cqeBuy: 0,
    totalMitigation: 0,
    cumulativeXcr: 0,
    lastEvent: null,
    projects,
    history: [],
    members: [],
    credibility: 1.0,
    lastFloorChangeTurn: 0,
    floorStep: 5,
    votes: [],
  };
}

export async function POST() {
  const fresh = await defaultState();
  await fs.writeFile(GAME_FILE, JSON.stringify(fresh, null, 2), 'utf-8');
  return new Response(JSON.stringify(fresh), {
    headers: { 'Content-Type': 'application/json' },
  });
}
