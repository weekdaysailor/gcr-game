import { promises as fs } from 'fs';
import path from 'path';

const PROJECTS_FILE = path.join(process.cwd(), 'data', 'projects.xml');

let cachedProjects = [];
let cachedMtime = 0;

function parseAttributes(attrText) {
  const attrs = {};
  const attrRegex = /(\w[\w:-]*)\s*=\s*"([^"]*)"/g;
  let match;
  while ((match = attrRegex.exec(attrText)) !== null) {
    const [, key, raw] = match;
    attrs[key] = raw.trim();
  }
  return attrs;
}

function parseProjectsXml(xml) {
  const projects = [];
  const projectRegex = /<project\b([^>]*)\/>/g;
  let match;
  while ((match = projectRegex.exec(xml)) !== null) {
    const attrs = parseAttributes(match[1] || '');
    if (!attrs.id) continue;
    const project = {
      id: attrs.id,
      name: attrs.name || attrs.id,
      coBenefits: attrs.coBenefits || '',
      r: attrs.r ? Number(attrs.r) : null,
      co2eMitigation: attrs.co2eMitigation ? Number(attrs.co2eMitigation) : 0,
      xcrBid: attrs.xcrBid ? Number(attrs.xcrBid) : 0,
      supplyPressure: attrs.supplyPressure ? Number(attrs.supplyPressure) : 0,
      sentimentEffect: attrs.sentimentEffect ? Number(attrs.sentimentEffect) : 0,
    };
    projects.push(project);
  }
  return projects;
}

export async function ensureProjectLibrary() {
  try {
    const stats = await fs.stat(PROJECTS_FILE);
    if (!cachedProjects.length || stats.mtimeMs !== cachedMtime) {
      const xml = await fs.readFile(PROJECTS_FILE, 'utf-8');
      cachedProjects = parseProjectsXml(xml);
      cachedMtime = stats.mtimeMs;
    }
  } catch {
    if (!cachedProjects.length) {
      cachedProjects = [];
    }
  }
  return cachedProjects;
}

export async function getProjectLibrary() {
  await ensureProjectLibrary();
  return cachedProjects.map((p) => ({ ...p }));
}

export function getProjectLibraryReference() {
  return cachedProjects;
}

export async function generateProjects(count = 3) {
  const library = await getProjectLibrary();
  if (library.length <= count) {
    return library;
  }
  const shuffled = library.sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

export async function findProjectById(id) {
  if (!id) return null;
  const library = await getProjectLibrary();
  return library.find((proj) => proj.id === id) || null;
}
