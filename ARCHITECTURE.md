# GCR Simulation Architecture Plan

## Current State Analysis

### Existing Architecture
- **Framework**: Next.js 16.0.1 (App Router)
- **State Management**: File-based JSON persistence (`game-state.json`)
- **Turn Cadence**: Currently generic "turns", needs to become 1 turn = 1 quarter
- **Time Horizon**: Need to track year (2025-2050) and quarter (1-4)
- **Multiplayer**: Synchronized turn-based with submission tracking

### Current State Structure
```javascript
{
  turn: number,              // Sequential turn counter
  floor: number,             // XCR price floor ($/t)
  market: number,            // Market price ($/t)
  inflation: number,         // Current inflation % (currently simple)
  privateShare: number,      // 0-1, private capital share
  sentiment: number,         // Market sentiment
  cqeBuy: number,            // CQE intervention volume
  totalMitigation: number,   // Cumulative CO2e removed
  lastEvent: Event,          // Last event that occurred
  projects: Project[],       // Available projects this turn
  history: HistoryEntry[],   // Turn-by-turn history
  members: Member[],         // Climate club members
  credibility: number,       // CEA credibility (0-1)
  lastFloorChangeTurn: number,
  floorStep: number,
  votes: Vote[],            // Floor preference votes
  turnSubmissions: Submission[], // Turn readiness tracking
  incomingSupply: number    // Supply pressure this turn
}
```

### Existing APIs
- `/api/game-state` - GET full state
- `/api/join-club` - POST/GET member management
- `/api/votes` - POST/GET floor votes
- `/api/submit-turn` - POST/GET turn submissions
- `/api/nextturn` - POST advance turn (with sync check)
- `/api/set-floor` - POST admin floor override
- `/api/reset-game` - POST reset to default

### Existing Data Modules
- `lib/gameState.js` - State loading/saving
- `lib/data.js` - XML-based project/event loading
- `data/projects.xml` - Project library
- `data/events.xml` - Event library

---

## PRD Mapping & New Architecture

### Time & Phase System

**PRD Requirement**: 1 turn = 1 quarter, 2025-2050, annual anchors every 4 turns

**New State Fields**:
```javascript
{
  // Replace generic 'turn' with temporal tracking
  year: number,              // 2025-2050
  quarter: number,           // 1-4
  turn: number,              // Sequential counter (derived: (year-2025)*4 + quarter)

  // Phase tracking
  phase: 1 | 2 | 3,         // Phase 1: 2025-2032, 2: 2033-2041, 3: 2042-2050
  isAnnualAnchor: boolean   // True when quarter === 4
}
```

**New Module**: `lib/timePhase.js`
```javascript
export function getPhase(year) {
  if (year <= 2032) return 1;
  if (year <= 2041) return 2;
  return 3;
}

export function computeTurn(year, quarter) {
  return (year - 2025) * 4 + quarter;
}

export function isAnnualAnchor(quarter) {
  return quarter === 4;
}

export function advanceQuarter(year, quarter) {
  if (quarter === 4) return { year: year + 1, quarter: 1 };
  return { year, quarter: quarter + 1 };
}
```

---

### A) Cooperation Mechanics

#### 1. Coalition & Vote Tracking

**Current System**:
- Simple floor votes (hold/raise/lower)
- Majority aggregation in `nextturn`

