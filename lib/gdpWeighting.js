// lib/gdpWeighting.js
import { promises as fs } from 'fs';
import path from 'path';

const COUNTRY_DATA_FILE = path.join(process.cwd(), 'data', 'countryData.json');

let countryDataCache = null;

/**
 * Load country GDP data from JSON file
 */
async function loadCountryData() {
  if (countryDataCache) return countryDataCache;

  try {
    const data = await fs.readFile(COUNTRY_DATA_FILE, 'utf-8');
    const parsed = JSON.parse(data);
    countryDataCache = parsed.countries || [];
  } catch (error) {
    console.error('Failed to load countryData.json', error);
    countryDataCache = [];
  }

  return countryDataCache;
}

/**
 * Get GDP data for a specific country
 */
export async function getCountryGDP(countryCode) {
  const countries = await loadCountryData();
  const country = countries.find(c => c.code === countryCode);
  return country?.gdpUSD || 0;
}

/**
 * Calculate normalized GDP weights for all members
 * Weights are normalized so that sum equals number of members
 * This preserves relative voting power while keeping total = member count
 *
 * Example:
 *   Members: USA (28T), EU (18T), CHN (18T)
 *   Total GDP: 64T
 *   Raw weights: USA=28/64=0.4375, EU=0.28125, CHN=0.28125
 *   Normalized (×3): USA=1.3125, EU=0.84375, CHN=0.84375
 *   Sum = 3.0 (equals member count)
 */
export async function calculateGDPWeights(members) {
  if (!Array.isArray(members) || members.length === 0) {
    return [];
  }

  const countries = await loadCountryData();

  // Get GDP for each member
  const memberGDPs = members.map(member => {
    const country = countries.find(c => c.code === member.country);
    return {
      country: member.country,
      gdpUSD: country?.gdpUSD || 0
    };
  });

  // Calculate total GDP
  const totalGDP = memberGDPs.reduce((sum, m) => sum + m.gdpUSD, 0);

  if (totalGDP === 0) {
    // If no GDP data, give everyone equal weight of 1.0
    return members.map(m => ({
      country: m.country,
      gdpWeight: 1.0,
      gdpUSD: 0
    }));
  }

  // Calculate normalized weights (sum = member count)
  const memberCount = members.length;
  return memberGDPs.map(m => ({
    country: m.country,
    gdpWeight: (m.gdpUSD / totalGDP) * memberCount,
    gdpUSD: m.gdpUSD
  }));
}

/**
 * Update member objects with GDP weights
 * Modifies members array in place and returns it
 */
export async function enrichMembersWithGDP(members) {
  const weights = await calculateGDPWeights(members);

  members.forEach(member => {
    const weightData = weights.find(w => w.country === member.country);
    if (weightData) {
      member.gdpWeight = weightData.gdpWeight;
      member.gdpUSD = weightData.gdpUSD;
    } else {
      member.gdpWeight = 1.0;
      member.gdpUSD = 0;
    }
  });

  return members;
}

/**
 * Recalculate and update GDP weights when membership changes
 * Call this whenever a member joins or leaves
 */
export async function recalculateWeights(state) {
  if (!state.members || state.members.length === 0) {
    return state;
  }

  await enrichMembersWithGDP(state.members);
  return state;
}

/**
 * Calculate voting power for a specific vote type
 * Returns map of country -> voting power
 */
export function calculateVotingPower(members, voteType = 'floor') {
  const powerMap = {};

  if (voteType === 'project') {
    // Project selection: equal weight (1 vote each)
    members.forEach(member => {
      powerMap[member.country] = 1.0;
    });
  } else {
    // Floor changes: GDP-weighted
    members.forEach(member => {
      powerMap[member.country] = member.gdpWeight || 1.0;
    });
  }

  return powerMap;
}

/**
 * Aggregate votes with appropriate weighting
 * Returns { decision, percentage, breakdown }
 */
export function aggregateVotes(votes, members, voteType = 'floor') {
  const votingPower = calculateVotingPower(members, voteType);
  const voteGroups = { hold: 0, raise: 0, lower: 0 };
  let totalWeight = 0;

  votes.forEach(vote => {
    const power = votingPower[vote.country] || 1.0;
    if (voteGroups[vote.vote] !== undefined) {
      voteGroups[vote.vote] += power;
      totalWeight += power;
    }
  });

  // Find winning decision
  const winner = Object.entries(voteGroups)
    .sort((a, b) => b[1] - a[1])[0];

  return {
    decision: winner[0],
    percentage: totalWeight > 0 ? winner[1] / totalWeight : 0,
    breakdown: voteGroups,
    totalWeight,
    voteType
  };
}

/**
 * Check if a vote passes with supermajority (≥66%)
 */
export function checkSupermajority(votes, members, voteType = 'floor') {
  const result = aggregateVotes(votes, members, voteType);
  return {
    ...result,
    passed: result.percentage >= 0.66
  };
}
