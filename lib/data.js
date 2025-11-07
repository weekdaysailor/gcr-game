import { promises as fs } from 'fs';
import path from 'path';

const PROJECTS_FILE = path.join(process.cwd(), 'data', 'projects.xml');
const EVENTS_FILE = path.join(process.cwd(), 'data', 'events.xml');

let projectLibraryCache = null;
let eventLibraryCache = null;

function parseBlocks(xml, tagName) {
  if (typeof xml !== 'string') return [];
  const pattern = new RegExp(`<${tagName}>([\\s\\S]*?)</${tagName}>`, 'gi');
  const blocks = [];
  let match;
  while ((match = pattern.exec(xml))) {
    blocks.push(match[1]);
  }
  return blocks;
}

function getTagValue(block, tagName) {
  if (typeof block !== 'string') return '';
  const pattern = new RegExp(`<${tagName}>([\\s\\S]*?)</${tagName}>`, 'i');
  const match = pattern.exec(block);
  return match ? match[1].trim() : '';
}

function parseNumber(value, fallback = 0) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return fallback;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

function parseBoolean(value, fallback = false) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (!normalized) return fallback;
    return ['1', 'true', 'yes', 'y'].includes(normalized);
  }
  return fallback;
}

function parseProjectsXml(xml) {
  return parseBlocks(xml, 'project')
    .map((block) => {
      const id = getTagValue(block, 'id');
      if (!id) return null;
      const co2eMitigation = parseNumber(getTagValue(block, 'co2eMitigation'));
      const project = {
        id,
        name: getTagValue(block, 'name') || id,
        description: getTagValue(block, 'description'),
        coBenefits: getTagValue(block, 'coBenefits'),
        xcrBid: parseNumber(getTagValue(block, 'xcrBid'), co2eMitigation),
        co2eMitigation,
        mitigationTonnes: co2eMitigation,
        supplyPressure: parseNumber(getTagValue(block, 'supplyPressure')),
        sentimentEffect: parseNumber(getTagValue(block, 'sentimentEffect'), 0),
        insuranceBuffer: parseNumber(getTagValue(block, 'insuranceBuffer'), 0),
        mrvStandard: getTagValue(block, 'mrvStandard') || 'Not specified',
        rewardMultiplier: 1.0, // Default R = 1.0
      };
      return project;
    })
    .filter(Boolean);
}

function parseEventsXml(xml) {
  return parseBlocks(xml, 'event')
    .map((block) => {
      const id = getTagValue(block, 'id');
      if (!id) return null;
      const effectsBlock = getTagValue(block, 'effects');
      const stats = parseBlocks(effectsBlock, 'stat').map((statBlock) => ({
        type: 'stat',
        target: getTagValue(statBlock, 'target'),
        operation: getTagValue(statBlock, 'operation') || 'add',
        value: parseNumber(getTagValue(statBlock, 'value'), 0),
      }));
      const upgrades = parseBlocks(effectsBlock, 'projectUpgrade').map((upgradeBlock) => ({
        type: 'projectUpgrade',
        projectId: getTagValue(upgradeBlock, 'projectId'),
        mitigationMultiplier: parseNumber(getTagValue(upgradeBlock, 'mitigationMultiplier'), 1),
        supplyMultiplier: parseNumber(getTagValue(upgradeBlock, 'supplyMultiplier'), 1),
        xcrBidMultiplier: parseNumber(getTagValue(upgradeBlock, 'xcrBidMultiplier'), 1),
        sentimentEffectDelta: parseNumber(getTagValue(upgradeBlock, 'sentimentEffectDelta'), 0),
        insuranceBufferDelta: parseNumber(getTagValue(upgradeBlock, 'insuranceBufferDelta'), 0),
      }));

      const operations = [...stats, ...upgrades].filter(
        (op) => (op.type === 'stat' && op.target) || (op.type === 'projectUpgrade' && op.projectId)
      );

      return {
        id,
        title: getTagValue(block, 'title') || id,
        description: getTagValue(block, 'description'),
        justified: parseBoolean(getTagValue(block, 'justified'), false),
        operations,
      };
    })
    .filter(Boolean);
}

