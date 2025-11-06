// app/api/nextturn/route.js
import { promises as fs } from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

const GAME_FILE = path.join(process.cwd(), 'game-state.json');

// base project library
const PROJECT_LIBRARY = [
  {
    id: 'proj-dac',
    name: 'Direct Air Capture Plant',
    mitigationTonnes: 800000,
    supplyPressure: 800000,
    sentimentEffect: 0.02,
    bidPriceRange: [95, 135],
    bidMitigationRange: [0.85, 1.15],
    coBenefits:
      'Supports local clean-tech employment and yields research spillovers for carbon removal.',
  },
  {
    id: 'proj-methane',
    name: 'Landfill Methane Oxidation',
    mitigationTonnes: 500000,
    supplyPressure: 300000,
    sentimentEffect: 0.03,
    bidPriceRange: [60, 95],
    bidMitigationRange: [0.9, 1.2],
    coBenefits:
      'Improves air quality for nearby communities and captures landfill gas for on-site energy.',
  },
  {
    id: 'proj-mangroves',
    name: 'Mangrove Restoration Programme',
    mitigationTonnes: 600000,
    supplyPressure: 200000,
    sentimentEffect: 0.04,
    bidPriceRange: [55, 90],
    bidMitigationRange: [0.8, 1.25],
    coBenefits:
      'Enhances coastal resilience, protects fisheries, and improves biodiversity outcomes.',
  },
];

// events (DAC updated)
const EVENTS = [
  {
    id: 'tech-dac-50',
    title: 'Tech breakthrough: DAC efficiency up 10%',
    justified: true,
    effect: (state) => {
      // markets like the tech
      state.sentiment += 0.02;
      // more DAC now viable
      state.incomingSupply += 200000;
      // put slight downward pressure on XCR
      state.market = (state.market || 0) - 1.5;

      // actually upgrade future DAC projects
      const dac = PROJECT_LIBRARY.find((p) => p.id === 'proj-dac');
      if (dac) {
        dac.mitigationTonnes = Math.round(dac.mitigationTonnes * 1.1);
        dac.supplyPressure = Math.round(dac.supplyPressure * 0.9);
      }
      return state;
    },
  },
  {
    id: 'tipping-arctic',
    title: 'Climate shock: Arctic methane release warning',
    justified: true,
    effect: (state) => {
      state.sentiment -= 0.03;
      state.inflation += 0.01;
      return state;
    },
  },
  {
    id: 'club-expands',
    title: 'Political: Climate club expands',
    justified: false,
    effect: (state) => {
      state.sentiment += 0.04;
      state.privateShare += 0.02;
      return state;
    },
  },
  {
    id: 'rate-spike',
    title: 'Economic shock: global rate spike',
    justified: false,
    effect: (state) => {
      state.sentiment -= 0.03;
      state.privateShare -= 0.02;
      state.inflation += 0.015;
      return state;
    },
  },
];

function randomInRange(min, max) {
  if (min === max) return min;
  return min + Math.random() * (max - min);
}

function generateProjects() {
  const shuffled = [...PROJECT_LIBRARY].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, 3).map((base) => {
    const [minPrice, maxPrice] = base.bidPriceRange || [70, 110];
    const [minMitigationFactor, maxMitigationFactor] = base.bidMitigationRange || [0.9, 1.1];

    const bidPrice = Number(randomInRange(minPrice, maxPrice).toFixed(2));
    const mitigationMultiplier = randomInRange(minMitigationFactor, maxMitigationFactor);
    const baselineMitigation = base.mitigationTonnes || 0;
    const baselineSupply = base.supplyPressure || 0;

    const bidMitigationTonnes = Math.max(
      0,
      Math.round((baselineMitigation * mitigationMultiplier) / 1000) * 1000
    );
    const supplyRatio = baselineMitigation > 0 ? baselineSupply / baselineMitigation : 0;
    const scaledSupply = Math.round(supplyRatio * bidMitigationTonnes);

    return {
      ...base,
      mitigationTonnes: bidMitigationTonnes,
      supplyPressure: scaledSupply,
      xcrBidPrice: bidPrice,
      bidMitigationTonnes,
      baselineMitigationTonnes: baselineMitigation,
      coBenefits: base.coBenefits || 'No additional co-benefits were provided.',
    };
  });
}

async function loadGameState() {
  try {
    const data = await fs.readFile(GAME_FILE, 'utf-8');
    const state = JSON.parse(data);
    if (!Array.isArray(state.projects) || state.projects.length === 0) {
      state.projects = generateProjects();
    }
    state.projects = state.projects.map((proj) => {
      const libraryMatch = PROJECT_LIBRARY.find((p) => p.id === proj.id);
      return {
        ...proj,
        coBenefits:
          proj.coBenefits || libraryMatch?.coBenefits || 'No additional co-benefits were provided.',
        xcrBidPrice:
          typeof proj.xcrBidPrice === 'number'
            ? proj.xcrBidPrice
            : libraryMatch?.bidPriceRange
            ? Number(randomInRange(...libraryMatch.bidPriceRange).toFixed(2))
            : null,
      };
    });
    if (typeof state.floorStep !== 'number' || Number.isNaN(state.floorStep) || state.floorStep <= 0) {
      state.floorStep = 5;
    }
    return state;
  } catch {
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
      projects: generateProjects(),
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
  const clientState = await request.json();
  const { chosenProjectId, floorDecision, playerCountry } = clientState;

  let state = await loadGameState();

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
  let projectAvoidedEmissions = 0;
  let rewardAmount = 0;
  let chosenProjectBidPrice = null;
  let chosenProjectName = null;
  if (chosenProjectId) {
    const proj = (state.projects || []).find((p) => p.id === chosenProjectId);
    if (proj) {
      const mitigationBid = proj.bidMitigationTonnes ?? proj.mitigationTonnes ?? 0;
      state.totalMitigation += mitigationBid;
      state.sentiment += proj.sentimentEffect;
      state.incomingSupply = (state.incomingSupply || 0) + (proj.supplyPressure || 0);

      projectAvoidedEmissions = mitigationBid;
      // simple 1:1 reward for now
      rewardAmount = mitigationBid;
      chosenProjectBidPrice = proj.xcrBidPrice ?? null;
      chosenProjectName = proj.name || null;
    }
  } else {
    state.incomingSupply = state.incomingSupply || 0;
  }

  // 2) event
  const event = EVENTS[Math.floor(Math.random() * EVENTS.length)];
  state = event.effect(state);
  state.lastEvent = { id: event.id, title: event.title };

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
    const allowed = turnsSince >= FLOOR_COOLDOWN || event.justified === true;

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
    event: event.title,
    project: chosenProjectId || 'none',
    projectName: chosenProjectName || chosenProjectId || 'none',
    floor: state.floor,
    market: state.market,
    mitigation: projectAvoidedEmissions,
    bidPrice: chosenProjectBidPrice,
    xcrAwarded: rewardAmount,
    inflation: state.inflation,
    guidanceBroken,
    time: new Date().toISOString(),
  });
  state.history = state.history.slice(0, 20);

  // 9) next turn
  state.turn += 1;
  state.projects = generateProjects();

  await saveGameState(state);

  return new Response(JSON.stringify(state), {
    headers: { 'Content-Type': 'application/json' },
  });
}
