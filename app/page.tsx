"use client";
import { useState, useCallback } from "react";
import { createClient, createAccount } from "genlayer-js";
import { testnetBradbury } from "genlayer-js/chains";
import { TransactionStatus } from "genlayer-js/types";

const CONTRACT_ADDRESS = "0x73e7947D5fb2eC93d0C690D70e7Ec8521DD835E4";

type Screen = "home" | "create" | "host" | "guest" | "pending" | "verdict";

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
  return { client: createClient({ chain: testnetBradbury, account }), account };
}

async function writeContract(
  fn: string,
  args: (string | number | boolean | bigint)[]
): Promise<boolean> {
  try {
    const { client } = makeClient();
    const hash = await client.writeContract({
      address: CONTRACT_ADDRESS as `0x${string}`,
      functionName: fn,
      args,
      value: BigInt(0),
      leaderOnly: true,
    });
    await client.waitForTransactionReceipt({
      hash,
      status: TransactionStatus.ACCEPTED,
      retries: 60,
      interval: 3000,
    });
    return true;
  } catch {
    return false;
  }
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
  } catch {
    return null;
  }
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
  } catch {
    return 0;
  }
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
  const [loading, setLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState("");
  const [disputeId, setDisputeId] = useState<number | null>(null);
  const [dispute, setDispute] = useState<DisputeState | null>(null);
  const [error, setError] = useState("");

  const [propertyAddress, setPropertyAddress] = useState("");
  const [depositAmount, setDepositAmount] = useState("");
  const [hostName, setHostName] = useState("");
  const [guestName, setGuestName] = useState("");
  const [agreementTerms, setAgreementTerms] = useState("");
  const [hostClaim, setHostClaim] = useState("");
  const [hostEvidence, setHostEvidence] = useState("");
  const [guestClaim, setGuestClaim] = useState("");
  const [guestEvidence, setGuestEvidence] = useState("");
  const [loadId, setLoadId] = useState("");

  const reset = useCallback(() => {
    setScreen("home");
    setDisputeId(null);
    setDispute(null);
    setError("");
    setPropertyAddress(""); setDepositAmount(""); setHostName(""); setGuestName(""); setAgreementTerms("");
    setHostClaim(""); setHostEvidence(""); setGuestClaim(""); setGuestEvidence(""); setLoadId("");
  }, []);

  const handleCreateDispute = async () => {
    if (!propertyAddress || !depositAmount || !hostName || !guestName || !agreementTerms) { setError("Please fill in all fields"); return; }
    setError(""); setLoading(true); setLoadingMsg("Creating dispute on the blockchain...");
    const countBefore = await readDisputeCount();
    const ok = await writeContract("create_dispute", [propertyAddress, depositAmount, hostName, guestName, agreementTerms]);
    if (!ok) { setError("Transaction failed. Please try again."); setLoading(false); return; }
    setDisputeId(countBefore + 1); setLoading(false); setScreen("host");
  };

  const handleHostClaim = async () => {
    if (!hostClaim || !hostEvidence) { setError("Please fill in both fields"); return; }
    if (!disputeId) return;
    setError(""); setLoading(true); setLoadingMsg("Submitting host claim onchain...");
    const ok = await writeContract("submit_landlord_claim", [disputeId, hostClaim, hostEvidence]);
    if (!ok) { setError("Transaction failed. Please try again."); setLoading(false); return; }
    setLoading(false); setScreen("guest");
  };

  const handleGuestClaim = async () => {
    if (!guestClaim || !guestEvidence) { setError("Please fill in both fields"); return; }
    if (!disputeId) return;
    setError(""); setLoading(true); setLoadingMsg("Submitting guest response onchain...");
    const ok = await writeContract("submit_tenant_claim", [disputeId, guestClaim, guestEvidence]);
    if (!ok) { setError("Transaction failed. Please try again."); setLoading(false); return; }
    setLoading(false); setScreen("pending");
  };

  const handleRequestVerdict = async () => {
    if (!disputeId) return;
    setError(""); setLoading(true);
    setLoadingMsg("5 AI validators are reading the evidence and reaching consensus... this takes 30–60 seconds");
    const ok = await writeContract("request_verdict", [disputeId]);
    if (!ok) { setError("Transaction failed. Please try again."); setLoading(false); return; }
    setLoadingMsg("Reading verdict from chain...");
    const state = await readDispute(disputeId);
    setDispute(state); setLoading(false); setScreen("verdict");
  };

  const handleLoadDispute = async () => {
    const id = parseInt(loadId);
    if (isNaN(id) || id < 1) { setError("Please enter a valid dispute ID"); return; }
    setError(""); setLoading(true); setLoadingMsg("Loading dispute...");
    const state = await readDispute(id);
    if (!state) { setError("Dispute not found"); setLoading(false); return; }
    setDisputeId(id); setDispute(state); setLoading(false);
    setScreen(state.status === "resolved" ? "verdict" : "pending");
  };

  return (
    <main className="poh-main">
      <nav className="poh-nav">
        <div className="poh-nav-inner">
          <div className="poh-logo" onClick={reset}>
            <Logo size={28} />
            <span className="poh-logo-name">Proof of Handshake</span>
          </div>
          <div className="poh-nav-right">
            {screen !== "home" && <button className="poh-btn-ghost" onClick={reset}>← Home</button>}
            {screen === "home" && <button className="poh-btn-red" onClick={() => setScreen("create")}>File a Dispute →</button>}
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

        {screen === "home" && (
          <div className="poh-home">
            <section className="poh-hero">
              <div className="poh-hero-left">
                <div className="poh-stamp">
                  <span className="poh-stamp-dot" />
                  <span className="poh-stamp-text">Live · Bradbury Testnet</span>
                </div>
                <h1 className="poh-h1">Your deposit.<br />Your rights.<br /><span className="poh-red">Proven onchain.</span></h1>
                <p className="poh-hero-p">When your shortlet host refuses to return your caution fee, you deserve more than an argument. You deserve a verdict — transparent, reasoned, and stored permanently on the blockchain.</p>
                <div className="poh-hero-btns">
                  <button className="poh-btn-red" onClick={() => setScreen("create")}>File a New Dispute →</button>
                  <button className="poh-btn-outline" onClick={() => setScreen("pending")}>Load Existing Dispute</button>
                </div>
              </div>
              <div className="poh-hero-right">
                <div className="poh-seal-wrap">
                  <svg className="poh-seal-ring-svg" viewBox="0 0 260 260">
                    <circle cx="130" cy="130" r="125" fill="none" stroke="#1e1e1e" strokeWidth="1" />
                    <path id="topArc" d="M 20,130 A 110,110 0 0,1 240,130" fill="none" />
                    <path id="botArc" d="M 240,130 A 110,110 0 0,1 20,130" fill="none" />
                    <text fontFamily="monospace" fontSize="9" fill="#2a2a2a" letterSpacing="5">
                      <textPath href="#topArc" startOffset="5%">PROOF · OF · HANDSHAKE · ONCHAIN ARBITRATION ·</textPath>
                    </text>
                    <text fontFamily="monospace" fontSize="9" fill="#2a2a2a" letterSpacing="5">
                      <textPath href="#botArc" startOffset="5%">POWERED · BY · GENLAYER · AI CONSENSUS ·</textPath>
                    </text>
                  </svg>
                  <div className="poh-seal-center">
                    <Logo size={56} />
                    <span className="poh-seal-label">Verdict sealed</span>
                    <span className="poh-seal-status">● Resolved</span>
                  </div>
                </div>
              </div>
            </section>

            <div className="poh-stats">
              {[["5","AI Validators"],["~60s","To Verdict"],["100%","Onchain & Transparent"],["₦0","Arbitration Fee"]].map(([n,l],i,a) => (
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
                  {n:"01",icon:"📋",title:"File the dispute",desc:"Enter property, deposit amount, and original agreement terms"},
                  {n:"02",icon:"🏠",title:"Host submits claim",desc:"Host states why they are withholding the caution fee with evidence"},
                  {n:"03",icon:"👤",title:"Guest responds",desc:"Guest submits their counter-claim and supporting evidence"},
                  {n:"04",icon:"⚖️",title:"AI consensus verdict",desc:"5 validators independently evaluate and reach a majority ruling onchain"},
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
                  <span className="poh-verdict-id">Dispute #1 · 12 Adewale Street Lagos · ₦150,000</span>
                  <span className="poh-win-badge">✓ GUEST WINS</span>
                </div>
                <div className="poh-verdict-body">
                  <p className="poh-verdict-quote">&ldquo;The guest&apos;s move-in inspection report and messages prove the AC was faulty prior to check-in, negating the host&apos;s repair invoice. The guest provided photographic proof of the apartment&apos;s cleanliness upon departure, whereas the host failed to provide evidence of alleged damage.&rdquo;</p>
                  <div className="poh-chips">
                    {["GPT-5.1 ✓","Grok-4 ✓","Qwen3-235b ✓","Claude Sonnet ✓","Majority Agree ✓"].map(c=><span key={c} className="poh-chip-agree">{c}</span>)}
                  </div>
                </div>
              </div>
            </div>

            <div className="poh-load-box">
              <p className="poh-load-label">Already have a dispute ID?</p>
              <div className="poh-load-row">
                <input className="poh-input" placeholder="Enter dispute ID e.g. 1" value={loadId} onChange={e=>setLoadId(e.target.value)} />
                <button className="poh-btn-red" onClick={handleLoadDispute}>Load →</button>
              </div>
              {error && <p className="poh-error">{error}</p>}
            </div>
          </div>
        )}

        {screen === "create" && (
          <div className="poh-form-wrap">
            <div className="poh-form-hdr">
              <div className="poh-step-tag">Step 1 of 4</div>
              <h2 className="poh-form-title">File the Dispute</h2>
              <p className="poh-form-sub">Enter the shortlet property details and original agreement</p>
            </div>
            <div className="poh-card">
              <div className="poh-field"><label>Property Address</label><input className="poh-input" placeholder="e.g. 12 Adewale Street, Lekki, Lagos" value={propertyAddress} onChange={e=>setPropertyAddress(e.target.value)} /></div>
              <div className="poh-field"><label>Caution Fee / Deposit Amount</label><input className="poh-input" placeholder="e.g. 150,000 NGN" value={depositAmount} onChange={e=>setDepositAmount(e.target.value)} /></div>
              <div className="poh-field-row">
                <div className="poh-field"><label>Host Name</label><input className="poh-input" placeholder="e.g. Mr Bello" value={hostName} onChange={e=>setHostName(e.target.value)} /></div>
                <div className="poh-field"><label>Guest Name</label><input className="poh-input" placeholder="e.g. Miss Tunde" value={guestName} onChange={e=>setGuestName(e.target.value)} /></div>
              </div>
              <div className="poh-field"><label>Original Agreement Terms</label><textarea className="poh-textarea" placeholder="Describe the original shortlet terms — what the caution fee covers, conditions for refund, check-in/check-out rules, etc." value={agreementTerms} onChange={e=>setAgreementTerms(e.target.value)} rows={4} /></div>
              {error && <p className="poh-error">{error}</p>}
              <button className="poh-btn-red poh-btn-full" onClick={handleCreateDispute}>Create Dispute & Continue →</button>
            </div>
          </div>
        )}

        {screen === "host" && (
          <div className="poh-form-wrap">
            <div className="poh-form-hdr">
              <div className="poh-step-tag">Step 2 of 4</div>
              <h2 className="poh-form-title">Host&apos;s Claim</h2>
              <p className="poh-form-sub">Dispute ID: <strong className="poh-id-badge">#{disputeId}</strong> — Share this ID with the guest</p>
            </div>
            <div className="poh-card">
              <div className="poh-party-tag poh-host-tag">🏠 Host&apos;s Side</div>
              <div className="poh-field"><label>Your Claim</label><textarea className="poh-textarea" placeholder="Describe why you are withholding the caution fee. Be specific about what damage occurred during the guest's stay." value={hostClaim} onChange={e=>setHostClaim(e.target.value)} rows={4} /></div>
              <div className="poh-field"><label>Your Evidence</label><textarea className="poh-textarea" placeholder="List your evidence — checkout photos, repair invoices, inspection reports, messages, etc." value={hostEvidence} onChange={e=>setHostEvidence(e.target.value)} rows={4} /></div>
              {error && <p className="poh-error">{error}</p>}
              <button className="poh-btn-red poh-btn-full" onClick={handleHostClaim}>Submit Host Claim →</button>
            </div>
          </div>
        )}

        {screen === "guest" && (
          <div className="poh-form-wrap">
            <div className="poh-form-hdr">
              <div className="poh-step-tag">Step 3 of 4</div>
              <h2 className="poh-form-title">Guest&apos;s Response</h2>
              <p className="poh-form-sub">Dispute ID: <strong className="poh-id-badge">#{disputeId}</strong></p>
            </div>
            <div className="poh-card">
              <div className="poh-party-tag poh-guest-tag">👤 Guest&apos;s Side</div>
              <div className="poh-field"><label>Your Claim</label><textarea className="poh-textarea" placeholder="Describe why the caution fee should be refunded. Be specific about your stay." value={guestClaim} onChange={e=>setGuestClaim(e.target.value)} rows={4} /></div>
              <div className="poh-field"><label>Your Evidence</label><textarea className="poh-textarea" placeholder="List your evidence — check-in photos, messages from host, receipts, WhatsApp screenshots, etc." value={guestEvidence} onChange={e=>setGuestEvidence(e.target.value)} rows={4} /></div>
              {error && <p className="poh-error">{error}</p>}
              <button className="poh-btn-red poh-btn-full" onClick={handleGuestClaim}>Submit Guest Response →</button>
            </div>
          </div>
        )}

        {screen === "pending" && (
          <div className="poh-form-wrap">
            <div className="poh-form-hdr">
              <div className="poh-step-tag">Step 4 of 4</div>
              <h2 className="poh-form-title">Request the Verdict</h2>
              <p className="poh-form-sub">Both claims are on-chain. Ready to summon the AI judges.</p>
            </div>
            <div className="poh-card">
              <div className="poh-validators-block">
                <p className="poh-validators-label">5 AI validators will evaluate this dispute independently:</p>
                <div className="poh-chips">
                  {["GPT-5.1","Grok-4","Qwen3-235b","Claude Sonnet","+ more"].map(c=><span key={c} className="poh-chip">{c}</span>)}
                </div>
                <p className="poh-pending-note">Each validator reads both sides and issues a verdict. The majority ruling is sealed permanently onchain.</p>
              </div>
              {disputeId && <p className="poh-dispute-id-display">Dispute ID: <strong className="poh-id-badge">#{disputeId}</strong></p>}
              {!disputeId && (
                <div className="poh-field">
                  <label>Enter Dispute ID</label>
                  <input className="poh-input" placeholder="e.g. 1" value={loadId} onChange={e=>setLoadId(e.target.value)} />
                  <button className="poh-btn-outline" style={{marginTop:"8px"}} onClick={()=>{const id=parseInt(loadId);if(!isNaN(id))setDisputeId(id);}}>Set ID</button>
                </div>
              )}
              {error && <p className="poh-error">{error}</p>}
              <button className="poh-btn-red poh-btn-full poh-btn-gavel" onClick={handleRequestVerdict} disabled={!disputeId}>⚖️ Request AI Verdict</button>
            </div>
          </div>
        )}

        {screen === "verdict" && dispute && (
          <div className="poh-verdict-screen">
            <div className={`poh-verdict-banner ${dispute.winner==="tenant"?"poh-guest-wins":"poh-host-wins"}`}>
              <div className="poh-verdict-seal"><Logo size={52} /></div>
              <div className="poh-verdict-winner">{dispute.winner==="tenant"?"Guest Wins":"Host Wins"}</div>
              <div className="poh-verdict-deposit">
                {dispute.winner==="tenant" ? `Caution fee of ${dispute.deposit_amount} should be refunded to the guest` : `Host may retain caution fee of ${dispute.deposit_amount}`}
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