**Enhancements Needed**:
```javascript
// Enhanced vote structure
{
  country: string,
  vote: 'hold' | 'raise' | 'lower',
  turn: number,
  submittedAt: string
}

// Member structure with GDP weighting
{
  country: string,
  joinedAt: string,
  gdpWeight: number,          // NEW: For weighted floor voting (normalized to sum = member count)
  gdpUSD: number              // NEW: GDP in billions USD (for display/reference)
}

// Example GDP weights (2024 data, normalized so sum = number of members):
// If USA, EU, CHN join → total members = 3
// Raw GDP: USA=28T, EU=18T, CHN=18T, Total=64T
// Normalized: USA=1.31, EU=0.84, CHN=0.84 (sum=3.0)
// This preserves relative weights while keeping total voting power = member count

// New Coalition State
{
  coalitions: [{
    id: string,               // e.g., "mrv-coalition-2027"
    type: 'mrv' | 'rnd',     // Joint MRV or R&D surge
    members: string[],        // Country codes
    sector: string?,          // For R&D surges
    createdTurn: number,
    active: boolean,
    autoRenew: boolean       // MRV auto-renews (no annual vote needed)
  }],

  supermajorityDividend: {
    active: boolean,
    credibilityBoost: number, // +5 to +10
    interventionMultiplier: number, // 0.8
    milestoneBonusPct: number, // +10%
    turnsRemaining: number,   // 2-4 turns
    wasConsecutive: boolean   // Halves effectiveness
  },

  jointMRVActive: boolean,
  jointMRVMembers: string[],
  jointMRVStartTurn: number,

  rndSurges: [{
    sector: string,           // e.g., 'dac', 'methane', etc.
    members: string[],
    startTurn: number,
    turnsRemaining: number,   // 2 turns
    costReductionPct: number, // 10-15%
    wasRepeated: boolean      // Halves bonus
  }],

  reciprocityEscrow: {
    [country: string]: {
      promised: number,       // XCR or mitigation pledged
      delivered: number       // Actual delivered
    }
  }
}
```

**New Module**: `lib/coalition.js`
```javascript
export class CoalitionManager {
  constructor(state) { this.state = state; }

  // Check if vote passes with supermajority
  // voteType: 'floor' (GDP-weighted) or 'project' (equal weight)
  checkSupermajority(votes, members, voteType = 'floor') {
    const voteGroups = { hold: 0, raise: 0, lower: 0 };
    let totalWeight = 0;

    if (voteType === 'floor') {
      // GDP-weighted voting for floor changes
      votes.forEach(v => {
        const member = members.find(m => m.country === v.country);
        const weight = member?.gdpWeight || 1;
        voteGroups[v.vote] += weight;
        totalWeight += weight;
      });
    } else {
      // Equal weight (1 vote per country) for project selection
      votes.forEach(v => {
        voteGroups[v.vote] += 1;
      });
      totalWeight = votes.length;
    }

    const winner = Object.entries(voteGroups)
      .sort((a, b) => b[1] - a[1])[0];

    return {
      passed: winner[1] / totalWeight >= 0.66,
      decision: winner[0],
      percentage: winner[1] / totalWeight,
      voteType
    };
  }

  // Apply supermajority dividend
  applySupermajorityDividend(config = {}) {
    const {
      credibilityBoost = 10,
      interventionMult = 0.8,
      milestoneBonusPct = 10,
      duration = 4
    } = config;

    const wasConsecutive = this.state.supermajorityDividend?.active || false;
    const effectiveness = wasConsecutive ? 0.5 : 1.0;

    this.state.supermajorityDividend = {
      active: true,
      credibilityBoost: credibilityBoost * effectiveness,
      interventionMultiplier: 1 - ((1 - interventionMult) * effectiveness),
      milestoneBonusPct: milestoneBonusPct * effectiveness,
      turnsRemaining: duration,
      wasConsecutive
    };

    this.state.credibility = Math.min(100,
      this.state.credibility + (credibilityBoost * effectiveness));
  }

  // Create joint MRV coalition
  createJointMRV(members) {
    if (members.length < 3) return false;

    this.state.jointMRVActive = true;
    this.state.jointMRVMembers = members;
    this.state.jointMRVStartTurn = this.state.turn;
    return true;
  }

  // Create coordinated R&D surge
  createRndSurge(sector, members, config = {}) {
    if (members.length < 3) {
      // Solo surge = half effect
      config.costReductionPct = (config.costReductionPct || 15) * 0.5;
    }

    const lastSurge = this.state.rndSurges?.find(s =>
      s.sector === sector && s.turnsRemaining > 0
    );
    const wasRepeated = !!lastSurge;

    const surge = {
      sector,
      members,
      startTurn: this.state.turn,
      turnsRemaining: 2,
      costReductionPct: (config.costReductionPct || 15) * (wasRepeated ? 0.5 : 1.0),
      wasRepeated
    };

    this.state.rndSurges = this.state.rndSurges || [];
    this.state.rndSurges.push(surge);
    return surge;
  }

  // Decay supermajority dividend
  decayDividend() {
    if (!this.state.supermajorityDividend?.active) return;

    this.state.supermajorityDividend.turnsRemaining--;
    if (this.state.supermajorityDividend.turnsRemaining <= 0) {
      this.state.supermajorityDividend.active = false;
    }
  }

  // Decay R&D surges
  decaySurges() {
    if (!this.state.rndSurges) return;

    this.state.rndSurges.forEach(surge => {
      surge.turnsRemaining--;
    });

    this.state.rndSurges = this.state.rndSurges.filter(s => s.turnsRemaining > 0);
  }
}
```

