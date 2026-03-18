"use client";
import { useState, useCallback } from "react";
import { createClient, createAccount } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { TransactionStatus } from "genlayer-js/types";

const CONTRACT_ADDRESS = "0xeD99D46A13C0A1457497cb51F28eF7626Cea5Eab";

/**
 * FLOW A — Starting a new dispute
 *   home → role_select → create → my_claim → status
 *
 * FLOW B — Responding to existing dispute
 *   home → role_select → [enter ID] → respond_claim → status
 *
 * FLOW C — Coming back later (just have an ID)
 *   home → [enter ID] → status (smart screen detects everything)
 *
 * STATUS SCREEN is the smart hub. It reads the chain and shows:
 *   - "Other party hasn't responded" → reminder + Check Again button
 *   - "Both filed, no verdict yet" → Request Verdict button
 *   - "Verdict exists" → auto-navigates to verdict screen
 */
type Screen =
  | "home"
  | "role_select"
  | "create"
  | "my_claim"
  | "respond_claim"
  | "status"       // Smart hub — replaces share_id, await_other, await_verdict
  | "verdict";

// What the status screen found when it last checked
type DisputeStatus =
  | "idle"              // Haven't checked yet
  | "waiting_other"     // Other party hasn't filed
  | "ready_verdict"     // Both filed, no verdict yet
  | "resolved";         // Verdict exists

type Role = "host" | "guest" | null;

const CURRENCIES = ["NGN", "USD", "GBP", "EUR", "KES", "GHS", "ZAR", "AED"];

interface DisputeState {
  dispute_id: number;
  property_address: string;
  deposit_amount: string;
  landlord_name: string;
  tenant_name: string;
  agreement_terms: string;
  landlord_claim: string;
  landlord_evidence: string;
  tenant_claim: string;
  tenant_evidence: string;
  status: string;
  verdict: string;
  reasoning: string;
  winner: string;
}

function makeClient() {
  const account = createAccount();
  return { client: createClient({ chain: studionet, account }), account };
}

async function writeContract(fn: string, args: (string | number | boolean | bigint)[]): Promise<boolean> {
  try {
    const { client } = makeClient();
    const hash = await client.writeContract({
      address: CONTRACT_ADDRESS as `0x${string}`,
      functionName: fn,
      args,
      value: BigInt(0),
      leaderOnly: true,
    });
    await client.waitForTransactionReceipt({ hash, status: TransactionStatus.ACCEPTED, retries: 60, interval: 3000 });
    return true;
  } catch { return false; }
}

async function readDispute(disputeId: number): Promise<DisputeState | null> {
  try {
    const { client } = makeClient();
    const result = await client.readContract({
      address: CONTRACT_ADDRESS as `0x${string}`,
      functionName: "get_dispute",
      args: [disputeId],
    });
    const raw = result as string;
    if (!raw) return null;
    return JSON.parse(raw) as DisputeState;
  } catch { return null; }
}

async function readDisputeCount(): Promise<number> {
  try {
    const { client } = makeClient();
    const result = await client.readContract({
      address: CONTRACT_ADDRESS as `0x${string}`,
      functionName: "get_dispute_count",
      args: [],
    });
    return Number(result);
  } catch { return 0; }
}

// Determine dispute status from chain data
function getDisputeStatus(state: DisputeState): DisputeStatus {
  if (state.status === "resolved") return "resolved";
  const hostFiled = !!(state.landlord_claim && state.landlord_claim.length > 0);
  const guestFiled = !!(state.tenant_claim && state.tenant_claim.length > 0);
  if (hostFiled && guestFiled) return "ready_verdict";
  return "waiting_other";
}

