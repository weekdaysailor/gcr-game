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
    <div style={{ background: '#fff', border: '1px solid #eee', borderRadius: 6, padding: 8 }}>
      {title ? <h4 style={{ margin: '4px 0 8px' }}>{title}</h4> : null}
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
      <div style={{ display: 'flex', gap: 10, marginTop: 6, flexWrap: 'wrap' }}>
        {series.map((s) => (
          <div key={s.name} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span
              style={{
                width: 12,
                height: 3,
                background: s.color,
                display: 'inline-block',
              }}
            />
            <span style={{ fontSize: 12 }}>{s.name}</span>
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
  const [projectDetail, setProjectDetail] = useState(null);

  // manual floor setter
  const [newFloor, setNewFloor] = useState('80');

  const panelStyle = {
    border: '1px solid #dfe3e8',
    borderRadius: 8,
    background: '#fff',
    padding: '12px 14px',
  };

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
        if (data.members) {
          setSimState((prev) => ({
            ...prev,
            members: data.members,
          }));
        }
      })
      .catch(() => {});
  }, []);

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
      await fetch('/api/reset-game', { method: 'POST' }).catch(() => {});
    }

    setInClimateClub(true);

    await fetch('/api/join-club', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ country: selectedCountry }),
    });

    const res = await fetch('/api/join-club');
    const data = await res.json();
    setSimState((prev) => ({ ...prev, members: data.members || [] }));
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

    setSimState((prev) => ({
      ...prev,
      ...data,
      floor: typeof data.floor === 'number' ? data.floor : prev.floor,
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
      projects: Array.isArray(data.projects) ? data.projects : prev.projects,
      members: Array.isArray(data.members) ? data.members : prev.members,
    }));

    if (typeof data.floor === 'number') {
      setNewFloor(data.floor.toString());
    }

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
      if (typeof data.floor === 'number') {
        setNewFloor(data.floor.toString());
      }
    }
  }

  function openProjectDetails(project) {
    if (!project) return;
    setProjectDetail(project);
  }

  function closeProjectDetails() {
    setProjectDetail(null);
  }

  // if not in club, show onboarding
  if (!inClimateClub) {
    return (
      <main style={{ fontFamily: 'sans-serif', padding: 40, maxWidth: 720 }}>
        <h1>🌍 Join the Climate Club</h1>
        <p>
          Choose your country, confirm CQE, and agree to the draft MOU before entering. (ChatGPT
          can make mistakes — please validate the MOU text against the actual paper.)
        </p>

        <label style={{ display: 'block', marginTop: 20 }}>
          <b>1. Select your country</b>
          <br />
          <select value={selectedCountry} onChange={handleCountryChange} style={{ marginTop: 6 }}>
            {COUNTRY_OPTIONS.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </select>
        </label>

        <label style={{ display: 'block', marginTop: 20 }}>
          <b>2. Nationally Determined Contribution (NDC)</b>
          <br />
          <textarea
            value={ndcText}
            onChange={(e) => setNdcText(e.target.value)}
            rows={4}
            style={{ width: '100%', marginTop: 6 }}
          />
        </label>

        <label style={{ display: 'block', marginTop: 20 }}>
          <input
            type="checkbox"
            checked={centralBankOk}
            onChange={(e) => setCentralBankOk(e.target.checked)}
          />{' '}
          3. I confirm this country&apos;s central bank will provide CQE to defend the XCR floor.
        </label>

        <div style={{ marginTop: 20 }}>
          <button
            type="button"
            onClick={() => setShowMouModal(true)}
            style={{
              textDecoration: 'underline',
              background: 'transparent',
              border: 'none',
              color: '#2f6ad9',
              cursor: 'pointer',
            }}
          >
            📄 View Climate Club MOU (draft)
          </button>
          <div style={{ marginTop: 8 }}>
            <label>
              <input
                type="checkbox"
                checked={mouAgreed}
                onChange={(e) => setMouAgreed(e.target.checked)}
                disabled={!mouScrolledToEnd}
              />{' '}
              I have read the MOU and agree to proceed.
              {!mouScrolledToEnd ? (
                <span style={{ color: '#c00', marginLeft: 6, fontSize: 12 }}>
                  (Scroll to the bottom of the MOU first)
                </span>
              ) : null}
            </label>
          </div>
        </div>

        <label style={{ display: 'block', marginTop: 20 }}>
          <input
            type="checkbox"
            checked={wantReset}
            onChange={(e) => setWantReset(e.target.checked)}
          />{' '}
          Start new game (reset global state) before joining
        </label>

        {errorMsg ? <p style={{ color: 'crimson', marginTop: 15 }}>{errorMsg}</p> : null}

        <button
          onClick={attemptJoinClub}
          style={{ marginTop: 25, padding: '10px 16px', fontWeight: 600 }}
        >
          ✅ Join Climate Club
        </button>

        <div style={{ marginTop: 30 }}>
          <h3>Current Climate Club Members</h3>
          {simState.members && simState.members.length > 0 ? (
            <ul>
              {simState.members.map((m) => (
                <li key={m.country}>{m.country}</li>
              ))}
            </ul>
          ) : (
            <p style={{ color: '#888' }}>No members yet.</p>
          )}
        </div>

        {showMouModal ? (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0,0,0,0.35)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 2000,
            }}
          >
            <div
              style={{
                background: '#fff',
                width: 'min(90vw, 700px)',
                maxHeight: '85vh',
                borderRadius: 8,
                boxShadow: '0 10px 30px rgba(0,0,0,0.15)',
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              <div style={{ padding: '14px 18px', borderBottom: '1px solid #eee' }}>
                <h2 style={{ margin: 0, fontSize: 18 }}>Climate Club MOU (Draft)</h2>
              </div>
              <div
                ref={mouRef}
                onScroll={handleMouScroll}
                style={{
                  padding: '14px 18px',
                  overflowY: 'auto',
                  flex: 1,
                  whiteSpace: 'pre-wrap',
                  fontSize: 14,
                  lineHeight: 1.4,
                }}
              >
                {SAMPLE_MOU}
              </div>
              <div
                style={{ padding: '12px 18px', borderTop: '1px solid #eee', textAlign: 'right' }}
              >
                <button onClick={() => setShowMouModal(false)} style={{ marginRight: 8 }}>
                  Close
                </button>
                <button
                  onClick={() => {
                    setMouAgreed(true);
                    setShowMouModal(false);
                  }}
                  disabled={!mouScrolledToEnd}
                  style={{
                    padding: '6px 10px',
                    background: mouScrolledToEnd ? '#2f6ad9' : '#ccc',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 4,
                  }}
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

  if (!xcrSeries.some((point) => point.x === 0)) {
    xcrSeries.unshift({ x: 0, y: 0 });
  }
  if (!mitigationSeries.some((point) => point.x === 0)) {
    mitigationSeries.unshift({ x: 0, y: 0 });
  }

  return (
    <main
      style={{
        fontFamily: 'sans-serif',
        padding: '24px 32px 40px',
        maxWidth: 1040,
        margin: '0 auto',
        display: 'flex',
        flexDirection: 'column',
        gap: 18,
      }}
    >
      <h1>🌍 CEA Simulation</h1>
      <p style={{ color: '#2e6f4e' }}>
        Playing as: <b>{selectedCountry}</b>
      </p>

      <section
        style={{
          ...panelStyle,
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
          }}
        >
          <h3 style={{ margin: 0, fontSize: 16 }}>Climate Club Members</h3>
          <span style={{ fontSize: 12, color: '#5c6570' }}>
            Total: {simState.members ? simState.members.length : 0}
          </span>
        </div>
        {simState.members && simState.members.length > 0 ? (
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 8,
            }}
          >
            {simState.members.map((m) => (
              <span
                key={m.country}
                style={{
                  padding: '4px 8px',
                  borderRadius: 999,
                  background: '#f1f4f8',
                  fontSize: 12,
                }}
              >
                {m.country}
              </span>
            ))}
          </div>
        ) : (
          <p style={{ color: '#888', margin: 0, fontSize: 13 }}>No other members yet.</p>
        )}
      </section>

      {simState.lastEvent ? (
        <section
          style={{
            ...panelStyle,
            borderColor: '#b6ddd1',
            background: '#e9f7f2',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <strong style={{ fontSize: 14 }}>Event this turn:</strong>
          <span style={{ fontSize: 14 }}>{simState.lastEvent.title}</span>
        </section>
      ) : (
        <p style={{ color: '#888', margin: 0 }}>No event yet — click “Next Turn”.</p>
      )}

      {/* project choices */}
      <section
        style={{
          ...panelStyle,
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <h2 style={{ margin: 0, fontSize: 18 }}>Project proposals this turn</h2>
          <span style={{ fontSize: 12, color: '#5c6570' }}>
            Select one to fund or continue without a project.
          </span>
        </div>
        {simState.projects && simState.projects.length > 0 ? (
          simState.projects.map((proj) => {
            const inputId = `project-${proj.id}`;
            const coBenefitsPreview = proj.coBenefits
              ? proj.coBenefits.length > 120
                ? `${proj.coBenefits.slice(0, 120)}…`
                : proj.coBenefits
              : 'No co-benefits listed yet.';
            return (
              <div
                key={proj.id}
                onClick={() => setChosenProjectId(proj.id)}
                style={{
                  border: '1px solid',
                  borderColor: chosenProjectId === proj.id ? '#2f6ad9' : '#d9dfe7',
                  borderRadius: 8,
                  padding: '10px 12px',
                  background: chosenProjectId === proj.id ? '#f3f7ff' : '#fff',
                  cursor: 'pointer',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                  <input
                    type="radio"
                    id={inputId}
                    name="project"
                    value={proj.id}
                    checked={chosenProjectId === proj.id}
                    onChange={() => setChosenProjectId(proj.id)}
                    style={{ marginTop: 4 }}
                  />
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: 8,
                      }}
                    >
                      <label
                        htmlFor={inputId}
                        style={{
                          fontWeight: 600,
                          cursor: 'pointer',
                          fontSize: 15,
                        }}
                      >
                        {proj.name}
                      </label>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          openProjectDetails(proj);
                        }}
                        style={{
                          border: 'none',
                          background: 'transparent',
                          color: '#1f4ed9',
                          textDecoration: 'underline',
                          cursor: 'pointer',
                          fontSize: 12,
                          padding: 0,
                        }}
                      >
                        View details
                      </button>
                    </div>
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                        gap: 8,
                        fontSize: 12,
                        color: '#2f3946',
                      }}
                    >
                      <div>
                        <span style={{ display: 'block', color: '#728097' }}>XCR bid price</span>
                        <strong>
                          {typeof proj.xcrBidPrice === 'number'
                            ? `$${num(proj.xcrBidPrice)}/tCO₂e`
                            : 'Pending'}
                        </strong>
                      </div>
                      <div>
                        <span style={{ display: 'block', color: '#728097' }}>
                          Mitigation offered
                        </span>
                        <strong>
                          {typeof proj.bidMitigationTonnes === 'number'
                            ? `${proj.bidMitigationTonnes.toLocaleString()} tCO₂e`
                            : 'Pending'}
                        </strong>
                      </div>
                      <div>
                        <span style={{ display: 'block', color: '#728097' }}>Baseline potential</span>
                        <strong>
                          {typeof proj.baselineMitigationTonnes === 'number'
                            ? `${proj.baselineMitigationTonnes.toLocaleString()} tCO₂e`
                            : 'Unknown'}
                        </strong>
                      </div>
                    </div>
                    <p style={{ margin: 0, fontSize: 12, color: '#4a5568' }}>
                      <span style={{ fontWeight: 600 }}>Co-benefits:</span> {coBenefitsPreview}
                    </p>
                  </div>
                </div>
              </div>
            );
          })
        ) : (
          <p style={{ color: '#888', margin: 0 }}>No projects loaded yet. Click Next Turn.</p>
        )}
      </section>

      {/* floor decision */}
      <section
        style={{
          ...panelStyle,
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
        }}
      >
        <h2 style={{ margin: 0, fontSize: 18 }}>Floor decision</h2>
        <p style={{ color: '#5a6573', margin: 0, fontSize: 13 }}>
          You can only change the floor every few turns unless the current event justifies it.
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, fontSize: 14 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input
              type="radio"
              name="floor"
              value="hold"
              checked={floorDecision === 'hold'}
              onChange={() => setFloorDecision('hold')}
            />
            Hold
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input
              type="radio"
              name="floor"
              value="raise"
              checked={floorDecision === 'raise'}
              onChange={() => setFloorDecision('raise')}
            />
            Raise
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input
              type="radio"
              name="floor"
              value="lower"
              checked={floorDecision === 'lower'}
              onChange={() => setFloorDecision('lower')}
            />
            Lower
          </label>
        </div>
      </section>

      {/* direct floor setter */}
      <section
        style={{
          ...panelStyle,
          background: '#f7f9fc',
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
        }}
      >
        <h3 style={{ margin: 0, fontSize: 16 }}>Admin: Set XCR Price Floor (no voting)</h3>
        <p style={{ color: '#5a6573', fontSize: 13, margin: 0 }}>
          Manual override for now — in a later version this will be guarded by a voting rule.
        </p>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <label style={{ fontSize: 14 }}>
            New floor ($/t):{' '}
            <input
              type="number"
              value={newFloor}
              onChange={(e) => setNewFloor(e.target.value)}
              style={{ width: 90 }}
              min={10}
            />
          </label>
          <button onClick={setFloorNow} style={{ padding: '6px 12px', fontSize: 13 }}>
            💾 Set floor now
          </button>
          <span style={{ color: '#49525f', fontSize: 13 }}>
            Current floor: <b>${num(simState.floor)}</b>/t
          </span>
        </div>
      </section>

      <section
        style={{
          display: 'grid',
          gap: 16,
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
        }}
      >
        <div style={{ ...panelStyle, display: 'grid', gap: 6, fontSize: 13, color: '#2f3946' }}>
          <h3 style={{ margin: 0, fontSize: 16 }}>Key indicators</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 6 }}>
            <span>
              <strong>Turn</strong>
              <br />
              {simState.turn || 1}
            </span>
            <span>
              <strong>Floor</strong>
              <br />${num(simState.floor)}/t
            </span>
            <span>
              <strong>Market</strong>
              <br />${num(simState.market)}/t
            </span>
            <span>
              <strong>Inflation</strong>
              <br />{num(simState.inflation)}%
            </span>
            <span>
              <strong>Private share</strong>
              <br />
              {typeof simState.privateShare === 'number'
                ? `${(simState.privateShare * 100).toFixed(1)}%`
                : '0.0%'}
            </span>
            <span>
              <strong>CQE purchases</strong>
              <br />{num(simState.cqeBuy)}
            </span>
            <span>
              <strong>Credibility</strong>
              <br />{num(simState.credibility)}
            </span>
            <span>
              <strong>Total mitigation</strong>
              <br />
              {typeof simState.totalMitigation === 'number'
                ? `${(simState.totalMitigation / 1_000_000).toFixed(2)} Mt`
                : '0.00 Mt'}
            </span>
          </div>
        </div>

        <div
          style={{
            ...panelStyle,
            minHeight: 220,
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          <h3 style={{ margin: 0, fontSize: 16 }}>Turn History</h3>
          {simState.history && simState.history.length > 0 ? (
            <ul
              style={{
                margin: 0,
                paddingLeft: 18,
                maxHeight: 200,
                overflowY: 'auto',
                fontSize: 12,
                color: '#2f3946',
              }}
            >
              {simState.history.map((h) => (
                <li key={h.time} style={{ marginBottom: 6 }}>
                  <strong>Turn {h.turn}:</strong> {h.event}{' '}
                  {h.project && h.project !== 'none' ? (
                    <>
                      | proj: {h.projectName || h.project}
                      {typeof h.bidPrice === 'number'
                        ? ` | bid $${num(h.bidPrice)}/t`
                        : ''}
                      {typeof h.mitigation === 'number'
                        ? ` | ${h.mitigation.toLocaleString()} tCO₂e`
                        : ''}{' '}
                    </>
                  ) : (
                    ' | no project selected '
                  )}
                  {h.guidanceBroken ? (
                    <span style={{ color: 'crimson' }}>(guidance broken)</span>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p style={{ color: '#888', fontSize: 13, margin: 0 }}>No turns yet.</p>
          )}
        </div>
      </section>

      <section style={{ ...panelStyle }}>
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

      <button
        onClick={nextTurn}
        style={{ alignSelf: 'flex-start', marginTop: 4, padding: '9px 14px', fontSize: 14 }}
      >
        ▶️ Next Turn
      </button>

      {projectDetail ? (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 2200,
            padding: 16,
          }}
          role="presentation"
          onClick={closeProjectDetails}
        >
          <div
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#fff',
              width: 'min(90vw, 520px)',
              borderRadius: 10,
              boxShadow: '0 16px 40px rgba(15, 23, 42, 0.25)',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <div style={{ padding: '14px 18px', borderBottom: '1px solid #e5e9f0' }}>
              <h2 style={{ margin: 0, fontSize: 18 }}>{projectDetail.name}</h2>
            </div>
            <div
              style={{
                padding: '16px 18px',
                display: 'grid',
                gap: 12,
                fontSize: 13,
                color: '#2f3946',
              }}
            >
              <div>
                <strong>Bid price:</strong>{' '}
                {typeof projectDetail.xcrBidPrice === 'number'
                  ? `$${num(projectDetail.xcrBidPrice)}/tCO₂e`
                  : 'Pending'}
              </div>
              <div>
                <strong>Mitigation offered:</strong>{' '}
                {typeof projectDetail.bidMitigationTonnes === 'number'
                  ? `${projectDetail.bidMitigationTonnes.toLocaleString()} tCO₂e`
                  : 'Pending'}
              </div>
              <div>
                <strong>Baseline potential:</strong>{' '}
                {typeof projectDetail.baselineMitigationTonnes === 'number'
                  ? `${projectDetail.baselineMitigationTonnes.toLocaleString()} tCO₂e`
                  : 'Unknown'}
              </div>
              <div>
                <strong>Supply pressure:</strong>{' '}
                {typeof projectDetail.supplyPressure === 'number'
                  ? `${projectDetail.supplyPressure.toLocaleString()} tCO₂e`
                  : 'Not specified'}
              </div>
              <div>
                <strong>Sentiment effect:</strong>{' '}
                {typeof projectDetail.sentimentEffect === 'number'
                  ? `${(projectDetail.sentimentEffect * 100).toFixed(2)}%`
                  : 'Not specified'}
              </div>
              <div>
                <strong>Co-benefits:</strong>
                <p style={{ margin: '6px 0 0', lineHeight: 1.4 }}>
                  {projectDetail.coBenefits || 'No co-benefits listed yet.'}
                </p>
              </div>
            </div>
            <div
              style={{
                padding: '12px 18px',
                borderTop: '1px solid #e5e9f0',
                display: 'flex',
                justifyContent: 'flex-end',
                gap: 8,
              }}
            >
              <button
                type="button"
                onClick={closeProjectDetails}
                style={{ padding: '6px 12px', fontSize: 13 }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
