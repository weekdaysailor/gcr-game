// lib/coalition.js
// Coalition and cooperation mechanics for the GCR simulation

import { aggregateVotes, checkSupermajority } from './gdpWeighting';

/**
 * CoalitionManager handles supermajority dividends, joint MRV, and R&D surges
 */
export class CoalitionManager {
  constructor(state) {
    this.state = state;
    this.ensureCoalitionState();
  }

  /**
   * Ensure all coalition-related state fields exist
   */
  ensureCoalitionState() {
    if (!this.state.coalitions) {
      this.state.coalitions = [];
    }

    if (!this.state.supermajorityDividend) {
      this.state.supermajorityDividend = {
        active: false,
        credibilityBoost: 0,
        interventionMultiplier: 1.0,
        milestoneBonusPct: 0,
        turnsRemaining: 0,
        wasConsecutive: false,
      };
    }

    if (!this.state.jointMRVActive) {
      this.state.jointMRVActive = false;
    }

    if (!this.state.jointMRVMembers) {
      this.state.jointMRVMembers = [];
    }

    if (!this.state.jointMRVStartTurn) {
      this.state.jointMRVStartTurn = 0;
    }

    if (!this.state.rndSurges) {
      this.state.rndSurges = [];
    }

    if (!this.state.reciprocityEscrow) {
      this.state.reciprocityEscrow = {};
    }
  }

  /**
   * Check if a vote passes with supermajority (≥66%)
   * @param {Array} votes - Array of vote objects
   * @param {Array} members - Array of member objects (with gdpWeight)
   * @param {string} voteType - 'floor' (GDP-weighted) or 'project' (equal)
   * @returns {object} - { passed, decision, percentage, breakdown }
   */
  checkSupermajorityVote(votes, members, voteType = 'floor') {
    return checkSupermajority(votes, members, voteType);
  }

  /**
   * Apply supermajority dividend when a vote passes with ≥66%
   * @param {object} config - Configuration { credibilityBoost, interventionMult, milestoneBonusPct, duration }
   */
  applySupermajorityDividend(config = {}) {
    const {
      credibilityBoost = 10,
      interventionMult = 0.8,
      milestoneBonusPct = 10,
      duration = 4,
    } = config;

    // Check if this is consecutive
    const wasConsecutive = this.state.supermajorityDividend?.active || false;
    const effectiveness = wasConsecutive ? 0.5 : 1.0;

    // Apply dividend with effectiveness penalty for consecutive activations
    this.state.supermajorityDividend = {
      active: true,
      credibilityBoost: credibilityBoost * effectiveness,
      interventionMultiplier: 1 - ((1 - interventionMult) * effectiveness),
      milestoneBonusPct: milestoneBonusPct * effectiveness,
      turnsRemaining: duration,
      wasConsecutive,
    };

    // Boost credibility (cap at 100)
    const currentCredibility = this.state.credibility || 1.0;
    this.state.credibility = Math.min(100, currentCredibility + (credibilityBoost * effectiveness));
  }

  /**
   * Decay supermajority dividend (call each turn)
   */
  decaySupermajorityDividend() {
    if (!this.state.supermajorityDividend?.active) return;

    this.state.supermajorityDividend.turnsRemaining--;

    if (this.state.supermajorityDividend.turnsRemaining <= 0) {
      this.state.supermajorityDividend.active = false;
      this.state.supermajorityDividend.credibilityBoost = 0;
      this.state.supermajorityDividend.interventionMultiplier = 1.0;
      this.state.supermajorityDividend.milestoneBonusPct = 0;
    }
  }

  /**
   * Create or join joint MRV coalition
   * Requires ≥3 members
   * @param {Array<string>} members - Country codes
   * @returns {boolean} - Success
   */
  createJointMRV(members) {
    if (!Array.isArray(members) || members.length < 3) {
      return false;
    }

    this.state.jointMRVActive = true;
    this.state.jointMRVMembers = [...members];
    this.state.jointMRVStartTurn = this.state.turn || 1;

    // Add coalition record
    const coalition = {
      id: `mrv-coalition-${this.state.year || 2025}`,
      type: 'mrv',
      members: [...members],
      createdTurn: this.state.turn || 1,
      active: true,
      autoRenew: true,
    };

    this.state.coalitions.push(coalition);

    return true;
  }

  /**
   * Deactivate joint MRV
   */
  deactivateJointMRV() {
    this.state.jointMRVActive = false;
    this.state.jointMRVMembers = [];

    // Mark coalition as inactive
    const mrvCoalition = this.state.coalitions.find(c => c.type === 'mrv' && c.active);
    if (mrvCoalition) {
      mrvCoalition.active = false;
    }
  }