#### 2. Coordination Index

**New State Fields**:
```javascript
{
  coordinationIndex: {
    value: number,           // 0-100
    components: {
      coalitionSize: number,      // 0-40
      supermajorityRate: number,  // 0-30 (last 4 turns)
      standardsAlignment: number, // 0-20 (joint MRV)
      reciprocity: number         // 0-10 (delivered vs promised)
    },
    effects: {
      privateDemandMultiplier: number,  // 1 + 0.01 * sqrt(index)
      trustPremiumUSD: number,          // 0.05 * (index/100) * floor
      volatilityMultiplier: number,     // 1 - 0.003 * index
      interventionProbMultiplier: number // 1 - min(0.35, 0.0035 * index)
    }
  }
}
```

**New Module**: `lib/coordination.js`
```javascript
export class CoordinationIndex {
  static compute(state) {
    const components = {
      coalitionSize: this.computeCoalitionSize(state),
      supermajorityRate: this.computeSupermajorityRate(state),
      standardsAlignment: state.jointMRVActive ? 20 : 0,
      reciprocity: this.computeReciprocity(state)
    };

    const value = Object.values(components).reduce((sum, v) => sum + v, 0);

    return {
      value: Math.min(100, value),
      components,
      effects: this.computeEffects(value, state)
    };
  }

  static computeCoalitionSize(state) {
    const memberCount = state.members?.length || 0;
    // Scale 0-40 based on member count (e.g., 5+ members = max)
    return Math.min(40, memberCount * 8);
  }

  static computeSupermajorityRate(state) {
    // Look back last 4 turns in history
    const recentHistory = (state.history || []).slice(0, 4);
    const supermajorityCount = recentHistory.filter(h =>
      h.supermajorityPassed === true
    ).length;

    // Scale 0-30 based on frequency
    return (supermajorityCount / 4) * 30;
  }

  static computeReciprocity(state) {
    if (!state.reciprocityEscrow) return 0;

    const escrow = state.reciprocityEscrow;
    let totalPromised = 0;
    let totalDelivered = 0;

    Object.values(escrow).forEach(entry => {
      totalPromised += entry.promised;
      totalDelivered += entry.delivered;
    });

    if (totalPromised === 0) return 0;
    const ratio = totalDelivered / totalPromised;

    // Scale 0-10 based on delivery ratio
    return Math.min(10, ratio * 10);
  }

  static computeEffects(index, state) {
    return {
      privateDemandMultiplier: 1 + 0.01 * Math.sqrt(index),
      trustPremiumUSD: 0.05 * (index / 100) * (state.floor || 80),
      volatilityMultiplier: Math.max(0.05, 1 - 0.003 * index),
      interventionProbMultiplier: 1 - Math.min(0.35, 0.0035 * index)
    };
  }

  static decay(currentIndex, decayRate = 1) {
    return Math.max(0, currentIndex - decayRate);
  }
}
```

---

### B) Event Escalation System

**Current System**:
- Random event selection from XML library
- Static operations (stat changes, project upgrades)

**Enhancements Needed**:

**New State Fields**:
```javascript
{
  stressIndex: number,        // 0-10+
  interventionHistory: {
    total: number,            // Cumulative interventions
    recent: number[]          // Last 4 turns
  },
  budgetGap: number,          // vs RCC pathway
  recentRCCStepUps: number    // Count of recent RCC increases
}
```