async function loadProjects() {
  if (projectLibraryCache) return projectLibraryCache;
  try {
    const xml = await fs.readFile(PROJECTS_FILE, 'utf-8');
    projectLibraryCache = parseProjectsXml(xml);
  } catch (error) {
    console.error('Failed to load projects.xml', error);
    projectLibraryCache = [];
  }
  return projectLibraryCache;
}

async function loadEvents() {
  if (eventLibraryCache) return eventLibraryCache;
  try {
    const xml = await fs.readFile(EVENTS_FILE, 'utf-8');
    eventLibraryCache = parseEventsXml(xml);
  } catch (error) {
    console.error('Failed to load events.xml', error);
    eventLibraryCache = [];
  }
  return eventLibraryCache;
}

export async function getProjectLibrary() {
  const library = await loadProjects();
  return library;
}

export function cloneProject(project) {
  return {
    ...project,
  };
}

export async function generateProjects(count = 3) {
  const library = await getProjectLibrary();
  if (!library.length) return [];
  const clones = library.map((proj) => cloneProject(proj));
  clones.sort(() => Math.random() - 0.5);
  return clones.slice(0, count);
}

export async function getEventDefinitions() {
  const events = await loadEvents();
  return events;
}

export function applyProjectUpgrade({
  projectId,
  mitigationMultiplier,
  supplyMultiplier,
  xcrBidMultiplier,
  sentimentEffectDelta,
  insuranceBufferDelta,
}) {
  if (!projectLibraryCache || !projectLibraryCache.length) return;
  const target = projectLibraryCache.find((proj) => proj.id === projectId);
  if (!target) return;

  if (Number.isFinite(mitigationMultiplier) && mitigationMultiplier && mitigationMultiplier !== 1) {
    const nextValue = Math.round(target.co2eMitigation * mitigationMultiplier);
    target.co2eMitigation = nextValue;
    target.mitigationTonnes = nextValue;
  }

  if (Number.isFinite(supplyMultiplier) && supplyMultiplier && supplyMultiplier !== 1) {
    target.supplyPressure = Math.round(target.supplyPressure * supplyMultiplier);
  }

  if (Number.isFinite(xcrBidMultiplier) && xcrBidMultiplier && xcrBidMultiplier !== 1) {
    target.xcrBid = Math.round(target.xcrBid * xcrBidMultiplier);
  }

  if (Number.isFinite(sentimentEffectDelta) && sentimentEffectDelta) {
    target.sentimentEffect += sentimentEffectDelta;
  }

  if (Number.isFinite(insuranceBufferDelta) && insuranceBufferDelta) {
    target.insuranceBuffer += insuranceBufferDelta;
  }
}

export function normalizeProject(project) {
  if (!project || typeof project !== 'object') return null;
  const normalized = { ...project };
  const mitigation = parseNumber(normalized.co2eMitigation, parseNumber(normalized.mitigationTonnes));
  normalized.co2eMitigation = mitigation;
  normalized.mitigationTonnes = mitigation;
  normalized.xcrBid = parseNumber(normalized.xcrBid, mitigation);
  normalized.supplyPressure = parseNumber(normalized.supplyPressure, 0);
  normalized.sentimentEffect = parseNumber(normalized.sentimentEffect, 0);
  normalized.insuranceBuffer = parseNumber(normalized.insuranceBuffer, 0);
  normalized.coBenefits = typeof normalized.coBenefits === 'string' ? normalized.coBenefits : '';
  normalized.description = typeof normalized.description === 'string' ? normalized.description : '';
  if (typeof normalized.name !== 'string' || !normalized.name.trim()) {
    normalized.name = normalized.id || 'Project';
  }
  return normalized;
}