  /**
   * Create coordinated R&D surge
   * @param {string} sector - e.g., 'dac', 'methane', 'solar'
   * @param {Array<string>} members - Country codes
   * @param {object} config - { costReductionPct }
   * @returns {object|null} - Created surge or null
   */
  createRndSurge(sector, members, config = {}) {
    if (!sector || !Array.isArray(members) || members.length === 0) {
      return null;
    }

    let costReductionPct = config.costReductionPct || 12.5;

    // Solo surge = half effect
    if (members.length < 3) {
      costReductionPct *= 0.5;
    }

    // Check for repeated sector
    const recentSurge = this.state.rndSurges?.find(s =>
      s.sector === sector && s.turnsRemaining > 0
    );
    const wasRepeated = !!recentSurge;

    // Repeated sector = half bonus
    if (wasRepeated) {
      costReductionPct *= 0.5;
    }

    const surge = {
      id: `rnd-${sector}-${this.state.turn || 1}`,
      sector,
      members: [...members],
      startTurn: this.state.turn || 1,
      turnsRemaining: 2,
      costReductionPct,
      wasRepeated,
    };

    this.state.rndSurges = this.state.rndSurges || [];
    this.state.rndSurges.push(surge);

    // Add coalition record
    const coalition = {
      id: surge.id,
      type: 'rnd',
      sector,
      members: [...members],
      createdTurn: this.state.turn || 1,
      active: true,
      autoRenew: false,
    };

    this.state.coalitions.push(coalition);

    return surge;
  }

  /**
   * Decay R&D surges (call each turn)
   */
  decayRndSurges() {
    if (!this.state.rndSurges) return;

    this.state.rndSurges.forEach(surge => {
      surge.turnsRemaining--;
    });

    // Remove expired surges
    const expiredIds = this.state.rndSurges
      .filter(s => s.turnsRemaining <= 0)
      .map(s => s.id);

    this.state.rndSurges = this.state.rndSurges.filter(s => s.turnsRemaining > 0);

    // Mark coalitions as inactive
    expiredIds.forEach(id => {
      const coalition = this.state.coalitions.find(c => c.id === id);
      if (coalition) {
        coalition.active = false;
      }
    });
  }

  /**
   * Get active R&D surge for a sector
   * @param {string} sector - Sector name
   * @returns {object|null} - Active surge or null
   */
  getActiveSurge(sector) {
    if (!this.state.rndSurges) return null;
    return this.state.rndSurges.find(s => s.sector === sector && s.turnsRemaining > 0) || null;
  }

  /**
   * Update reciprocity escrow for a country
   * @param {string} country - Country code
   * @param {number} promised - Amount promised
   * @param {number} delivered - Amount delivered
   */
  updateReciprocity(country, promised, delivered) {
    if (!this.state.reciprocityEscrow) {
      this.state.reciprocityEscrow = {};
    }

    if (!this.state.reciprocityEscrow[country]) {
      this.state.reciprocityEscrow[country] = {
        promised: 0,
        delivered: 0,
      };
    }

    this.state.reciprocityEscrow[country].promised += promised;
    this.state.reciprocityEscrow[country].delivered += delivered;
  }

  /**
   * Get reciprocity ratio for a country
   * @param {string} country - Country code
   * @returns {number} - Ratio of delivered/promised (0-1+)
   */
  getReciprocityRatio(country) {
    const escrow = this.state.reciprocityEscrow?.[country];
    if (!escrow || escrow.promised === 0) return 1.0;

    return escrow.delivered / escrow.promised;
  }

  /**
   * Run all decay functions (call each turn)
   */
  decayAll() {
    this.decaySupermajorityDividend();
    this.decayRndSurges();
  }

  /**
   * Get intervention probability multiplier from supermajority dividend
   * @returns {number} - Multiplier (1.0 = no effect, 0.8 = 20% reduction)
   */
  getInterventionMultiplier() {
    if (!this.state.supermajorityDividend?.active) return 1.0;
    return this.state.supermajorityDividend.interventionMultiplier || 1.0;
  }

  /**
   * Get milestone success bonus from supermajority dividend
   * @returns {number} - Percentage bonus (0-10+)
   */
  getMilestoneBonus() {
    if (!this.state.supermajorityDividend?.active) return 0;
    return this.state.supermajorityDividend.milestoneBonusPct || 0;
  }

  /**
   * Get joint MRV effects
   * @returns {object} - { verificationLagReduction, fraudMultiplier, privateDemandBoost }
   */
  getJointMRVEffects() {
    if (!this.state.jointMRVActive) {
      return {
        verificationLagReduction: { channel1: 0, channel2: 0, channel3: 0 },
        fraudMultiplier: 1.0,
        privateDemandBoost: 0,
      };
    }

    return {
      verificationLagReduction: {
        channel1: 0.5,  // 50% reduction for Channel 1 (direct air capture)
        channel2: 0.25, // 25% reduction for Channel 2 (nature-based)
        channel3: 0.5,  // 50% reduction for Channel 3 (industrial)
      },
      fraudMultiplier: 0.5,     // Fraud probability halved
      privateDemandBoost: 0.075, // +7.5% private demand
    };
  }

  /**
   * Get cost reduction from active R&D surge
   * @param {string} sector - Sector to check
   * @returns {number} - Cost reduction percentage (0-15+)
   */
  getCostReduction(sector) {
    const surge = this.getActiveSurge(sector);
    return surge ? surge.costReductionPct : 0;
  }
}

/**
 * Helper: Initialize coalition manager from state
 */
export function createCoalitionManager(state) {
  return new CoalitionManager(state);
}