**Enhanced Event Structure** (in `events.xml` and state):
```xml
<event>
  <id>tipping-arctic</id>
  <title>Climate shock: Arctic methane release warning</title>
  <description>Scientists warn of destabilising methane hydrates.</description>
  <category>tipping-alarm</category>
  <phase>1</phase>  <!-- 1, 2, or 3 -->
  <baseProbability>0.05</baseProbability>
  <stressAlpha>0.3</stressAlpha>  <!-- Stress multiplier on probability -->
  <stressBeta>0.4</stressBeta>    <!-- Stress multiplier on severity -->
  <severityRange>
    <min>0.8</min>
    <max>1.5</max>
  </severityRange>
  <effects>
    <stat target="sentiment" operation="add" value="-0.05" />
    <stat target="credibility" operation="add" value="-5" />
  </effects>
  <justified>true</justified>
</event>
```

**New Module**: `lib/eventEscalation.js`
```javascript
export class EventEscalator {
  static computeStressIndex(state) {
    let stress = 0;

    // Cumulative interventions (normalized)
    const interventions = state.interventionHistory?.total || 0;
    stress += Math.min(3, interventions / 10);

    // Low credibility
    if (state.credibility < 50) {
      stress += (50 - state.credibility) / 10;
    }

    // Budget gap
    stress += Math.min(2, (state.budgetGap || 0) / 1000);

    // Recent RCC step-ups
    stress += (state.recentRCCStepUps || 0) * 0.5;

    return Math.min(10, stress);
  }

  static selectEvent(events, state) {
    const phase = state.phase || 1;
    const stress = this.computeStressIndex(state);

    // Filter by phase
    const phaseEvents = events.filter(e => e.phase === phase || !e.phase);

    // Calculate weighted probabilities
    const weighted = phaseEvents.map(event => {
      const baseProb = event.baseProbability || 0.1;
      const phaseWeight = phase === 3 ? 1.5 : (phase === 2 ? 1.2 : 1.0);
      const stressAlpha = event.stressAlpha || 0.3;

      const probability = baseProb * phaseWeight * (1 + stressAlpha * stress);

      return { event, probability };
    });

    // Weighted random selection
    const totalProb = weighted.reduce((sum, w) => sum + w.probability, 0);
    let random = Math.random() * totalProb;

    for (const { event, probability } of weighted) {
      random -= probability;
      if (random <= 0) return event;
    }

    return weighted[0]?.event || null;
  }

  static computeSeverity(event, stress) {
    const stressBeta = event.stressBeta || 0.4;
    const min = event.severityRange?.min || 0.8;
    const max = event.severityRange?.max || 1.5;

    const baseRandom = min + Math.random() * (max - min);
    const severity = baseRandom * (1 + stressBeta * stress);

    return Math.max(min, Math.min(max, severity));
  }
}
```

---

### C) Inflation System

**Current System**:
- Simple `inflation` number
- Basic increments in turn logic

**New Structure**:
```javascript
{
  inflationState: {
    pi: number,              // Annualized % (e.g., 1.5)
    target: 1.5,
    tolerance: 3.0,
    inertia: 0.85,
    shockSensitivity: 1.0,

    components: {            // Last quarter's contributions
      floorMove: number,
      guidanceMove: number,
      privateShare: number,
      cqe: number,
      rSurge: number,
      supplyShocks: number,
      credibility: number,
      coordination: number
    },

    history: [{             // Quarterly inflation history
      turn: number,
      pi: number,
      delta: number
    }],

    stabilizationWindow: {
      active: boolean,
      allowedBoost: number,  // +0.3 to +0.7 pp
      turnsRemaining: number, // max 3
      outputGapAvoided: boolean
    }
  }
}
```

