'use client';
import { useState, useEffect, useRef } from 'react';

const COUNTRY_OPTIONS = [
  {
    code: 'USA',
    name: 'United States',
    defaultNdc: 'Reduce economy-wide GHG emissions 50-52% below 2005 levels by 2030',
    parisAligned: true,
  },
  {
    code: 'EU',
    name: 'European Union',
    defaultNdc: 'Reduce net GHG emissions at least 55% below 1990 levels by 2030',
    parisAligned: true,
  },
  {
    code: 'CHN',
    name: 'China',
    defaultNdc: 'Peak CO2 emissions before 2030 and achieve carbon neutrality before 2060',
    parisAligned: false,
  },
  {
    code: 'IND',
    name: 'India',
    defaultNdc: 'Reduce emissions intensity of GDP by 45% by 2030 from 2005 level',
    parisAligned: false,
  },
];

const VOTE_LABELS = {
  hold: 'Hold floor',
  raise: 'Raise floor',
  lower: 'Lower floor',
};

function formatTimeAgo(iso) {
  if (!iso) return '—';
  const timestamp = Date.parse(iso);
  if (Number.isNaN(timestamp)) return '—';
  const diffMs = Date.now() - timestamp;
  if (!Number.isFinite(diffMs) || diffMs < 0) return 'just now';
  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function VoteScoreboard({ votes = [], currentCountry }) {
  const normalizedCurrent =
    typeof currentCountry === 'string' ? currentCountry.trim().toUpperCase() : '';
  const counts = votes.reduce(
    (acc, v) => {
      if (v && typeof v.vote === 'string' && acc[v.vote] !== undefined) {
        acc[v.vote] += 1;
      }
      return acc;
    },
    { hold: 0, raise: 0, lower: 0 }
  );

  const sortedVotes = [...votes]
    .filter((v) => v && typeof v.country === 'string')
    .sort((a, b) => {
      const aTime = Date.parse(a.updatedAt || 0) || 0;
      const bTime = Date.parse(b.updatedAt || 0) || 0;
      return bTime - aTime;
    });

  return (
    <section className="section-card card-tonal compact scoreboard">
      <h3>CEA Vote Scoreboard</h3>
      <p className="scoreboard__description">
        Live vote preferences from climate club members (auto-refreshes every few seconds).
      </p>
      <div className="scoreboard__counts">
        {Object.entries(VOTE_LABELS).map(([key, label]) => (
          <div key={key}>
            <span>{label}:</span>{' '}
            <span>{counts[key] || 0}</span>
          </div>
        ))}
      </div>
      {sortedVotes.length > 0 ? (
        <table>
          <thead>
            <tr>
              <th>Country</th>
              <th>Vote</th>
              <th>Turn</th>
              <th>Updated</th>
            </tr>
          </thead>
          <tbody>
            {sortedVotes.map((entry) => {
              const entryCountry =
                typeof entry.country === 'string' ? entry.country.toUpperCase() : entry.country;
              const isYou = normalizedCurrent && entryCountry === normalizedCurrent;
              return (
                <tr key={`${entryCountry}-${entry.updatedAt || 'now'}`} className={isYou ? 'highlight' : ''}>
                  <td>
                    {entryCountry}
                    {isYou ? ' (you)' : ''}
                  </td>
                  <td>{VOTE_LABELS[entry.vote] || entry.vote}</td>
                  <td>{typeof entry.turn === 'number' ? entry.turn : '—'}</td>
                  <td>{formatTimeAgo(entry.updatedAt)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : (
        <p className="muted">No votes recorded yet — be the first to weigh in.</p>
      )}
    </section>
  );
}

// simple formatter
function num(v, digits = 2) {
  if (typeof v === 'number' && !Number.isNaN(v)) return v.toFixed(digits);
  return (0).toFixed(digits);
}

// chart component (no deps)
function LineChart({ width = 500, height = 220, series = [], title = '' }) {
  const padding = 35;
  const allPoints = series.flatMap((s) => s.points);
  const xs = allPoints.map((p) => p.x);
  const ys = allPoints.map((p) => p.y);
  const minX = xs.length ? Math.min(...xs) : 0;
  const maxX = xs.length ? Math.max(...xs) : 1;
  const minY = ys.length ? Math.min(...ys) : 0;
  const maxY = ys.length ? Math.max(...ys) : 1;

  const xScale = (x) =>
    padding + ((x - minX) / (maxX - minX || 1)) * (width - padding * 1.2);
  const yScale = (y) =>
    height - padding - ((y - minY) / (maxY - minY || 1)) * (height - padding * 1.4);

  return (
    <div className="chart-shell">
      {title ? <h4>{title}</h4> : null}
      <svg width={width} height={height}>
        <line
          x1={padding}
          y1={height - padding}
          x2={width - padding / 4}
          y2={height - padding}
          stroke="#ccc"
        />
        <line
          x1={padding}
          y1={height - padding}
          x2={padding}
          y2={padding / 2}
          stroke="#ccc"
        />
        <text x={5} y={yScale(maxY)} fontSize="10" fill="#666">
          {maxY.toFixed(1)}
        </text>
        <text x={5} y={yScale(minY)} fontSize="10" fill="#666">
          {minY.toFixed(1)}
        </text>
        {series.map((s) => {
          const d = s.points
            .map((p, i) => `${i === 0 ? 'M' : 'L'}${xScale(p.x)},${yScale(p.y)}`)
            .join(' ');
          return (
            <g key={s.name}>
              <path d={d} fill="none" stroke={s.color} strokeWidth="2" />
              {s.points.map((p, i) => (
                <circle key={i} cx={xScale(p.x)} cy={yScale(p.y)} r={2.5} fill={s.color} />
              ))}
            </g>
          );
        })}
      </svg>
      <div className="chart-legend">
        {series.map((s) => (
          <div key={s.name}>
            <span className="legend-swatch" style={{ background: s.color }} />
            <span>{s.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// MOU text
const SAMPLE_MOU = `
Memorandum of Understanding (Draft)
Participation in the Global Carbon Reward (GCR) Climate Club

1. Purpose
This MOU records the shared intention of the Participating Country (“Participant”) to cooperate with other participating countries in piloting the Global Carbon Reward (GCR) policy mechanism. The GCR is a performance-based reward system for verified GHG mitigation, administered by a Carbon Exchange Authority (CEA), and supported by a price-floor guarantee delivered through cooperating central banks under a CQE arrangement. This MOU is not a currency agreement. Rewards issued are carbon-linked assets, not legal tender.

2. Principles
(a) The Participant affirms its existing or strengthened NDC under the Paris Agreement.
(b) The Participant affirms that its central bank, or designated monetary authority, is willing in-principle to participate in defending the XCR price floor under the direction of the CEA, subject to domestic mandates.
(c) The Participant understands that XCR rewards are conditional grants for verified mitigation, not offsets.

3. Institutional Roles
(a) CEA: sets and publishes a mitigation roadmap, sets the indicative XCR price floor, and issues reward contracts.
(b) Central Banks / Monetary-Carbon Alliance: defend the published XCR price floor when market prices fall below the floor, using CQE as needed.
(c) Participants: provide policy support, MRV cooperation, and regulatory clarity.

4. Price Floor
The Participant accepts that the XCR price floor is a policy signal managed by the CEA and supported by central banks, with the objective of closing the global climate finance gap.

5. Legal Nature
This MOU is non-binding and does not create enforceable rights or obligations under international law.

6. Future Work
Participants may later adopt a binding instrument, voting rules for floor adjustments, and detailed MRV protocols.
`;

export default function HomePage() {
  const [simState, setSimState] = useState({
    turn: 1,
    floor: 80,
    market: 82,
    inflation: 1.1,
    privateShare: 0.7,
    sentiment: 0.2,
    cqeBuy: 0,
    lastEvent: null,
    projects: [],
    totalMitigation: 0,
    history: [],
    members: [],
    credibility: 1.0,
    votes: [],
  });

  const [selectedCountry, setSelectedCountry] = useState('USA');
  const [ndcText, setNdcText] = useState(
    COUNTRY_OPTIONS.find((c) => c.code === 'USA').defaultNdc
  );
  const [centralBankOk, setCentralBankOk] = useState(false);
  const [inClimateClub, setInClimateClub] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [chosenProjectId, setChosenProjectId] = useState(null);
  const [floorDecision, setFloorDecision] = useState('hold');
  const [projectDrafts, setProjectDrafts] = useState([]);
  const [activeProjectId, setActiveProjectId] = useState(null);

  // manual floor setter
  const [newFloor, setNewFloor] = useState(80);

  // onboarding extras
  const [wantReset, setWantReset] = useState(false);
  const [showMouModal, setShowMouModal] = useState(false);
  const [mouScrolledToEnd, setMouScrolledToEnd] = useState(false);
  const [mouAgreed, setMouAgreed] = useState(false);
  const mouRef = useRef(null);

  // load members
  useEffect(() => {
    fetch('/api/join-club')
      .then((r) => r.json())
      .then((data) => {
        setSimState((prev) => ({
          ...prev,
          members: Array.isArray(data.members) ? data.members : prev.members,
          votes: Array.isArray(data.votes) ? data.votes : prev.votes,
        }));
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;
    let intervalId;

    async function loadVotes() {
      try {
        const res = await fetch('/api/votes', { cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        setSimState((prev) => ({
          ...prev,
          votes: Array.isArray(data.votes) ? data.votes : prev.votes,
        }));
      } catch {
        // ignore network errors
      }
    }

    const intervalMs = inClimateClub ? 4000 : 8000;
    loadVotes();
    intervalId = setInterval(loadVotes, intervalMs);

    return () => {
      cancelled = true;
      if (intervalId) clearInterval(intervalId);
    };
  }, [inClimateClub]);

  function handleCountryChange(e) {
    const code = e.target.value;
    setSelectedCountry(code);
    const country = COUNTRY_OPTIONS.find((c) => c.code === code);
    setNdcText(country.defaultNdc);
  }

  function handleMouScroll() {
    if (!mouRef.current) return;
    const el = mouRef.current;
    const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 10;
    if (atBottom) {
      setMouScrolledToEnd(true);
    }
  }

  async function attemptJoinClub() {
    const country = COUNTRY_OPTIONS.find((c) => c.code === selectedCountry);
    const ndcOk = country.parisAligned;
    const cbOk = centralBankOk;

    if (!ndcOk) {
      setErrorMsg(
        'This NDC is not marked Paris-aligned. Strengthen it or pick an approved NDC.'
      );
      return;
    }
    if (!cbOk) {
      setErrorMsg('You must confirm CQE participation to join the climate club.');
      return;
    }
    if (!mouAgreed) {
      setShowMouModal(true);
      setErrorMsg('Please read and agree to the MOU.');
      return;
    }

    setErrorMsg('');

    if (wantReset) {
      await fetch('/api/reset-game', { method: 'POST' })
        .then((res) => res.json())
        .then((data) => {
          if (typeof data.floor === 'number') {
            setNewFloor(data.floor);
            setSimState((prev) => {
              const nextProjects = Array.isArray(data.projects) ? data.projects : prev.projects;
              syncProjects(nextProjects);
              return {
                ...prev,
                floor: data.floor,
                market: typeof data.market === 'number' ? data.market : prev.market,
                turn: typeof data.turn === 'number' ? data.turn : prev.turn,
                history: Array.isArray(data.history) ? data.history : prev.history,
                projects: nextProjects,
                members: Array.isArray(data.members) ? data.members : prev.members,
                votes: Array.isArray(data.votes) ? data.votes : prev.votes,
                totalMitigation:
                  typeof data.totalMitigation === 'number'
                    ? data.totalMitigation
                    : prev.totalMitigation,
                credibility:
                  typeof data.credibility === 'number' ? data.credibility : prev.credibility,
              };
            });
          }
        })
        .catch(() => {});
    }

    setInClimateClub(true);

    await fetch('/api/join-club', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ country: selectedCountry }),
    });

    const res = await fetch('/api/join-club');
    const data = await res.json();
    setSimState((prev) => ({
      ...prev,
      members: Array.isArray(data.members) ? data.members : prev.members,
      votes: Array.isArray(data.votes) ? data.votes : prev.votes,
    }));
  }

  async function nextTurn() {
    const bodyToSend = {
      ...simState,
      chosenProjectId,
      floorDecision,
      playerCountry: selectedCountry,
    };

    const res = await fetch('/api/nextturn', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bodyToSend),
    });

    if (!res.ok) return;
    const data = await res.json();

    let nextFloorValue = simState.floor;
    let upcomingProjects = [];
    setSimState((prev) => {
      const computedFloor =
        typeof data.floor === 'number' ? data.floor : prev.floor;
      nextFloorValue = computedFloor;
      const resolvedProjects = Array.isArray(data.projects) ? data.projects : prev.projects;
      upcomingProjects = resolvedProjects;
      return {
        ...prev,
        ...data,
        floor: computedFloor,
        market: typeof data.market === 'number' ? data.market : prev.market,
        inflation: typeof data.inflation === 'number' ? data.inflation : prev.inflation,
        privateShare:
          typeof data.privateShare === 'number' ? data.privateShare : prev.privateShare,
        sentiment: typeof data.sentiment === 'number' ? data.sentiment : prev.sentiment,
        cqeBuy: typeof data.cqeBuy === 'number' ? data.cqeBuy : prev.cqeBuy,
        totalMitigation:
          typeof data.totalMitigation === 'number'
            ? data.totalMitigation
            : prev.totalMitigation,
        credibility:
          typeof data.credibility === 'number' ? data.credibility : prev.credibility,
        history: Array.isArray(data.history) ? data.history : prev.history,
        projects: resolvedProjects,
        members: Array.isArray(data.members) ? data.members : prev.members,
        votes: Array.isArray(data.votes) ? data.votes : prev.votes,
      };
    });

    syncProjects(upcomingProjects);

    setNewFloor(nextFloorValue);

    setChosenProjectId(null);
    setFloorDecision('hold');
  }

  async function setFloorNow() {
    const val = Number(newFloor);
    if (Number.isNaN(val) || val < 10) {
      alert('Enter a sensible floor (>= 10).');
      return;
    }
    const res = await fetch('/api/set-floor', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ floor: val }),
    });
    if (res.ok) {
      const data = await res.json();
      setSimState((prev) => ({ ...prev, floor: data.floor }));
      setNewFloor(data.floor);
    }
  }

  async function submitVote(choice) {
    setFloorDecision(choice);
    if (!inClimateClub) return;

    const playerCountry = selectedCountry;
    if (!playerCountry) return;
    const currentTurn = simState.turn || 1;
    const optimisticTimestamp = new Date().toISOString();

    setSimState((prev) => {
      const existingVotes = Array.isArray(prev.votes) ? prev.votes : [];
      const withoutPlayer = existingVotes.filter((v) => v.country !== playerCountry);
      return {
        ...prev,
        votes: [
          ...withoutPlayer,
          {
            country: playerCountry,
            vote: choice,
            updatedAt: optimisticTimestamp,
            turn: currentTurn,
          },
        ],
      };
    });

    try {
      const res = await fetch('/api/votes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ country: playerCountry, vote: choice, turn: currentTurn }),
      });
      if (res.ok) {
        const data = await res.json();
        setSimState((prev) => ({
          ...prev,
          votes: Array.isArray(data.votes) ? data.votes : prev.votes,
        }));
      }
    } catch {
      // ignore network failure; polling will resync
    }
  }

  const syncProjects = (projects) => {
    if (!Array.isArray(projects) || projects.length === 0) {
      setProjectDrafts([]);
      setActiveProjectId(null);
      setChosenProjectId((prev) => (prev ? null : prev));
      return;
    }

    const clones = projects.map((proj) => ({ ...proj }));
    setProjectDrafts(clones);
    setActiveProjectId((prev) => {
      if (prev && clones.some((proj) => proj.id === prev)) {
        return prev;
      }
      return clones[0]?.id || null;
    });
    setChosenProjectId((prev) => (prev && clones.some((proj) => proj.id === prev) ? prev : null));
  };

  const handleSelectProject = (projectId) => {
    setActiveProjectId(projectId);
  };

  const handleChooseProject = (projectId) => {
    setChosenProjectId(projectId);
  };

  const updateProjectField = (projectId, field, rawValue, { numeric = false } = {}) => {
    setProjectDrafts((prev) =>
      prev.map((proj) => {
        if (!proj || proj.id !== projectId) return proj;
        const next = { ...proj };
        if (numeric) {
          const parsed = Number(rawValue);
          const safeValue = Number.isFinite(parsed) ? parsed : 0;
          next[field] = safeValue;
          if (field === 'co2eMitigation' || field === 'mitigationTonnes') {
            next.co2eMitigation = safeValue;
            next.mitigationTonnes = safeValue;
          }
        } else {
          next[field] = rawValue;
        }
        return next;
      })
    );
  };

  const activeProject = projectDrafts.find((proj) => proj.id === activeProjectId);

  // if not in club, show onboarding
  if (!inClimateClub) {
    return (
      <main className="app-shell">
        <header className="page-header">
          <div className="stack">
            <h1>🌍 Join the Climate Club</h1>
            <p className="subtitle">
              Choose your country, confirm CQE, and agree to the draft MOU before entering.
              (ChatGPT can make mistakes — please validate the MOU text against the actual
              paper.)
            </p>
          </div>
          <div className="page-actions">
            <button type="button" onClick={attemptJoinClub} className="btn-primary">
              ✅ Join Climate Club
            </button>
          </div>
        </header>

        <section className="section-card">
          <div className="form-stack">
            <label className="form-control">
              <strong>1. Select your country</strong>
              <select value={selectedCountry} onChange={handleCountryChange}>
                {COUNTRY_OPTIONS.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="form-control">
              <strong>2. Nationally Determined Contribution (NDC)</strong>
              <textarea value={ndcText} onChange={(e) => setNdcText(e.target.value)} />
            </label>

            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={centralBankOk}
                onChange={(e) => setCentralBankOk(e.target.checked)}
              />
              <span>
                3. I confirm this country’s central bank will provide CQE to defend the XCR
                floor.
              </span>
            </label>

            <div className="stack">
              <button type="button" onClick={() => setShowMouModal(true)} className="btn-ghost">
                📄 View Climate Club MOU (draft)
              </button>
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={mouAgreed}
                  onChange={(e) => setMouAgreed(e.target.checked)}
                  disabled={!mouScrolledToEnd}
                />
                <span>
                  I have read the MOU and agree to proceed.
                  {!mouScrolledToEnd ? (
                    <span className="note-warning"> (Scroll to the bottom of the MOU first)</span>
                  ) : null}
                </span>
              </label>
            </div>

            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={wantReset}
                onChange={(e) => setWantReset(e.target.checked)}
              />
              <span>Start new game (reset global state) before joining</span>
            </label>

            {errorMsg ? <p className="error-text">{errorMsg}</p> : null}
          </div>
        </section>

        <section className="section-card compact">
          <h3>Current Climate Club Members</h3>
          {simState.members && simState.members.length > 0 ? (
            <ul>
              {simState.members.map((m) => (
                <li key={m.country}>{m.country}</li>
              ))}
            </ul>
          ) : (
            <p className="muted">No members yet.</p>
          )}
        </section>

        <VoteScoreboard
          votes={Array.isArray(simState.votes) ? simState.votes : []}
          currentCountry={selectedCountry}
        />

        {showMouModal ? (
          <div className="modal-overlay">
            <div className="modal-card">
              <div className="modal-card__header">
                <h2>Climate Club MOU (Draft)</h2>
              </div>
              <div ref={mouRef} onScroll={handleMouScroll} className="modal-card__content">
                {SAMPLE_MOU}
              </div>
              <div className="modal-card__footer">
                <button type="button" onClick={() => setShowMouModal(false)} className="btn-secondary">
                  Close
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMouAgreed(true);
                    setShowMouModal(false);
                  }}
                  disabled={!mouScrolledToEnd}
                  className="btn-primary"
                >
                  I agree
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </main>
    );
  }

  // MAIN SIM VIEW
  // build chart data
  const history = Array.isArray(simState.history) ? simState.history : [];
  let cumulativeXcr = 0;
  let cumulativeMitigation = 0;
  const floorSeries = [];
  const mitigationSeries = [];
  const xcrSeries = [];

  history.forEach((h, idx) => {
    const turn = h.turn ?? idx + 1;
    const floorVal = typeof h.floor === 'number' ? h.floor : simState.floor || 0;
    floorSeries.push({ x: turn, y: floorVal });

    const thisMitigation =
      typeof h.mitigation === 'number'
        ? h.mitigation
        : typeof h.avoidedEmissions === 'number'
        ? h.avoidedEmissions
        : 0;
    cumulativeMitigation += thisMitigation;
    mitigationSeries.push({ x: turn, y: cumulativeMitigation });

    const xcrThisTurn = typeof h.xcrAwarded === 'number' ? h.xcrAwarded : 0;
    cumulativeXcr += xcrThisTurn;
    xcrSeries.push({ x: turn, y: cumulativeXcr });
  });

  return (
    <main className="app-shell app-shell--wide">
      <header className="page-header">
        <div className="stack">
          <h1>🌍 CEA Simulation</h1>
          <p className="subtitle">
            Playing as: <b>{selectedCountry}</b>
          </p>
        </div>
        <div className="page-actions">
          <button type="button" onClick={nextTurn} className="btn-primary">
            ▶️ Next Turn
          </button>
        </div>
      </header>

      <section className="section-card compact">
        <h3>Climate Club Members</h3>
        {simState.members && simState.members.length > 0 ? (
          <ul>
            {simState.members.map((m) => (
              <li key={m.country}>{m.country}</li>
            ))}
          </ul>
        ) : (
          <p className="muted">No other members yet.</p>
        )}
      </section>

      {simState.lastEvent ? (
        <section className="section-card card-tonal compact">
          <div>
            <strong>Event this turn:</strong> {simState.lastEvent.title}
            {simState.lastEvent.occurredAt ? (
              <span className="muted"> ({formatTimeAgo(simState.lastEvent.occurredAt)})</span>
            ) : null}
            {simState.lastEvent.justified ? (
              <span className="muted"> – justification allows floor changes</span>
            ) : null}
          </div>
        </section>
      ) : (
        <section className="section-card compact">
          <p className="muted">No event yet — click “Next Turn”.</p>
        </section>
      )}

      <section className="section-card">
        <h2>Project proposals this turn</h2>
        {projectDrafts.length > 0 ? (
          <div className="project-browser">
            <div className="project-browser__list">
              {projectDrafts.map((proj) => {
                const isActive = activeProjectId === proj.id;
                const isChosen = chosenProjectId === proj.id;
                const mitigationLabel =
                  typeof proj.co2eMitigation === 'number' && Number.isFinite(proj.co2eMitigation)
                    ? `${proj.co2eMitigation.toLocaleString()} tCO₂e`
                    : '';
                return (
                  <button
                    type="button"
                    key={proj.id}
                    className={`project-browser__item${isActive ? ' is-active' : ''}${
                      isChosen ? ' is-chosen' : ''
                    }`}
                    onClick={() => handleSelectProject(proj.id)}
                  >
                    <span className="project-browser__name">{proj.name}</span>
                    {mitigationLabel ? (
                      <span className="project-browser__meta">{mitigationLabel}</span>
                    ) : null}
                  </button>
                );
              })}
            </div>
            <div className="project-browser__details">
              {activeProject ? (
                <form className="project-form" onSubmit={(e) => e.preventDefault()}>
                  <div className="project-form__header">
                    <h3>{activeProject.name}</h3>
                    <span className="muted">ID: {activeProject.id}</span>
                  </div>
                  <label className="project-form__field">
                    <span>Project name</span>
                    <input
                      type="text"
                      value={activeProject.name}
                      onChange={(e) =>
                        updateProjectField(activeProject.id, 'name', e.target.value)
                      }
                    />
                  </label>
                  <label className="project-form__field">
                    <span>Description</span>
                    <textarea
                      rows={3}
                      value={activeProject.description || ''}
                      onChange={(e) =>
                        updateProjectField(activeProject.id, 'description', e.target.value)
                      }
                    />
                  </label>
                  <label className="project-form__field">
                    <span>Co-benefits</span>
                    <textarea
                      rows={2}
                      value={activeProject.coBenefits || ''}
                      onChange={(e) =>
                        updateProjectField(activeProject.id, 'coBenefits', e.target.value)
                      }
                    />
                  </label>
                  <div className="project-form__grid">
                    <label className="project-form__field">
                      <span>XCR bid (cost)</span>
                      <input
                        type="number"
                        value={
                          Number.isFinite(activeProject.xcrBid) ? activeProject.xcrBid : 0
                        }
                        min={0}
                        step={1000}
                        onChange={(e) =>
                          updateProjectField(activeProject.id, 'xcrBid', e.target.value, {
                            numeric: true,
                          })
                        }
                      />
                    </label>
                    <label className="project-form__field">
                      <span>CO₂e mitigation (t)</span>
                      <input
                        type="number"
                        value={
                          Number.isFinite(activeProject.co2eMitigation)
                            ? activeProject.co2eMitigation
                            : 0
                        }
                        min={0}
                        step={1000}
                        onChange={(e) =>
                          updateProjectField(
                            activeProject.id,
                            'co2eMitigation',
                            e.target.value,
                            { numeric: true }
                          )
                        }
                      />
                    </label>
                  </div>
                  <div className="project-form__grid">
                    <label className="project-form__field">
                      <span>Supply pressure</span>
                      <input
                        type="number"
                        value={
                          Number.isFinite(activeProject.supplyPressure)
                            ? activeProject.supplyPressure
                            : 0
                        }
                        min={0}
                        step={1000}
                        onChange={(e) =>
                          updateProjectField(
                            activeProject.id,
                            'supplyPressure',
                            e.target.value,
                            { numeric: true }
                          )
                        }
                      />
                    </label>
                    <label className="project-form__field">
                      <span>Sentiment effect</span>
                      <input
                        type="number"
                        value={
                          Number.isFinite(activeProject.sentimentEffect)
                            ? activeProject.sentimentEffect
                            : 0
                        }
                        step={0.01}
                        onChange={(e) =>
                          updateProjectField(
                            activeProject.id,
                            'sentimentEffect',
                            e.target.value,
                            { numeric: true }
                          )
                        }
                      />
                    </label>
                    <label className="project-form__field">
                      <span>Insurance buffer (%)</span>
                      <input
                        type="number"
                        value={
                          Number.isFinite(activeProject.insuranceBuffer)
                            ? activeProject.insuranceBuffer
                            : 0
                        }
                        min={0}
                        step={0.1}
                        onChange={(e) =>
                          updateProjectField(
                            activeProject.id,
                            'insuranceBuffer',
                            e.target.value,
                            { numeric: true }
                          )
                        }
                      />
                    </label>
                  </div>
                  <div className="project-form__actions">
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => handleChooseProject(activeProject.id)}
                    >
                      Select this project
                    </button>
                    {chosenProjectId === activeProject.id ? (
                      <span className="muted">Currently selected</span>
                    ) : null}
                  </div>
                </form>
              ) : (
                <p className="muted">Select a project to view and edit details.</p>
              )}
            </div>
          </div>
        ) : (
          <p className="muted">No projects loaded yet. Click Next Turn.</p>
        )}
      </section>

      <VoteScoreboard
        votes={Array.isArray(simState.votes) ? simState.votes : []}
        currentCountry={selectedCountry}
      />

      <section className="section-card">
        <h2>Floor decision</h2>
        <p className="muted">
          You can only change the floor every few turns unless the event justifies it.
        </p>
        <div className="radio-group">
          <label className="radio-option">
            <input
              type="radio"
              name="floor"
              value="hold"
              checked={floorDecision === 'hold'}
              onChange={() => submitVote('hold')}
            />
            <span>Hold</span>
          </label>
          <label className="radio-option">
            <input
              type="radio"
              name="floor"
              value="raise"
              checked={floorDecision === 'raise'}
              onChange={() => submitVote('raise')}
            />
            <span>Raise</span>
          </label>
          <label className="radio-option">
            <input
              type="radio"
              name="floor"
              value="lower"
              checked={floorDecision === 'lower'}
              onChange={() => submitVote('lower')}
            />
            <span>Lower</span>
          </label>
        </div>
      </section>

      <section className="section-card">
        <h3>Admin: Set XCR Price Floor (no voting)</h3>
        <p className="muted">
          For now, whichever user sets the floor wins. Later this can be guarded by a voting rule.
        </p>
        <div className="inline-controls">
          <label>
            New floor ($/t):
            <input
              type="number"
              value={newFloor}
              onChange={(e) => setNewFloor(e.target.value)}
              min={10}
              className="input-compact"
            />
          </label>
          <button onClick={setFloorNow} className="btn-secondary">
            💾 Set floor now
          </button>
          <span className="muted">
            Current floor: <b>${num(simState.floor)}</b>/t
          </span>
        </div>
      </section>

      <div className="two-column-grid">
        <section className="section-card compact">
          <h3>Key indicators</h3>
          <div className="stat-list">
            <p>
              <span>Turn</span>
              <span>{simState.turn || 1}</span>
            </p>
            <p>
              <span>Floor</span>
              <span>${num(simState.floor)}/t</span>
            </p>
            <p>
              <span>Market</span>
              <span>${num(simState.market)}/t</span>
            </p>
            <p>
              <span>Inflation</span>
              <span>{num(simState.inflation)}%</span>
            </p>
            <p>
              <span>Private Capital Share</span>
              <span>
                {typeof simState.privateShare === 'number'
                  ? (simState.privateShare * 100).toFixed(1)
                  : '0.0'}
                %
              </span>
            </p>
            <p>
              <span>CQE Purchases</span>
              <span>{num(simState.cqeBuy)}</span>
            </p>
            <p>
              <span>Credibility</span>
              <span>{num(simState.credibility)}</span>
            </p>
            <p>
              <span>Total Mitigation</span>
              <span>
                {typeof simState.totalMitigation === 'number'
                  ? (simState.totalMitigation / 1_000_000).toFixed(2)
                  : '0.00'}{' '}
                MtCO₂e
              </span>
            </p>
          </div>
        </section>

        <section className="section-card compact">
          <h3>Turn History</h3>
          {simState.history && simState.history.length > 0 ? (
            <div className="scroll-area">
              <ul>
                {simState.history.map((h) => (
                  <li key={h.time}>
                    <b>Turn {h.turn}:</b> {h.event} | proj: {h.project}{' '}
                    {h.guidanceBroken ? <span className="note-warning">(guidance broken)</span> : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="muted">No turns yet.</p>
          )}
        </section>
      </div>

      <section className="section-card">
        <LineChart
          title="XCR Floor, Total Mitigation (cumulative), Cumulative XCR Awarded"
          series={[
            { name: 'XCR floor ($/t)', color: '#1f77b4', points: floorSeries },
            {
              name: 'Total mitigation (cumulative tCO₂e)',
              color: '#2ca02c',
              points: mitigationSeries,
            },
            { name: 'Cumulative XCR', color: '#d62728', points: xcrSeries },
          ]}
        />
      </section>
    </main>
  );
}

