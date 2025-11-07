// lib/timePhase.js
// Utilities for managing time, phases, and quarters in the GCR simulation

/**
 * Configuration for time periods
 */
export const TIME_CONFIG = {
  START_YEAR: 2025,
  END_YEAR: 2050,
  QUARTERS_PER_YEAR: 4,
  PHASES: [
    { id: 1, startYear: 2025, endYear: 2032, label: 'Early Phase' },
    { id: 2, startYear: 2033, endYear: 2041, label: 'Middle Phase' },
    { id: 3, startYear: 2042, endYear: 2050, label: 'Late Phase' },
  ],
};

/**
 * Get the phase number for a given year
 * @param {number} year - Year (2025-2050)
 * @returns {1 | 2 | 3} - Phase number
 */
export function getPhase(year) {
  if (year <= 2032) return 1;
  if (year <= 2041) return 2;
  return 3;
}

/**
 * Get phase metadata
 * @param {number} year - Year (2025-2050)
 * @returns {object} - Phase object with id, startYear, endYear, label
 */
export function getPhaseInfo(year) {
  const phaseId = getPhase(year);
  return TIME_CONFIG.PHASES.find(p => p.id === phaseId) || TIME_CONFIG.PHASES[0];
}

/**
 * Convert year and quarter to sequential turn number
 * Turn 1 = 2025 Q1, Turn 2 = 2025 Q2, etc.
 * @param {number} year - Year (2025-2050)
 * @param {number} quarter - Quarter (1-4)
 * @returns {number} - Sequential turn number starting at 1
 */
export function computeTurn(year, quarter) {
  return (year - TIME_CONFIG.START_YEAR) * TIME_CONFIG.QUARTERS_PER_YEAR + quarter;
}

/**
 * Convert sequential turn number to year and quarter
 * @param {number} turn - Sequential turn number (1+)
 * @returns {{year: number, quarter: number}} - Year and quarter
 */
export function turnToYearQuarter(turn) {
  const quarterIndex = turn - 1; // Convert to 0-based
  const year = TIME_CONFIG.START_YEAR + Math.floor(quarterIndex / TIME_CONFIG.QUARTERS_PER_YEAR);
  const quarter = (quarterIndex % TIME_CONFIG.QUARTERS_PER_YEAR) + 1;
  return { year, quarter };
}

/**
 * Check if a given quarter is an annual anchor (Q4)
 * Annual anchors have special events: guidance refresh, science synthesis, diplomacy summit
 * @param {number} quarter - Quarter (1-4)
 * @returns {boolean} - True if Q4
 */
export function isAnnualAnchor(quarter) {
  return quarter === 4;
}

/**
 * Advance to the next quarter
 * @param {number} year - Current year
 * @param {number} quarter - Current quarter (1-4)
 * @returns {{year: number, quarter: number}} - Next year and quarter
 */
export function advanceQuarter(year, quarter) {
  if (quarter === 4) {
    return { year: year + 1, quarter: 1 };
  }
  return { year, quarter: quarter + 1 };
}

/**
 * Check if the simulation has reached the end year
 * @param {number} year - Year to check
 * @returns {boolean} - True if simulation is complete
 */
export function isSimulationComplete(year) {
  return year > TIME_CONFIG.END_YEAR;
}

/**
 * Get a human-readable label for a turn
 * @param {number} year - Year
 * @param {number} quarter - Quarter
 * @returns {string} - e.g., "2025 Q1"
 */
export function formatTurnLabel(year, quarter) {
  return `${year} Q${quarter}`;
}

/**
 * Get quarter label with season name
 * @param {number} quarter - Quarter (1-4)
 * @returns {string} - e.g., "Q1 (Jan-Mar)"
 */
export function getQuarterLabel(quarter) {
  const labels = {
    1: 'Q1 (Jan-Mar)',
    2: 'Q2 (Apr-Jun)',
    3: 'Q3 (Jul-Sep)',
    4: 'Q4 (Oct-Dec)',
  };
  return labels[quarter] || `Q${quarter}`;
}

/**
 * Calculate progress through the simulation (0-1)
 * @param {number} year - Current year
 * @param {number} quarter - Current quarter
 * @returns {number} - Progress from 0 to 1
 */
export function getSimulationProgress(year, quarter) {
  const totalQuarters = (TIME_CONFIG.END_YEAR - TIME_CONFIG.START_YEAR + 1) * TIME_CONFIG.QUARTERS_PER_YEAR;
  const currentQuarter = computeTurn(year, quarter) - 1; // 0-based
  return Math.min(1, currentQuarter / totalQuarters);
}

/**
 * Initialize time state from a legacy turn number
 * Used for migrating old saves that only have 'turn'
 * @param {number} turn - Legacy turn number
 * @returns {{year: number, quarter: number, turn: number, phase: number}} - Complete time state
 */
export function initializeTimeState(turn = 1) {
  const { year, quarter } = turnToYearQuarter(turn);
  const phase = getPhase(year);

  return {
    year,
    quarter,
    turn,
    phase,
    isAnnualAnchor: isAnnualAnchor(quarter),
  };
}

/**
 * Advance time state by one quarter
 * @param {{year: number, quarter: number, turn: number}} state - Current time state
 * @returns {{year: number, quarter: number, turn: number, phase: number}} - Updated time state
 */
export function advanceTimeState(state) {
  const { year: nextYear, quarter: nextQuarter } = advanceQuarter(state.year, state.quarter);
  const nextTurn = computeTurn(nextYear, nextQuarter);
  const nextPhase = getPhase(nextYear);

  return {
    year: nextYear,
    quarter: nextQuarter,
    turn: nextTurn,
    phase: nextPhase,
    isAnnualAnchor: isAnnualAnchor(nextQuarter),
  };
}

/**
 * Validate time state consistency
 * @param {{year: number, quarter: number, turn: number}} state - Time state to validate
 * @returns {boolean} - True if consistent
 */
export function validateTimeState(state) {
  if (!state || typeof state !== 'object') return false;

  const { year, quarter, turn } = state;

  // Check basic ranges
  if (quarter < 1 || quarter > 4) return false;
  if (year < TIME_CONFIG.START_YEAR || year > TIME_CONFIG.END_YEAR + 1) return false;
  if (turn < 1) return false;

  // Check that turn matches year/quarter
  const expectedTurn = computeTurn(year, quarter);
  return turn === expectedTurn;
}
