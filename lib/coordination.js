// lib/coordination.js
// Coordination Index calculation and effects

/**
 * CoordinationIndex computes a 0-100 score based on coalition behavior
 * and maps it to market effects (private capital, trust premium, etc.)
 */
export class CoordinationIndex {
  /**
   * Compute coordination index from current state
   * @param {object} state - Game state
   * @returns {object} - { value, components, effects }
   */
  static compute(state) {
    const components = {
      coalitionSize: this.computeCoalitionSize(state),
      supermajorityRate: this.computeSupermajorityRate(state),
      standardsAlignment: this.computeStandardsAlignment(state),
      reciprocity: this.computeReciprocity(state),
    };

    const value = Math.min(100, Object.values(components).reduce((sum, v) => sum + v, 0));

    return {
      value,
      components,
      effects: this.computeEffects(value, state),
    };
  }

  /**
   * Compute coalition size component (0-40)
   * Scales with number of climate club members
   * @param {object} state - Game state
   * @returns {number} - Score 0-40
   */
  static computeCoalitionSize(state) {
    const memberCount = state.members?.length || 0;

    // Scale 0-40 based on member count
    // 1 member = 8 points
    // 2 members = 16 points
    // 3 members = 24 points
    // 4 members = 32 points
    // 5+ members = 40 points (max)
    return Math.min(40, memberCount * 8);
  }

  /**
   * Compute supermajority rate component (0-30)
   * Looks at last 4 turns in history
   * @param {object} state - Game state
   * @returns {number} - Score 0-30
   */
  static computeSupermajorityRate(state) {
    if (!state.history || state.history.length === 0) return 0;

    // Look back last 4 turns
    const recentHistory = state.history.slice(0, 4);
    const supermajorityCount = recentHistory.filter(h =>
      h.supermajorityPassed === true
    ).length;

    // Scale 0-30 based on frequency
    // 0/4 = 0 points
    // 1/4 = 7.5 points
    // 2/4 = 15 points
    // 3/4 = 22.5 points
    // 4/4 = 30 points
    return (supermajorityCount / 4) * 30;
  }

  /**
   * Compute standards alignment component (0-20)
   * Based on joint MRV participation
   * @param {object} state - Game state
   * @returns {number} - Score 0-20
   */
  static computeStandardsAlignment(state) {
    // Joint MRV active = full 20 points
    if (state.jointMRVActive) return 20;

    // Check for active MRV coalition
    const mrvCoalition = state.coalitions?.find(c =>
      c.type === 'mrv' && c.active
    );

    return mrvCoalition ? 20 : 0;
  }

  /**
   * Compute reciprocity component (0-10)
   * Based on delivered vs promised ratios across all members
   * @param {object} state - Game state
   * @returns {number} - Score 0-10
   */
  static computeReciprocity(state) {
    if (!state.reciprocityEscrow || Object.keys(state.reciprocityEscrow).length === 0) {
      return 0;
    }

    const escrow = state.reciprocityEscrow;
    let totalPromised = 0;
    let totalDelivered = 0;

    Object.values(escrow).forEach(entry => {
      totalPromised += entry.promised || 0;
      totalDelivered += entry.delivered || 0;
    });

    if (totalPromised === 0) return 0;

    const ratio = totalDelivered / totalPromised;

    // Scale 0-10 based on delivery ratio
    // 0% = 0 points
    // 50% = 5 points
    // 100% = 10 points
    // >100% = 10 points (capped)
    return Math.min(10, ratio * 10);
  }