**New Module**: `lib/inflation.js`
```javascript
export class InflationTracker {
  static update(state, changes = {}) {
    const current = state.inflationState || this.createDefault();

    // Compute delta from components
    const delta =
      0.4 * (changes.floorMove || 0) +
      0.2 * (changes.guidanceMove || 0) -
      0.3 * (state.privateShare || 0.7) +
      0.3 * (changes.cqe || 0) +
      0.2 * (changes.rSurge || 0) +
      0.4 * (changes.supplyShocks || 0) -
      0.1 * (state.credibility / 100 || 1) -
      0.15 * ((state.coordinationIndex?.value || 0) / 100);

    // Apply inertia and sensitivity
    const newPi =
      current.pi * current.inertia +
      current.shockSensitivity * delta;

    // Update state
    current.pi = Math.max(0, newPi);
    current.components = changes;
    current.history.push({
      turn: state.turn,
      pi: current.pi,
      delta
    });

    // Keep last 40 quarters (10 years)
    if (current.history.length > 40) {
      current.history = current.history.slice(-40);
    }

    return current;
  }

  static computePenalty(pi, target = 1.5) {
    return Math.max(0, pi - target);
  }

  static startStabilizationWindow(state, config = {}) {
    state.inflationState.stabilizationWindow = {
      active: true,
      allowedBoost: config.allowedBoost || 0.5,
      turnsRemaining: config.duration || 3,
      outputGapAvoided: false
    };
  }

  static createDefault() {
    return {
      pi: 1.1,
      target: 1.5,
      tolerance: 3.0,
      inertia: 0.85,
      shockSensitivity: 1.0,
      components: {},
      history: [],
      stabilizationWindow: { active: false }
    };
  }
}
```

---

### D) Scoreboard & Metrics

**New API**: `/api/metrics` (GET)

Returns structured quarterly and annual metrics:

```javascript
{
  quarterly: {
    turn: number,
    year: number,
    quarter: number,

    mitigation: {
      channel1: number,
      channel2: number,
      channel3: number,
      total: number,
      verified: number
    },

    market: {
      floor: number,
      spot: number,
      spread: number,
      privateVolume: number,
      cqeVolume: number,
      trustPremium: number
    },

    governance: {
      credibility: number,
      coordinationIndex: number,
      supermajorityActive: boolean,
      jointMRVActive: boolean
    },

    interventions: {
      probability: number,
      occurred: boolean,
      amount: number
    },

    inflation: {
      pi: number,
      target: number,
      penalty: number
    }
  },

  annual: {
    year: number,

    cumulative: {
      co2eRemoved: number,
      budgetRemaining: number,
      interventions: number
    },

    averages: {
      privateShare: number,
      credibility: number,
      coordinationIndex: number
    },

    coalition: {
      size: number,
      supermajorityRate: number,
      jointMRVActive: boolean,
      rndSurgesCount: number
    },

    mrv: {
      verificationLag: number,
      fraudRate: number,
      cesLevel: number
    }
  }
}
```

---

## Implementation Phases

### Phase 1: Foundation (Weeks 1-2)
1. **Time/Phase System**
   - Update `lib/gameState.js` baseState with year/quarter/phase
   - Create `lib/timePhase.js`
   - Update turn advancement in `nextturn` API
   - Add "Annual Anchor" detection and special handling

2. **State Schema Migration**
   - Add all new state fields to baseState
   - Create migration function to upgrade existing saves
   - Update `game-state.json` structure

### Phase 2: Cooperation (Weeks 3-4)
1. **Coalition Manager**
   - Create `lib/coalition.js`
   - Implement supermajority checking
   - Add dividend application/decay
   - Implement joint MRV creation
   - Implement R&D surge tracking

2. **Coordination Index**
   - Create `lib/coordination.js`
   - Implement component calculations
   - Implement effects mapping
   - Add decay logic

3. **UI for Coalitions**
   - Add coalition creation UI
   - Add MRV upkeep voting UI
   - Add R&D surge declaration UI
   - Show coordination index in scoreboard

### Phase 3: Events & Inflation (Weeks 5-6)
1. **Event Escalation**
   - Create `lib/eventEscalation.js`
   - Enhance events.xml with new fields
   - Update event selection in `nextturn`
   - Add stress index calculation

2. **Inflation Tracker**
   - Create `lib/inflation.js`
   - Integrate into turn loop
   - Add component tracking
   - Implement stabilization windows

3. **UI Updates**
   - Add inflation dashboard
   - Add stress index indicator
   - Enhanced event display with severity