function Logo({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 56 56" fill="none">
      <circle cx="28" cy="28" r="27" stroke="#c0392b" strokeWidth="1.5" strokeDasharray="4 3" />
      <path d="M14 30 Q14 24 19 22 L22 21 Q24 20.5 24 23 L24 28" stroke="#f5f0e8" strokeWidth="2" strokeLinecap="round" fill="none" />
      <path d="M24 23 L24 19 Q24 17 26 17 Q28 17 28 19 L28 26" stroke="#f5f0e8" strokeWidth="2" strokeLinecap="round" fill="none" />
      <path d="M28 20 L28 17 Q28 15.5 30 15.5 Q32 15.5 32 17 L32 25" stroke="#f5f0e8" strokeWidth="2" strokeLinecap="round" fill="none" />
      <path d="M32 22 L32 19 Q32 17.5 34 17.5 Q36 17.5 36 19 L36 27" stroke="#f5f0e8" strokeWidth="2" strokeLinecap="round" fill="none" />
      <path d="M14 30 Q14 36 18 38 L24 40 Q28 41 32 40 L36 38 Q40 36 40 30 L40 27 Q36 27 32 25 L28 23 Q24 23 24 28 Q20 28 14 30 Z" fill="#c0392b" fillOpacity="0.2" />
      <path d="M14 30 Q14 36 18 38 L24 40 Q28 41 32 40 L36 38 Q40 36 40 30 L40 27 Q36 27 32 25 L28 23 Q24 23 24 28 Q20 28 14 30 Z" stroke="#c0392b" strokeWidth="1.5" fill="none" />
      <circle cx="28" cy="34" r="4" fill="#c0392b" />
      <text x="28" y="36.5" textAnchor="middle" fontSize="5" fill="#f5f0e8" fontWeight="bold">✓</text>
    </svg>
  );
}