  /**
   * Compute market effects from coordination index
   * @param {number} index - Coordination index value (0-100)
   * @param {object} state - Game state
   * @returns {object} - Effects object
   */
  static computeEffects(index, state) {
    const floor = state.floor || 80;

    return {
      // Private demand multiplier: 1 + 0.01 * sqrt(index)
      // Index 0 → 1.0 (no change)
      // Index 25 → 1.05 (+5%)
      // Index 100 → 1.10 (+10%)
      privateDemandMultiplier: 1 + 0.01 * Math.sqrt(index),

      // Trust premium in USD: 0.05 * (index/100) * floor
      // Index 0 → $0
      // Index 50 → $2 (if floor = $80)
      // Index 100 → $4 (if floor = $80)
      trustPremiumUSD: 0.05 * (index / 100) * floor,

      // Volatility multiplier: 1 - 0.003 * index
      // Index 0 → 1.0 (no reduction)
      // Index 33 → 0.9 (10% reduction)
      // Index 100 → 0.7 (30% reduction)
      // Floor at 0.05 to prevent zero volatility
      volatilityMultiplier: Math.max(0.05, 1 - 0.003 * index),

      // Intervention probability multiplier: 1 - min(0.35, 0.0035 * index)
      // Index 0 → 1.0 (no reduction)
      // Index 50 → 0.825 (17.5% reduction)
      // Index 100 → 0.65 (35% reduction, capped)
      interventionProbMultiplier: 1 - Math.min(0.35, 0.0035 * index),
    };
  }

  /**
   * Apply decay to coordination index
   * @param {number} currentIndex - Current index value
   * @param {number} decayRate - Points to decay per turn (default 1)
   * @returns {number} - New index value
   */
  static decay(currentIndex, decayRate = 1) {
    return Math.max(0, currentIndex - decayRate);
  }

  /**
   * Get a text description of the coordination level
   * @param {number} index - Coordination index value
   * @returns {string} - Description
   */
  static getDescription(index) {
    if (index >= 80) return 'Excellent';
    if (index >= 60) return 'Strong';
    if (index >= 40) return 'Moderate';
    if (index >= 20) return 'Weak';
    return 'Minimal';
  }

  /**
   * Get breakdown of index for display
   * @param {object} state - Game state
   * @returns {object} - Formatted breakdown
   */
  static getBreakdown(state) {
    const result = this.compute(state);

    return {
      total: result.value,
      description: this.getDescription(result.value),
      components: [
        {
          name: 'Coalition Size',
          value: result.components.coalitionSize,
          max: 40,
          description: `${state.members?.length || 0} members`,
        },
        {
          name: 'Supermajority Rate',
          value: result.components.supermajorityRate,
          max: 30,
          description: 'Last 4 turns',
        },
        {
          name: 'Standards Alignment',
          value: result.components.standardsAlignment,
          max: 20,
          description: state.jointMRVActive ? 'Joint MRV active' : 'No joint MRV',
        },
        {
          name: 'Reciprocity',
          value: result.components.reciprocity,
          max: 10,
          description: 'Promises delivered',
        },
      ],
      effects: [
        {
          name: 'Private Demand',
          value: `${((result.effects.privateDemandMultiplier - 1) * 100).toFixed(1)}%`,
          description: 'Boost to private capital participation',
        },
        {
          name: 'Trust Premium',
          value: `$${result.effects.trustPremiumUSD.toFixed(2)}/t`,
          description: 'Market premium from credible commitment',
        },
        {
          name: 'Volatility',
          value: `${((1 - result.effects.volatilityMultiplier) * 100).toFixed(1)}%`,
          description: 'Reduction in market volatility',
        },
        {
          name: 'Intervention Risk',
          value: `${((1 - result.effects.interventionProbMultiplier) * 100).toFixed(1)}%`,
          description: 'Reduction in CQE intervention probability',
        },
      ],
    };
  }
}

/**
 * Update coordination index in state
 * @param {object} state - Game state
 * @returns {object} - Updated state with coordinationIndex field
 */
export function updateCoordinationIndex(state) {
  const result = CoordinationIndex.compute(state);

  state.coordinationIndex = result;

  return state;
}

/**
 * Apply coordination effects to market calculations
 * @param {object} state - Game state
 * @param {object} marketParams - { basePrivateDemand, baseVolatility, baseInterventionProb }
 * @returns {object} - Adjusted params
 */
export function applyCoordinationEffects(state, marketParams) {
  if (!state.coordinationIndex) {
    return marketParams;
  }

  const effects = state.coordinationIndex.effects;

  return {
    ...marketParams,
    privateDemand: (marketParams.basePrivateDemand || 0) * effects.privateDemandMultiplier,
    volatility: (marketParams.baseVolatility || 1) * effects.volatilityMultiplier,
    interventionProb: (marketParams.baseInterventionProb || 0.2) * effects.interventionProbMultiplier,
    trustPremium: effects.trustPremiumUSD,
  };
}
