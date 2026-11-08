"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUpRight, Check, Coins, Footprints, QrCode, RefreshCw, Sparkles, Trophy, X } from "lucide-react";
import {apiFetch,HOME,ASSETS,SITE_URL} from "./api";
import { formatDate, formatMoney, dollarsToCents, type Board } from "../server/game";

export default function Home() {
  const [board,setBoard] = useState<Board | null>(null);
  const [error,setError] = useState("");
  const [loadError,setLoadError] = useState("");
  const [notice,setNotice] = useState("");
  const [name,setName] = useState("");
  const [date,setDate] = useState("");
  const [amount,setAmount] = useState("25");
  const [saving,setSaving] = useState(false);
  const [showQR,setShowQR] = useState(false);
  const [copied,setCopied] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const load = useCallback(async () => {
    const res = await apiFetch("/api/v2/predictions",{cache:"no-store"});
    const data = await res.json() as Board & {error?:string};
    if (!res.ok) throw new Error(data.error || "Couldn’t load the jackpot.");
    setBoard(data); setLoadError("");
  },[]);
  useEffect(() => {
    const refresh = () => load().catch(e => setLoadError(e.message));
    refresh(); const timer=setInterval(refresh,15000);
    return () => clearInterval(timer);
  },[load]);
  useEffect(() => { if (showQR) dialog.current?.showModal(); else dialog.current?.close(); },[showQR]);
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setSaving(true);setError("");setNotice("");
    try {
      if (dollarsToCents(amount) === null) throw new Error("Enter a wager from $1.00 to $1,000.00, with at most two decimal places.");
      const response = await apiFetch("/api/v2/predictions",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name,date,amountCents:dollarsToCents(amount),currency:"USD"})});
      const data = await response.json() as {error?:string;saved?:boolean};
      if (!response.ok) throw new Error(data.error || "Your bet wasn’t saved.");
      setNotice(`You’re in, ${name.trim()}! ${formatMoney(dollarsToCents(amount)!)} wager recorded. Pay the host separately.`);
      setName("");setDate("");setAmount("25");
      try { await load(); } catch { setLoadError("Bet saved. Refresh to see the updated jackpot."); }
    } catch (e) {setError(e instanceof Error ? e.message : "Please try again.");}
    finally {setSaving(false);}
  }
  const open = board?.status === "open";
  const winnerBets = board?.bets.filter(b => board.payoutsCents[b.id] > 0) || [];
  return <>
    <div className="top-ribbon">A LITTLE FRIENDLY COMPETITION. A WHOLE LOT OF LOVE. <span>✳</span></div>
    <header className="site-header"><a className="brand" href={HOME}><span className="brand-mark">s.</span><span>SCARLETT’S<br/>FIRST STEPS CLUB</span></a><nav><a href="#rules">The rules</a><button className="qr-nav" onClick={() => setShowQR(true)}><QrCode size={17}/> Get the QR</button></nav></header>
    <main className="main-wrap">
      <section className="hero"><div className="hero-copy"><div className="eyebrow hero-kicker"><span/> LITTLE MILESTONE. BIG MOMENT.</div><h1>One small step.<br/>One <em>big jackpot.</em></h1><p>When will Scarlett take her first steps?<br/>Pick a date, place your wager, and cheer her on.</p><a className="hero-link" href="#place-bet">I’ve got a good feeling <ArrowDown size={17}/></a></div><div className="hero-art" aria-hidden="true"><span className="art-star star-one">✳</span><div className="footprint-ticket"><span className="ticket-eyebrow">THE NEXT BIG THING</span><Footprints size={112} strokeWidth={1.05}/><span className="ticket-title">tiny steps,<br/><i>huge applause.</i></span><span className="ticket-bottom">EST. WHENEVER SHE’S READY ♡</span></div><div className="love-sticker">ALL BETS<br/><b>ON LOVE</b><span>♡</span></div><span className="art-star star-two">✦</span></div></section>
      <section className="jackpot" aria-label="Jackpot"><div className="jackpot-main"><div className="jackpot-label"><Coins size={20}/><span>THE JACKPOT</span></div><div className="jackpot-number" aria-live="polite">{board ? formatMoney(board.jackpotCents) : "—"}<span>USD pledged</span></div><p>Total dollar wagers. Payments are handled by the host.</p></div><div className="jackpot-side"><span className={`status-pill ${open ? "" : "closed"}`}><span/>{!board ? "LOADING" : open ? "BETS ARE OPEN" : board.status === "settled" ? "RESULT RECORDED" : "BETS ARE CLOSED"}</span><strong>{board ? board.bets.length : "—"}</strong><span>{board?.bets.length === 1 ? "bet placed" : "bets placed"}</span><div className="pot-rule">Closest without<br/>going over wins.</div></div><span className="jackpot-star" aria-hidden="true">✳</span></section>
      {loadError && <div className="notice error" role="alert">{loadError}<button onClick={() => load().catch(e => setLoadError(e.message))}><RefreshCw size={15}/> Refresh</button></div>}
      {board?.status === "settled" && <section className="winner-banner"><Trophy size={36}/><div><span className="eyebrow">SHE DID IT! FIRST STEPS: {formatDate(board.actualDate!)}</span><h2>{board.refunded ? "No qualifying dates—all wagers are due back." : `${winnerBets.map(b => b.name).join(" & ")} ${winnerBets.length === 1 ? "wins" : "win"} the jackpot!`}</h2><p>{board.winningDate ? `Winning prediction: ${formatDate(board.winningDate)}. ` : ""}{winnerBets.map(b => `${b.name}: ${formatMoney(board.payoutsCents[b.id])} due`).join(" · ")}</p></div></section>}
      <div className="bet-layout">
        <section className="bet-card" id="place-bet"><div className="section-kicker"><span className="eyebrow">TRUST YOUR HUNCH</span><Sparkles size={19}/></div><h2>Place your bet.</h2><p className="muted form-intro">A date. A wager. A chance to say “I called it.”</p>
          <form onSubmit={submit}><fieldset disabled={!open || saving}><label htmlFor="name">Your name <span>so we know who to cheer for</span></label><input id="name" name="name" autoComplete="name" placeholder="e.g. Auntie Sam" required maxLength={40} value={name} onChange={e => setName(e.target.value)}/><label htmlFor="date">Your predicted date</label><input id="date" name="date" type="date" required min="2026-01-01" max="2035-12-31" value={date} onChange={e => setDate(e.target.value)}/><label htmlFor="amount">Your wager <span>US dollars</span></label><div className="amount-input"><Coins size={19}/><input id="amount" name="amount" type="number" inputMode="decimal" min="1" max="1000" step="0.01" required value={amount} onChange={e => setAmount(e.target.value)}/><span>USD</span></div><div className="amount-options" aria-label="Quick wager amounts">{[10,25,50,100].map(n => <button key={n} type="button" className={+amount === n ? "selected" : ""} aria-pressed={+amount === n} onClick={() => setAmount(String(n))}>${n}</button>)}</div><button className="primary-button" type="submit">{saving ? "Placing your bet…" : !board ? "Loading the jackpot…" : !open ? "Betting is closed" : "Add my bet to the jackpot"}<ArrowUpRight size={18}/></button></fieldset>
          {error && <p className="notice error" role="alert">{error}</p>}{notice && <p className="notice success" role="status"><Check size={18}/>{notice}</p>}<p className="fine-print">One bet per person, $1–$1,000 USD. Your name, date, and wager appear on the board. Pay the host separately; submitting records your wager. Bets are final once placed.</p></form>
        </section>
        <section className="bets-section" aria-label="Placed bets"><div className="bets-heading"><div><span className="eyebrow">THE CHEERING SECTION</span><h2>Who’s betting on when?</h2></div><span className="bet-count">{board?.bets.length || 0}</span></div><div className="bets-table-wrap"><table><thead><tr><th>Name</th><th>Predicted date</th><th className="amount-column">Wager</th>{board?.status === "settled" && <th className="amount-column">Payout due</th>}</tr></thead><tbody>{board?.bets.map((bet,i) => <tr key={bet.id} className={board.status === "settled" && board.payoutsCents[bet.id] && !board.refunded ? "winning-row" : ""}><td><span className={`avatar avatar-${i%4}`}>{bet.name.slice(0,1).toUpperCase()}</span><span>{bet.name}</span></td><td>{formatDate(bet.date)}</td><td className="amount-column"><b>{formatMoney(bet.amount_cents)}</b></td>{board.status === "settled" && <td className="amount-column"><b>{formatMoney(board.payoutsCents[bet.id] || 0)}</b></td>}</tr>)}</tbody></table>{!board?.bets.length && <div className="empty-board"><div><Footprints size={34} strokeWidth={1.2}/><span>✦</span></div><h3>{board ? "The first bet could be yours." : "Opening the guest book…"}</h3><p>{board ? "Get the jackpot started with your best guess." : "Fetching the latest bets and jackpot."}</p></div>}</div><p className="board-note"><span/> Updates automatically as new bets come in.</p><div className="friendly-note"><span>♡</span><p>She’ll take her steps in her own sweet time.<br/><b>We’re just here for the standing ovation.</b></p></div></section>
      </div>
      <section id="rules" className="rules-section"><div><span className="eyebrow">HOW THE JACKPOT WORKS</span><h2>Small steps.<br/>Simple rules.</h2><span className="rules-star" aria-hidden="true">✳</span></div><ol><li><span>01</span><div><h3>Pick the day. Name your wager.</h3><p>Enter your name, a calendar date, and a dollar wager. Each saved wager adds to the pledged jackpot. Arrange payment directly with the host.</p></div></li><li><span>02</span><div><h3>Closest without going over wins.</h3><p>The latest predicted date on or before Scarlett’s actual first-steps date wins. Dates after her first steps don’t qualify.</p></div></li><li><span>03</span><div><h3>Celebrate the first steps—and the winner.</h3><p>The host closes betting and enters the actual date. Ties split the jackpot in proportion to each winner’s wager. Amounts are rounded to cents; leftover cents go to the largest fractional share, then the earlier bet. The host handles payouts. If every guess is too late, the host returns all wagers.</p></div></li></ol></section>
      <div className="share-banner"><div><QrCode size={28}/><span>A good hunch deserves good company.</span></div><button onClick={() => setShowQR(true)}>Share the QR code <ArrowUpRight size={17}/></button></div>
    </main><footer><a href={HOME} className="footer-name">Scarlett’s first steps.</a><span>US-dollar wagers. Payments and payouts handled by the host.</span><a href={HOME+"host/"}>Host controls ↗</a></footer>
    <dialog ref={dialog} className="qr-dialog" onCancel={() => setShowQR(false)} onClick={e => {if(e.target === e.currentTarget) setShowQR(false);}}><button className="close-dialog" aria-label="Close QR code" onClick={() => setShowQR(false)}><X size={22}/></button><span className="eyebrow">INVITE THE CHEERING SECTION</span><h2>Scan. Bet. Celebrate.</h2><p>Anyone with the link can join in.</p><img src={ASSETS+"qr.svg"} width="260" height="260" alt="QR code for Scarlett’s first-steps jackpot"/><a className="primary-button" href={ASSETS+"qr.png"} download="scarlett-first-steps-qr.png">Download QR code <ArrowDown size={17}/></a><a className="print-link" href={HOME+"invite/"} target="_blank" rel="noreferrer">Open printable party sign ↗</a><button className="copy-link" onClick={async () => {try {await navigator.clipboard.writeText(SITE_URL);setCopied(true);} catch {setCopied(false);}}}>{copied ? "Link copied ✓" : "Copy website link"}</button></dialog>
  </>;
}
