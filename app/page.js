'use client';
import { useState, useEffect, useRef } from 'react';
import styles from './page.module.css';

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

function num(v, digits = 2) {
  if (typeof v === 'number' && !Number.isNaN(v)) return v.toFixed(digits);
  return (0).toFixed(digits);
}

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
    <div className={styles.chartWrapper}>
      {title ? <h3 className={styles.sectionTitle}>{title}</h3> : null}
      <svg
        className={styles.chartSvg}
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="xMidYMid meet"
      >
        <line x1={padding} y1={height - padding} x2={width - padding / 4} y2={height - padding} stroke="#d0d5dd" />
        <line x1={padding} y1={height - padding} x2={padding} y2={padding / 2} stroke="#d0d5dd" />
        <text x={8} y={yScale(maxY)} className={styles.chartAxisLabel}>
          {maxY.toFixed(1)}
        </text>
        <text x={8} y={yScale(minY)} className={styles.chartAxisLabel}>
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
                <circle key={`${s.name}-${i}`} cx={xScale(p.x)} cy={yScale(p.y)} r={2.6} fill={s.color} />
              ))}
            </g>
          );
        })}
      </svg>
      <div className={styles.chartLegend}>
        {series.map((s) => (
          <div key={s.name} className={styles.legendItem}>
            <span style={{ background: s.color }} />
            <span>{s.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

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
  const [newFloor, setNewFloor] = useState(80);
  const [wantReset, setWantReset] = useState(false);
  const [showMouModal, setShowMouModal] = useState(false);
  const [mouScrolledToEnd, setMouScrolledToEnd] = useState(false);
  const [mouAgreed, setMouAgreed] = useState(false);
  const mouRef = useRef(null);

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

    let nextFloorValue;
    setSimState((prev) => {
      nextFloorValue = typeof data.floor === 'number' ? data.floor : prev.floor;

      return {
        ...prev,
        ...data,
        floor: nextFloorValue,
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
      };
    });
    if (typeof nextFloorValue === 'number') {
      setNewFloor(nextFloorValue);
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
      setNewFloor(data.floor);
    }
  }

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

  if (!inClimateClub) {
    return (
      <main className={`${styles.page} ${styles.onboardingLayout}`}>
        <section className={styles.card}>
          <h1 className={styles.pageTitle}>🌍 Join the Climate Club</h1>
          <p className={styles.leadText}>
            Choose your country, confirm CQE participation, and review the draft MOU to begin.
            (ChatGPT can make mistakes — please validate the MOU text against the actual paper.)
          </p>

          <div className={styles.formControl}>
            <label htmlFor="country" className={styles.formLabel}>
              1. Select your country
            </label>
            <select
              id="country"
              value={selectedCountry}
              onChange={handleCountryChange}
              className={styles.select}
            >
              {COUNTRY_OPTIONS.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.formControl}>
            <label htmlFor="ndc" className={styles.formLabel}>
              2. Nationally Determined Contribution (NDC)
            </label>
            <textarea
              id="ndc"
              value={ndcText}
              onChange={(e) => setNdcText(e.target.value)}
              rows={4}
              className={styles.textarea}
            />
          </div>

          <label className={`${styles.checkboxRow} ${styles.formControl}`}>
            <input
              type="checkbox"
              checked={centralBankOk}
              onChange={(e) => setCentralBankOk(e.target.checked)}
            />
            <span>I confirm this country&apos;s central bank will provide CQE to defend the XCR floor.</span>
          </label>

          <div className={styles.formControl}>
            <button
              type="button"
              onClick={() => setShowMouModal(true)}
              className={`${styles.button} ${styles.ghostButton}`}
            >
              📄 View Climate Club MOU (draft)
            </button>
            <label className={styles.checkboxRow}>
              <input
                type="checkbox"
                checked={mouAgreed}
                onChange={(e) => setMouAgreed(e.target.checked)}
                disabled={!mouScrolledToEnd}
              />
              <span>
                I have read the MOU and agree to proceed.
                {!mouScrolledToEnd ? (
                  <span className={styles.helperText}>(Scroll to the bottom of the MOU first)</span>
                ) : null}
              </span>
            </label>
          </div>

          <label className={`${styles.checkboxRow} ${styles.formControl}`}>
            <input
              type="checkbox"
              checked={wantReset}
              onChange={(e) => setWantReset(e.target.checked)}
            />
            <span>Start new game (reset global state) before joining</span>
          </label>

          {errorMsg ? <p className={styles.errorText}>{errorMsg}</p> : null}

          <button onClick={attemptJoinClub} className={`${styles.button} ${styles.primaryButton}`}>
            ✅ Join Climate Club
          </button>

          <div className={styles.membersCard}>
            <h3 className={styles.sectionTitle}>Current Climate Club Members</h3>
            {simState.members && simState.members.length > 0 ? (
              <div className={styles.membersList}>
                {simState.members.map((m) => (
                  <span key={m.country} className={styles.memberPill}>
                    {m.country}
                  </span>
                ))}
              </div>
            ) : (
              <p className={styles.mutedText}>No members yet.</p>
            )}
          </div>
        </section>

        {showMouModal ? (
          <div className={styles.modalOverlay}>
            <div className={styles.modal}>
              <div className={styles.modalHeader}>
                <h2>Climate Club MOU (Draft)</h2>
              </div>
              <div ref={mouRef} onScroll={handleMouScroll} className={styles.modalBody}>
                {SAMPLE_MOU}
              </div>
              <div className={styles.modalFooter}>
                <button
                  type="button"
                  onClick={() => setShowMouModal(false)}
                  className={`${styles.button} ${styles.secondaryButton}`}
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMouAgreed(true);
                    setShowMouModal(false);
                  }}
                  disabled={!mouScrolledToEnd}
                  className={`${styles.button} ${styles.primaryButton}`}
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

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.pageTitle}>🌍 CEA Simulation</h1>
          <p className={styles.subtitle}>
            Playing as: <strong>{selectedCountry}</strong>
          </p>
        </div>
        <div className={styles.headerActions}>
          <div className={styles.tag}>Members: {simState.members?.length || 0}</div>
          <button onClick={nextTurn} className={`${styles.button} ${styles.primaryButton}`}>
            ▶️ Next Turn
          </button>
        </div>
      </header>

      <section className={styles.grid}>
        <article className={styles.card}>
          <h2 className={styles.sectionTitle}>Climate Club Members</h2>
          {simState.members && simState.members.length > 0 ? (
            <div className={styles.membersList}>
              {simState.members.map((m) => (
                <span key={m.country} className={styles.memberPill}>
                  {m.country}
                </span>
              ))}
            </div>
          ) : (
            <p className={styles.mutedText}>No other members yet.</p>
          )}
        </article>

        <article className={styles.card}>
          <h2 className={styles.sectionTitle}>Turn event</h2>
          {simState.lastEvent ? (
            <div className={styles.eventCard}>
              <strong>{simState.lastEvent.title}</strong>
              {simState.lastEvent.description ? (
                <p>{simState.lastEvent.description}</p>
              ) : null}
            </div>
          ) : (
            <p className={styles.mutedText}>No event yet — click “Next Turn”.</p>
          )}
        </article>
      </section>

      <section className={styles.grid}>
        <article className={`${styles.card} ${styles.fullWidth}`}>
          <h2 className={styles.sectionTitle}>Project proposals this turn</h2>
          {simState.projects && simState.projects.length > 0 ? (
            <div className={styles.optionList}>
              {simState.projects.map((proj) => (
                <label
                  key={proj.id}
                  className={`${styles.optionCard} ${
                    chosenProjectId === proj.id ? styles.optionCardActive : ''
                  }`}
                >
                  <input
                    type="radio"
                    name="project"
                    value={proj.id}
                    checked={chosenProjectId === proj.id}
                    onChange={() => setChosenProjectId(proj.id)}
                  />
                  <div>
                    <p className={styles.optionTitle}>{proj.name}</p>
                    {proj.description ? (
                      <p className={styles.optionDescription}>{proj.description}</p>
                    ) : null}
                  </div>
                </label>
              ))}
            </div>
          ) : (
            <p className={styles.mutedText}>No projects loaded yet. Click Next Turn.</p>
          )}
        </article>
      </section>

      <section className={styles.grid}>
        <article className={styles.card}>
          <h2 className={styles.sectionTitle}>Floor decision</h2>
          <p className={styles.mutedText}>
            You can only change the floor every few turns unless the event justifies it.
          </p>
          <div className={styles.radioGroup}>
            <label className={styles.radioOption}>
              <input
                type="radio"
                name="floor"
                value="hold"
                checked={floorDecision === 'hold'}
                onChange={() => setFloorDecision('hold')}
              />
              Hold
            </label>
            <label className={styles.radioOption}>
              <input
                type="radio"
                name="floor"
                value="raise"
                checked={floorDecision === 'raise'}
                onChange={() => setFloorDecision('raise')}
              />
              Raise
            </label>
            <label className={styles.radioOption}>
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

          <div className={styles.adminControls}>
            <div>
              <h3>Admin: Set XCR Price Floor (no voting)</h3>
              <p className={styles.helperText}>
                For now, whichever user sets the floor wins. Later this can be guarded by a voting rule.
              </p>
            </div>
            <div className={styles.adminInputs}>
              <label className={styles.inlineField}>
                <span>New floor ($/t)</span>
                <input
                  type="number"
                  value={newFloor}
                  onChange={(e) => setNewFloor(e.target.value)}
                  min={10}
                />
              </label>
              <button onClick={setFloorNow} className={`${styles.button} ${styles.secondaryButton}`}>
                💾 Set floor now
              </button>
            </div>
            <p className={styles.currentFloorText}>
              Current floor: <strong>${num(simState.floor)}</strong>/t
            </p>
          </div>
        </article>

        <article className={styles.card}>
          <h2 className={styles.sectionTitle}>Key indicators</h2>
          <div className={styles.statsGrid}>
            <div className={styles.statItem}>
              <span className={styles.statLabel}>Turn</span>
              <span className={styles.statValue}>{simState.turn || 1}</span>
            </div>
            <div className={styles.statItem}>
              <span className={styles.statLabel}>Floor</span>
              <span className={styles.statValue}>${num(simState.floor)}/t</span>
            </div>
            <div className={styles.statItem}>
              <span className={styles.statLabel}>Market</span>
              <span className={styles.statValue}>${num(simState.market)}/t</span>
            </div>
            <div className={styles.statItem}>
              <span className={styles.statLabel}>Inflation</span>
              <span className={styles.statValue}>{num(simState.inflation)}%</span>
            </div>
            <div className={styles.statItem}>
              <span className={styles.statLabel}>Private capital share</span>
              <span className={styles.statValue}>
                {typeof simState.privateShare === 'number'
                  ? `${(simState.privateShare * 100).toFixed(1)}%`
                  : '0.0%'}
              </span>
            </div>
            <div className={styles.statItem}>
              <span className={styles.statLabel}>CQE purchases</span>
              <span className={styles.statValue}>{num(simState.cqeBuy)}</span>
            </div>
            <div className={styles.statItem}>
              <span className={styles.statLabel}>Credibility</span>
              <span className={styles.statValue}>{num(simState.credibility)}</span>
            </div>
            <div className={styles.statItem}>
              <span className={styles.statLabel}>Total mitigation</span>
              <span className={styles.statValue}>
                {typeof simState.totalMitigation === 'number'
                  ? `${(simState.totalMitigation / 1_000_000).toFixed(2)} MtCO₂e`
                  : '0.00 MtCO₂e'}
              </span>
            </div>
          </div>
        </article>
      </section>

      <section className={styles.grid}>
        <article className={styles.card}>
          <h2 className={styles.sectionTitle}>Turn history</h2>
          {simState.history && simState.history.length > 0 ? (
            <ul className={styles.historyList}>
              {simState.history.map((h) => (
                <li key={h.time || h.turn}>
                  <strong>Turn {h.turn}:</strong> {h.event} | proj: {h.project}{' '}
                  {h.guidanceBroken ? <span className={styles.warningText}>(guidance broken)</span> : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className={styles.mutedText}>No turns yet.</p>
          )}
        </article>
      </section>

      <section className={`${styles.card} ${styles.chartCard}`}>
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