export default function Home() {
  const [screen, setScreen] = useState<Screen>("home");
  const [myRole, setMyRole] = useState<Role>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState("");
  const [disputeId, setDisputeId] = useState<number | null>(null);
  const [dispute, setDispute] = useState<DisputeState | null>(null);
  const [disputeStatus, setDisputeStatus] = useState<DisputeStatus>("idle");
  const [statusChecking, setStatusChecking] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [verdictCopied, setVerdictCopied] = useState(false);

  const [propertyAddress, setPropertyAddress] = useState("");
  const [depositAmount, setDepositAmount] = useState("");
  const [currency, setCurrency] = useState("NGN");
  const [hostName, setHostName] = useState("");
  const [guestName, setGuestName] = useState("");
  const [agreementTerms, setAgreementTerms] = useState("");
  const [myClaim, setMyClaim] = useState("");
  const [myEvidence, setMyEvidence] = useState("");
  const [loadId, setLoadId] = useState("");

  const reset = useCallback(() => {
    setScreen("home"); setMyRole(null); setDisputeId(null); setDispute(null);
    setDisputeStatus("idle"); setStatusChecking(false); setError(""); setCopied(false); setVerdictCopied(false);
    setPropertyAddress(""); setDepositAmount(""); setCurrency("NGN");
    setHostName(""); setGuestName(""); setAgreementTerms("");
    setMyClaim(""); setMyEvidence(""); setLoadId("");
  }, []);

  // ── CORE STATUS CHECK — used everywhere ──────────────────────────────────
  // Reads the chain for a dispute ID and updates status state
  // If resolved → navigates to verdict. Otherwise → navigates to status screen.
  const checkStatus = useCallback(async (id: number, navigateToStatus = true) => {
    setStatusChecking(true);
    const state = await readDispute(id);
    if (!state) {
      setStatusChecking(false);
      setDisputeStatus("idle");
      setError("Could not read dispute. Check the ID and try again.");
      return;
    }
    setDispute(state);
    const ds = getDisputeStatus(state);
    setDisputeStatus(ds);
    setStatusChecking(false);
    if (ds === "resolved") {
      setScreen("verdict");
    } else if (navigateToStatus) {
      setScreen("status");
    }
  }, []);

  // ── FLOW A: Create new dispute ────────────────────────────────────────────
  const handleCreateDispute = async () => {
    if (!propertyAddress || !depositAmount || !hostName || !guestName || !agreementTerms) {
      setError("Please fill in all fields"); return;
    }
    setError(""); setLoading(true); setLoadingMsg("Creating dispute on the blockchain...");
    const countBefore = await readDisputeCount();
    const ok = await writeContract("create_dispute", [
      propertyAddress, `${depositAmount} ${currency}`, hostName, guestName, agreementTerms
    ]);
    if (!ok) { setError("Transaction failed. Please try again."); setLoading(false); return; }
    setDisputeId(countBefore + 1);
    setLoading(false);
    setScreen("my_claim");
  };

  const handleMyClaim = async () => {
    if (!myClaim || !myEvidence) { setError("Please fill in both fields"); return; }
    if (!disputeId) return;
    setError(""); setLoading(true); setLoadingMsg("Sealing your claim onchain...");
    const fn = myRole === "host" ? "submit_landlord_claim" : "submit_tenant_claim";
    const ok = await writeContract(fn, [disputeId, myClaim, myEvidence]);
    if (!ok) { setError("Transaction failed. Please try again."); setLoading(false); return; }
    setLoading(false);
    // After filing, go straight to status screen — auto-check
    await checkStatus(disputeId);
  };

  // ── FLOW B: Respond to existing dispute ───────────────────────────────────
  const handleLoadToRespond = async () => {
    if (!myRole) { setError("Please select your role first"); return; }
    const id = parseInt(loadId);
    if (isNaN(id) || id < 1) { setError("Please enter a valid dispute ID"); return; }
    setError(""); setLoading(true); setLoadingMsg("Loading dispute...");
    const state = await readDispute(id);
    setLoading(false);
    if (!state) { setError("Dispute not found. Check the ID and try again."); return; }
    setDisputeId(id); setDispute(state);

    if (state.status === "resolved") { setScreen("verdict"); return; }

    // Has this party already submitted?
    const myClaimFiled = myRole === "host"
      ? !!(state.landlord_claim?.length)
      : !!(state.tenant_claim?.length);

    if (myClaimFiled) {
      // Already filed — go to status to show current state
      const ds = getDisputeStatus(state);
      setDisputeStatus(ds);
      setScreen("status");
    } else {
      setScreen("respond_claim");
    }
  };

  const handleRespondClaim = async () => {
    if (!myClaim || !myEvidence) { setError("Please fill in both fields"); return; }
    if (!disputeId) return;
    setError(""); setLoading(true); setLoadingMsg("Sealing your response onchain...");
    const fn = myRole === "host" ? "submit_landlord_claim" : "submit_tenant_claim";
    const ok = await writeContract(fn, [disputeId, myClaim, myEvidence]);
    if (!ok) { setError("Transaction failed. Please try again."); setLoading(false); return; }
    setLoading(false);
    await checkStatus(disputeId);
  };

  // ── FLOW C: Come back later with just an ID ───────────────────────────────
  const handleHomeLoad = async () => {
    const id = parseInt(loadId);
    if (isNaN(id) || id < 1) { setError("Please enter a valid dispute ID"); return; }
    setError(""); setLoading(true); setLoadingMsg("Loading dispute...");
    setDisputeId(id);
    setLoading(false);
    await checkStatus(id);
  };

  // ── REQUEST VERDICT ───────────────────────────────────────────────────────
  const handleRequestVerdict = async () => {
    if (!disputeId) return;
    setError(""); setLoading(true);
    setLoadingMsg("5 AI validators are reading both sides... this takes 30–60 seconds");
    const ok = await writeContract("request_verdict", [disputeId]);
    if (!ok) { setError("Transaction failed. Please try again."); setLoading(false); return; }
    setLoadingMsg("Reading verdict from chain...");
    const state = await readDispute(disputeId);
    setDispute(state); setLoading(false); setScreen("verdict");
  };

  const copyDisputeId = () => {
    if (disputeId) { navigator.clipboard.writeText(String(disputeId)); setCopied(true); setTimeout(() => setCopied(false), 2000); }
  };

  const copyVerdictLink = () => {
    const txt = `Proof of Handshake — Dispute #${disputeId}\nVerdict: ${dispute?.winner === "tenant" ? "GUEST WINS" : "HOST WINS"}\nRuling: ${dispute?.verdict}\nDispute ID: ${disputeId}\nSite: ${typeof window !== "undefined" ? window.location.origin : ""}`;
    navigator.clipboard.writeText(txt);
    setVerdictCopied(true); setTimeout(() => setVerdictCopied(false), 2500);
  };

  // Derived labels
  const myLabel = myRole === "host" ? "Host" : "Guest";
  const otherLabel = myRole === "host" ? "Guest" : "Host";
  const myTagClass = myRole === "host" ? "poh-host-tag" : "poh-guest-tag";
  const myIcon = myRole === "host" ? "🏠" : "👤";

  // What to show on status screen based on disputeStatus
  // If we don't know role (came back via home load), we show neutral labels
  const knownRole = !!myRole;

  return (
    <main className="poh-main">
      <nav className="poh-nav">
        <div className="poh-nav-inner">
          <div className="poh-logo" onClick={reset}><Logo size={28} /><span className="poh-logo-name">Proof of Handshake</span></div>
          <div className="poh-nav-right">
            {screen !== "home" && <button className="poh-btn-ghost" onClick={reset}>← Home</button>}
            {screen === "home" && <button className="poh-btn-red" onClick={() => setScreen("role_select")}>File a Dispute →</button>}
          </div>
        </div>
      </nav>

      {loading && (
        <div className="poh-overlay">
          <div className="poh-overlay-box">
            <div className="poh-seal-spin"><Logo size={52} /></div>
            <p className="poh-overlay-msg">{loadingMsg}</p>
            <p className="poh-overlay-sub">Do not close this tab</p>
          </div>
        </div>
      )}

      <div className="poh-content">

        {/* ── HOME ── */}
        {screen === "home" && (
          <div className="poh-home">
            <section className="poh-hero">
              <div className="poh-hero-left">
                <div className="poh-stamp"><span className="poh-stamp-dot" /><span className="poh-stamp-text">Live · Bradbury Testnet</span></div>
                <h1 className="poh-h1">Your deposit.<br />Your rights.<br /><span className="poh-red">Proven onchain.</span></h1>
                <p className="poh-hero-p">When your shortlet host refuses to return your caution fee, you deserve more than an argument. You deserve a verdict — transparent, reasoned, and stored permanently on the blockchain.</p>
                <div className="poh-hero-btns">
                  <button className="poh-btn-red" onClick={() => setScreen("role_select")}>File a New Dispute →</button>
                  <button className="poh-btn-outline" onClick={() => setScreen("role_select")}>I Have a Dispute ID</button>
                </div>
              </div>
              <div className="poh-hero-right">
                <div className="poh-seal-wrap">
                  <svg className="poh-seal-ring-svg" viewBox="0 0 260 260">
                    <circle cx="130" cy="130" r="125" fill="none" stroke="#1e1e1e" strokeWidth="1" />
                    <path id="topArc" d="M 20,130 A 110,110 0 0,1 240,130" fill="none" />
                    <path id="botArc" d="M 240,130 A 110,110 0 0,1 20,130" fill="none" />
                    <text fontFamily="monospace" fontSize="9" fill="#2a2a2a" letterSpacing="5"><textPath href="#topArc" startOffset="5%">PROOF · OF · HANDSHAKE · ONCHAIN ARBITRATION ·</textPath></text>
                    <text fontFamily="monospace" fontSize="9" fill="#2a2a2a" letterSpacing="5"><textPath href="#botArc" startOffset="5%">POWERED · BY · GENLAYER · AI CONSENSUS ·</textPath></text>
                  </svg>
                  <div className="poh-seal-center"><Logo size={56} /><span className="poh-seal-label">Verdict sealed</span><span className="poh-seal-status">● Resolved</span></div>
                </div>
              </div>
            </section>

            <div className="poh-stats">
              {[["5","AI Validators"],["~60s","To Verdict"],["100%","Onchain & Transparent"],["$0","Arbitration Fee"]].map(([n,l],i,a) => (
                <div key={l} style={{display:"flex",alignItems:"center",gap:"2rem"}}>
                  <div className="poh-stat"><div className="poh-stat-num">{n}</div><div className="poh-stat-label">{l}</div></div>
                  {i < a.length-1 && <div className="poh-stat-div" />}
                </div>
              ))}
            </div>

            <div className="poh-flow">
              <div className="poh-section-label">The process</div>
              <div className="poh-flow-grid">
                {[
                  {n:"01",icon:"🎭",title:"Choose your role",desc:"Host or Guest — each party files from their own device, independently"},
                  {n:"02",icon:"📋",title:"File & submit your side",desc:"Enter property details and your evidence. A dispute ID is generated."},
                  {n:"03",icon:"📲",title:"Share the ID",desc:"Send the dispute ID to the other party via WhatsApp, SMS, or email"},
                  {n:"04",icon:"⚖️",title:"AI consensus verdict",desc:"5 validators read both sides and reach a majority ruling onchain"},
                ].map(s => (
                  <div key={s.n} className="poh-flow-step">
                    <div className="poh-flow-num">{s.n} —</div>
                    <div className="poh-flow-icon">{s.icon}</div>
                    <div className="poh-flow-title">{s.title}</div>
                    <div className="poh-flow-desc">{s.desc}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="poh-sample">
              <div className="poh-section-label">Live verdict example</div>
              <div className="poh-verdict-box">
                <div className="poh-verdict-hdr">
                  <span className="poh-verdict-id">Dispute #1 · 12 Adewale Street Lagos · 150,000 NGN</span>
                  <span className="poh-win-badge">✓ GUEST WINS</span>
                </div>
                <div className="poh-verdict-body">
                  <p className="poh-verdict-quote">&ldquo;The guest&apos;s move-in inspection report and messages prove the AC was faulty prior to check-in, negating the host&apos;s repair invoice. The guest provided photographic proof of the apartment&apos;s cleanliness upon departure.&rdquo;</p>
                  <div className="poh-chips">{["GPT-5.1 ✓","Grok-4 ✓","Qwen3-235b ✓","Claude Sonnet ✓","Majority Agree ✓"].map(c=><span key={c} className="poh-chip-agree">{c}</span>)}</div>
                </div>
              </div>
            </div>

            <div className="poh-load-box">
              <p className="poh-load-label">Have a dispute ID? Check status or load verdict →</p>
              <div className="poh-load-row">
                <input className="poh-input" placeholder="Enter dispute ID e.g. 3" value={loadId} onChange={e=>{setLoadId(e.target.value); setError("");}} />
                <button className="poh-btn-red" onClick={handleHomeLoad}>Check →</button>
              </div>
              {error && <p className="poh-error">{error}</p>}
            </div>
          </div>
        )}

        {/* ── ROLE SELECT ── */}
        {screen === "role_select" && (
          <div className="poh-form-wrap">
            <div className="poh-form-hdr">
              <div className="poh-step-tag">Before we begin</div>
              <h2 className="poh-form-title">Who are you?</h2>
              <p className="poh-form-sub">Select your role, then choose your path below.</p>
            </div>

            <div className="poh-role-grid">
              <button className={`poh-role-card poh-role-host ${myRole === "host" ? "poh-role-active-host" : ""}`} onClick={() => { setMyRole("host"); setError(""); }}>
                <span className="poh-role-icon">🏠</span>
                <span className="poh-role-title">I am the Host</span>
                <span className="poh-role-desc">I own or manage the property</span>
                {myRole === "host" && <span className="poh-role-check">✓ Selected</span>}
              </button>
              <button className={`poh-role-card poh-role-guest ${myRole === "guest" ? "poh-role-active-guest" : ""}`} onClick={() => { setMyRole("guest"); setError(""); }}>
                <span className="poh-role-icon">👤</span>
                <span className="poh-role-title">I am the Guest</span>
                <span className="poh-role-desc">I stayed at the property</span>
                {myRole === "guest" && <span className="poh-role-check">✓ Selected</span>}
              </button>
            </div>

            {error && <p className="poh-error" style={{marginBottom:"1rem"}}>{error}</p>}

            <div className="poh-two-paths">
              <div className="poh-path-card">
                <div className="poh-path-label">Starting the dispute</div>
                <p className="poh-path-desc">The other party hasn&apos;t filed yet. You go first — a dispute ID will be created.</p>
                <button className="poh-btn-red poh-btn-full" onClick={() => {
                  if (!myRole) { setError("Please select your role first"); return; }
                  setError(""); setScreen("create");
                }}>Start New Dispute →</button>
              </div>
              <div className="poh-path-divider"><span>or</span></div>
              <div className="poh-path-card">
                <div className="poh-path-label">Responding to a dispute</div>
                <p className="poh-path-desc">The other party already filed. Enter the ID they sent you.</p>
                <div style={{marginBottom:"0.75rem"}}>
                  <input className="poh-input" placeholder="Enter dispute ID e.g. 5" value={loadId} onChange={e=>{setLoadId(e.target.value); setError("");}} />
                </div>
                <button className="poh-btn-outline poh-btn-full" onClick={handleLoadToRespond}>Load &amp; Respond →</button>
              </div>
            </div>
          </div>
        )}

        {/* ── CREATE (Flow A Step 1) ── */}
        {screen === "create" && (
          <div className="poh-form-wrap">
            <div className="poh-form-hdr">
              <div className="poh-step-tag">Step 1 of 2 · Filing as {myLabel}</div>
              <h2 className="poh-form-title">File the Dispute</h2>
              <p className="poh-form-sub">Enter the property and agreement details. Both parties will see this.</p>
            </div>
            <div className="poh-card">
              <div className="poh-field">
                <label>Property Address</label>
                <input className="poh-input" placeholder="e.g. 12 Adewale Street, Lekki, Lagos" value={propertyAddress} onChange={e=>setPropertyAddress(e.target.value)} />
              </div>
              <div className="poh-field">
                <label>Caution Fee / Deposit Amount</label>
                <div className="poh-amount-row">
                  <select className="poh-currency-select" value={currency} onChange={e=>setCurrency(e.target.value)}>
                    {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <input className="poh-input poh-amount-input" placeholder="e.g. 150,000" value={depositAmount} onChange={e=>setDepositAmount(e.target.value)} />
                </div>
              </div>
              <div className="poh-field-row">
                <div className="poh-field"><label>Host Name</label><input className="poh-input" placeholder="e.g. Mr Bello" value={hostName} onChange={e=>setHostName(e.target.value)} /></div>
                <div className="poh-field"><label>Guest Name</label><input className="poh-input" placeholder="e.g. Miss Tunde" value={guestName} onChange={e=>setGuestName(e.target.value)} /></div>
              </div>
              <div className="poh-field">
                <label>Original Agreement Terms</label>
                <textarea className="poh-textarea" placeholder="Describe the original shortlet terms — what the caution fee covers, conditions for refund, check-in/check-out rules, etc." value={agreementTerms} onChange={e=>setAgreementTerms(e.target.value)} rows={4} />
              </div>
              {error && <p className="poh-error">{error}</p>}
              <button className="poh-btn-red poh-btn-full" onClick={handleCreateDispute}>Create Dispute & Continue →</button>
            </div>
          </div>
        )}

        {/* ── MY CLAIM (Flow A Step 2) ── */}
        {screen === "my_claim" && (
          <div className="poh-form-wrap">
            <div className="poh-form-hdr">
              <div className="poh-step-tag">Step 2 of 2 · Your Evidence</div>
              <h2 className="poh-form-title">{myLabel}&apos;s Claim</h2>
              <p className="poh-form-sub">Dispute <strong className="poh-id-badge">#{disputeId}</strong> is live. Submit your side now.</p>
            </div>
            <div className="poh-card">
              <div className={`poh-party-tag ${myTagClass}`}>{myIcon} {myLabel}&apos;s Side</div>
              <div className="poh-field">
                <label>Your Claim</label>
                <textarea className="poh-textarea"
                  placeholder={myRole === "host"
                    ? "Describe why you are withholding the caution fee. Be specific about what damage or rule violation occurred."
                    : "Describe why the caution fee should be refunded. Explain your stay and checkout condition."}
                  value={myClaim} onChange={e=>setMyClaim(e.target.value)} rows={4} />
              </div>
              <div className="poh-field">
                <label>Your Evidence</label>
                <textarea className="poh-textarea"
                  placeholder={myRole === "host"
                    ? "List your evidence — damage photos, repair invoices, inspection reports, WhatsApp messages, etc."
                    : "List your evidence — check-in photos, messages from host, receipts, WhatsApp screenshots, etc."}
                  value={myEvidence} onChange={e=>setMyEvidence(e.target.value)} rows={4} />
              </div>
              {error && <p className="poh-error">{error}</p>}
              <button className="poh-btn-red poh-btn-full" onClick={handleMyClaim}>Seal My Claim →</button>
            </div>
          </div>
        )}

        {/* ── RESPOND CLAIM (Flow B) ── */}
        {screen === "respond_claim" && dispute && (
          <div className="poh-form-wrap">
            <div className="poh-form-hdr">
              <div className="poh-step-tag">Responding to Dispute #{disputeId} · As {myLabel}</div>
              <h2 className="poh-form-title">Submit Your Side</h2>
              <p className="poh-form-sub">Review the dispute details below, then tell your side of the story.</p>
            </div>
            <div className="poh-card">
              <div className="poh-dispute-context">
                <div className="poh-context-label">Dispute Details</div>
                <div className="poh-details-grid">
                  <span className="poh-dl">Property</span><span className="poh-dv">{dispute.property_address}</span>
                  <span className="poh-dl">Amount</span><span className="poh-dv">{dispute.deposit_amount}</span>
                  <span className="poh-dl">Host</span><span className="poh-dv">{dispute.landlord_name}</span>
                  <span className="poh-dl">Guest</span><span className="poh-dv">{dispute.tenant_name}</span>
                </div>
                <div style={{marginTop:"1rem", borderTop:"1px solid var(--ink4)", paddingTop:"1rem"}}>
                  <div className="poh-dl" style={{marginBottom:"0.4rem"}}>Original Agreement Terms</div>
                  <p style={{fontSize:"0.83rem", color:"var(--muted2)", lineHeight:"1.65"}}>{dispute.agreement_terms}</p>
                </div>
              </div>
              <div className={`poh-party-tag ${myTagClass}`}>{myIcon} Your Response ({myLabel})</div>
              <div className="poh-field">
                <label>Your Claim</label>
                <textarea className="poh-textarea"
                  placeholder={myRole === "guest"
                    ? "Describe why the caution fee should be refunded. Be specific about your stay and checkout condition."
                    : "Describe why you are withholding the caution fee. Be specific about damage or rule violations."}
                  value={myClaim} onChange={e=>setMyClaim(e.target.value)} rows={4} />
              </div>
              <div className="poh-field">
                <label>Your Evidence</label>
                <textarea className="poh-textarea"
                  placeholder={myRole === "guest"
                    ? "List your evidence — check-in photos, messages from host, receipts, WhatsApp screenshots, etc."
                    : "List your evidence — damage photos, repair invoices, inspection reports, messages, etc."}
                  value={myEvidence} onChange={e=>setMyEvidence(e.target.value)} rows={4} />
              </div>
              {error && <p className="poh-error">{error}</p>}
              <button className="poh-btn-red poh-btn-full" onClick={handleRespondClaim}>Submit My Response →</button>
            </div>
          </div>
        )}

        {/* ── STATUS SCREEN — the smart hub ── */}
        {screen === "status" && (
          <div className="poh-form-wrap">

            {/* WAITING: other party hasn't filed yet */}
            {disputeStatus === "waiting_other" && (
              <>
                <div className="poh-form-hdr">
                  <div className="poh-step-tag">Dispute #{disputeId} · Waiting</div>
                  <h2 className="poh-form-title">Your claim is sealed ✓</h2>
                  <p className="poh-form-sub">
                    {knownRole
                      ? `The ${otherLabel} hasn't responded yet. Share the ID below.`
                      : "The other party hasn't responded yet."}
                  </p>
                </div>
                <div className="poh-card">
                  {/* ID share block */}
                  <div className="poh-share-id-block">
                    <p className="poh-share-label">Dispute ID{knownRole ? ` — share with the ${otherLabel}` : ""}:</p>
                    <div className="poh-share-id-row">
                      <div className="poh-share-id-num">#{disputeId}</div>
                      <button className="poh-btn-outline" onClick={copyDisputeId}>{copied ? "✓ Copied!" : "Copy ID"}</button>
                    </div>
                  </div>

                  {knownRole && (
                    <div className="poh-instructions-block">
                      <p className="poh-instructions-label">Tell the {otherLabel} to:</p>
                      <ol className="poh-instructions-list">
                        <li>Go to this website</li>
                        <li>Click &ldquo;File a Dispute&rdquo; → select <strong>&ldquo;I am the {otherLabel}&rdquo;</strong></li>
                        <li>Enter ID <strong className="poh-id-badge">#{disputeId}</strong> and click &ldquo;Load &amp; Respond&rdquo;</li>
                        <li>Submit their side of the story</li>
                      </ol>
                    </div>
                  )}

                  <div className="poh-share-note">
                    <span className="poh-share-note-icon">💬</span>
                    <span>Send via WhatsApp, SMS, or email. They only need the ID number.</span>
                  </div>

                  <div className="poh-status-check-block">
                    <p className="poh-status-check-label">Once they&apos;ve responded, press this to check:</p>
                    <button
                      className="poh-btn-red poh-btn-full"
                      disabled={statusChecking}
                      onClick={async () => { if (disputeId) await checkStatus(disputeId); }}
                    >
                      {statusChecking ? "Checking..." : `Check if ${knownRole ? otherLabel : "Other Party"} Has Responded →`}
                    </button>
                  </div>
                  {error && <p className="poh-error">{error}</p>}
                </div>
              </>
            )}

            {/* READY: both filed, verdict not yet requested */}
            {disputeStatus === "ready_verdict" && (
              <>
                <div className="poh-form-hdr">
                  <div className="poh-step-tag">Dispute #{disputeId} · Both Sides Filed</div>
                  <h2 className="poh-form-title">Ready for Verdict ⚖️</h2>
                  <p className="poh-form-sub">Both claims are sealed onchain. Either party can now summon the judges.</p>
                </div>
                <div className="poh-card">
                  <div className="poh-ready-banner">
                    <span className="poh-ready-icon">✅</span>
                    <div>
                      <div className="poh-ready-title">Both sides have filed their claims</div>
                      <div className="poh-ready-sub">The AI judges are standing by. This takes 30–60 seconds once requested.</div>
                    </div>
                  </div>
                  <div className="poh-validators-block">
                    <p className="poh-validators-label">5 AI validators will evaluate independently:</p>
                    <div className="poh-chips">
                      {["GPT-5.1","Grok-4","Qwen3-235b","Claude Sonnet","+ more"].map(c=><span key={c} className="poh-chip">{c}</span>)}
                    </div>
                    <p className="poh-pending-note">Each validator reads both sides and issues a verdict. Majority ruling is sealed permanently onchain.</p>
                  </div>
                  {error && <p className="poh-error">{error}</p>}
                  <button className="poh-btn-red poh-btn-full poh-btn-gavel" onClick={handleRequestVerdict}>⚖️ Request AI Verdict</button>
                </div>
              </>
            )}

          </div>
        )}

        {/* ── VERDICT ── */}
        {screen === "verdict" && dispute && (
          <div className="poh-verdict-screen">
            <div className={`poh-verdict-banner ${dispute.winner==="tenant"?"poh-guest-wins":"poh-host-wins"}`}>
              <div className="poh-verdict-seal"><Logo size={52} /></div>
              <div className="poh-verdict-winner">{dispute.winner==="tenant"?"Guest Wins":"Host Wins"}</div>
              <div className="poh-verdict-deposit">
                {dispute.winner==="tenant"
                  ? `Caution fee of ${dispute.deposit_amount} should be refunded to the guest`
                  : `Host may retain caution fee of ${dispute.deposit_amount}`}
              </div>
            </div>
            <div className="poh-verdict-cards">
              <div className="poh-vcard"><h3>📋 Ruling</h3><p>{dispute.verdict}</p></div>
              <div className="poh-vcard"><h3>🧠 AI Reasoning</h3><p className="poh-verdict-quote-sm">&ldquo;{dispute.reasoning}&rdquo;</p></div>
              <div className="poh-vcard">
                <h3>📁 Dispute Details</h3>
                <div className="poh-details-grid">
                  <span className="poh-dl">Property</span><span className="poh-dv">{dispute.property_address}</span>
                  <span className="poh-dl">Caution Fee</span><span className="poh-dv">{dispute.deposit_amount}</span>
                  <span className="poh-dl">Host</span><span className="poh-dv">{dispute.landlord_name}</span>
                  <span className="poh-dl">Guest</span><span className="poh-dv">{dispute.tenant_name}</span>
                  <span className="poh-dl">Dispute ID</span><span className="poh-dv poh-id-badge">#{dispute.dispute_id}</span>
                  <span className="poh-dl">Status</span><span className="poh-dv poh-resolved">✅ Resolved Onchain</span>
                </div>
              </div>
              <div className="poh-vcard poh-consensus-card">
                <h3>🔗 Onchain Consensus</h3>
                <p>This verdict was reached by 5 independent AI validators on GenLayer&apos;s Bradbury testnet — transparent, auditable, and tamper-proof.</p>
                <div className="poh-chips" style={{marginTop:"1rem"}}>
                  {["GPT-5.1 ✓","Grok-4 ✓","Qwen3-235b ✓","Claude Sonnet ✓","Majority Agree ✓"].map(c=><span key={c} className="poh-chip-agree">{c}</span>)}
                </div>
                <div className="poh-contract-ref">Contract: <span className="poh-mono">{CONTRACT_ADDRESS.slice(0,10)}...{CONTRACT_ADDRESS.slice(-6)}</span></div>
              </div>
              <div className="poh-vcard poh-share-verdict-card">
                <h3>📤 Share This Verdict</h3>
                <p style={{fontSize:"0.82rem", color:"var(--muted2)", marginBottom:"1rem"}}>Both parties can view this result using Dispute ID <strong className="poh-id-badge">#{dispute.dispute_id}</strong>.</p>
                <div style={{display:"flex", gap:"0.75rem", flexWrap:"wrap"}}>
                  <button className="poh-btn-outline" onClick={copyVerdictLink}>{verdictCopied ? "✓ Copied!" : "📋 Copy verdict summary"}</button>
                  <button className="poh-btn-ghost" onClick={() => window.print()}>🖨️ Print / Save as PDF</button>
                </div>
              </div>
            </div>
            <button className="poh-btn-red" onClick={reset}>File Another Dispute →</button>
          </div>
        )}

      </div>

      <footer className="poh-footer">
        <div className="poh-footer-logo"><Logo size={18} /><span className="poh-footer-name">Proof of Handshake</span></div>
        <p className="poh-footer-right">Built on GenLayer · Onchain Justice Track · Bradbury Builders Hackathon 2025</p>
      </footer>
    </main>
  );
}