### Phase 4: Metrics & Polish (Week 7)
1. **Metrics API**
   - Create `/api/metrics` endpoint
   - Implement quarterly/annual aggregations
   - Add MRV integrity tracking

2. **Scoreboard UI**
   - Create comprehensive metrics dashboard
   - Add charts for trends
   - Export functionality

### Phase 5: Testing & Balance (Week 8)
1. **Unit Tests**
   - Test all new modules
   - Test edge cases (consecutive dividends, etc.)
   - Test deterministic RNG mode

2. **Integration Tests**
   - Test full turn loops
   - Test multi-player scenarios
   - Test annual anchors

3. **Balance Tuning**
   - Adjust config defaults
   - Tune caps and multipliers
   - Validate acceptance criteria

---

## Configuration System

Create `config/gameConfig.js`:
```javascript
export const gameConfig = {
  time: {
    startYear: 2025,
    endYear: 2050,
    quartersPerYear: 4
  },

  cooperation: {
    supermajority: {
      threshold: 0.66,
      credibilityBoost: 10,
      duration: 4,
      consecutivePenalty: 0.5,
      interventionMultiplier: 0.8,
      milestoneBonusPct: 10
    },

    jointMRV: {
      minMembers: 3,
      verificationLagReduction: { channel1: 0.5, channel2: 0.25, channel3: 0.5 },
      fraudMultiplier: 0.5,
      privateDemandBoost: 0.075
    },

    rndSurge: {
      minMembers: 3,
      duration: 2,
      costReduction: 0.125,
      soloEffectiveness: 0.5,
      repeatPenalty: 0.5
    }
  },

  coordination: {
    componentWeights: {
      coalitionSize: 40,
      supermajorityRate: 30,
      standardsAlignment: 20,
      reciprocity: 10
    },
    decayRate: 1
  },

  events: {
    phases: [
      { id: 1, yearStart: 2025, yearEnd: 2032 },
      { id: 2, yearStart: 2033, yearEnd: 2041 },
      { id: 3, yearStart: 2042, yearEnd: 2050 }
    ]
  },

  inflation: {
    target: 1.5,
    tolerance: 3.0,
    inertia: 0.85,
    shockSensitivity: 1.0,
    componentWeights: {
      floorMove: 0.4,
      guidanceMove: 0.2,
      privateShare: -0.3,
      cqe: 0.3,
      rSurge: 0.2,
      supplyShocks: 0.4,
      credibility: -0.1,
      coordination: -0.15
    }
  },

  caps: {
    trustPremiumMaxPct: 0.10,
    volatilityFloor: 0.05,
    interventionReductionCap: 0.35,
    maxInflationPenalty: 10
  }
};
```

---

## Testing Strategy

### Unit Tests
- Each module exports pure functions where possible
- Use deterministic RNG seed for repeatability
- Test boundary conditions (e.g., index at 0, 100)

### Integration Tests
- Full turn cycle with cooperation mechanics active
- Multi-player coordination scenarios
- Event escalation at different stress levels
- Inflation response to various levers

### Acceptance Criteria Tests
- AC1: Coalition boosts (automated test)
- AC2: Dividend decay (automated test)
- AC3: Event escalation (automated test)
- AC4: Inflation response (automated test)
- AC5: Scoreboard completeness (schema validation)

---

## Migration Path

1. **Backward Compatibility**: Old saves without new fields get defaults
2. **Feature Flags**: Optionally enable new mechanics progressively
3. **Data Seeding**: Provide sample coalitions for testing
4. **Documentation**: Update README with new gameplay mechanics

---

## Next Steps

1. Review this architecture plan
2. Confirm approach and priorities
3. Start with Phase 1 (Time/Phase System)
4. Iterate through phases with feedback loops

---

## Design Decisions ✅

1. **Voting Power**:
   - Project selection: Equal (1 vote per country)
   - Floor changes: GDP-weighted
2. **MRV Upkeep**: Auto-renewal (no annual votes)
3. **UI Complexity**: Minimal coalition UI in Phase 2, full UI in Phase 4
4. **RCC Pathway**: Flexible/configurable (no hardcoded schedule)
5. **Testing Scope**: Unit tests only (no E2E)
