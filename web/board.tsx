"use client";
import { useCallback, useEffect, useState } from "react";
import {apiFetch,HOME} from "./api";
import { formatDate, formatMoney, dollarsToCents, type Board } from "../server/game";
import {normalizeVenmo} from "../server/venmo";

export default function Home() {
  const [board,setBoard] = useState<Board | null>(null);
  const [error,setError] = useState("");
  const [loadError,setLoadError] = useState("");
  const [notice,setNotice] = useState("");
  const [name,setName] = useState("");
  const [date,setDate] = useState("");
  const [amount,setAmount] = useState("25");
  const [venmo,setVenmo] = useState("");
  const [saving,setSaving] = useState(false);
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
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setSaving(true);setError("");setNotice("");
    try {
      if (dollarsToCents(amount) === null) throw new Error("Enter a wager from $1.00 to $1,000.00, with at most two decimal places.");
      const username=normalizeVenmo(venmo);
      if(username===null)throw new Error("Enter your Venmo @username or a profile link like venmo.com/u/username, or leave it blank.");
      const response = await apiFetch("/api/v2/predictions",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name,date,amountCents:dollarsToCents(amount),currency:"USD",venmo:username})});
      const data = await response.json() as {error?:string;saved?:boolean};
      if (!response.ok) throw new Error(data.error || "Your bet wasn’t saved.");
      setNotice(`You’re in, ${name.trim()}! ${formatMoney(dollarsToCents(amount)!)} wager recorded. Pay the host separately.`);
      setName("");setDate("");setAmount("25");setVenmo("");
      try { await load(); } catch { setLoadError("Bet saved. Refresh to see the updated jackpot."); }
    } catch (e) {setError(e instanceof Error ? e.message : "Please try again.");}
    finally {setSaving(false);}
  }
  const open = board?.status === "open";
  const winnerBets = board?.bets.filter(b => board.payoutsCents[b.id] > 0) || [];
  return <main className="jackpot-page">
    <header className="page-heading">
      <h1>Scarlett’s first steps</h1>
      <p>Pick the date. Closest without going over wins.</p>
    </header>

    <section className="jackpot" aria-labelledby="jackpot-title">
      <h2 id="jackpot-title">Jackpot</h2>
      <p className="jackpot-number" aria-live="polite">{board ? formatMoney(board.jackpotCents) : "—"}</p>
      <p className="jackpot-meta">
        <span>{board ? `${board.bets.length} ${board.bets.length === 1 ? "wager" : "wagers"}` : "Loading…"}</span>
        {board && <span className={`bet-status ${open ? "open" : "closed"}`}>{open ? "Betting open" : board.status === "settled" ? "Result recorded" : "Betting closed"}</span>}
      </p>
    </section>

    {loadError && <div className="notice error" role="alert">{loadError}<button type="button" onClick={() => load().catch(e => setLoadError(e.message))}>Refresh</button></div>}
    {board?.status === "settled" && <section className="result" aria-label="Result">
      <p>First steps: <strong>{formatDate(board.actualDate!)}</strong></p>
      <h2>{board.refunded ? "All wagers are due back." : `${winnerBets.map(b => b.name).join(" & ")} ${winnerBets.length === 1 ? "wins" : "win"}!`}</h2>
      <p>{board.refunded ? "Every predicted date was too late." : `Winning date: ${formatDate(board.winningDate!)}. Payouts are listed below.`}</p>
    </section>}

    <section className="wager-section" aria-labelledby="wager-title">
      <h2 id="wager-title">Place a wager</h2>
      <form onSubmit={submit}>
        <fieldset disabled={!open || saving}>
          <legend className="sr-only">Your first-steps prediction</legend>
          <div className="wager-fields">
            <div><label htmlFor="name">Your name</label><input id="name" name="name" autoComplete="name" placeholder="e.g. Sam" required maxLength={40} value={name} onChange={e => setName(e.target.value)}/></div>
            <div><label htmlFor="date">First-steps date</label><input id="date" name="date" type="date" required min="2026-01-01" max="2035-12-31" value={date} onChange={e => setDate(e.target.value)}/></div>
            <div><label htmlFor="amount">Wager (USD)</label><div className="amount-input"><span aria-hidden="true">$</span><input id="amount" name="amount" type="number" inputMode="decimal" min="1" max="1000" step="0.01" required value={amount} onChange={e => setAmount(e.target.value)}/></div></div>
          </div>
          <label htmlFor="venmo">Venmo <span className="optional-label">(optional)</span></label>
          <input id="venmo" name="venmo" type="text" placeholder="@username or Venmo profile link" autoComplete="off" autoCapitalize="none" spellCheck={false} maxLength={240} value={venmo} onChange={e=>setVenmo(e.target.value)} aria-describedby="venmo-help"/>
          <p id="venmo-help" className="fine-print">Only the host can see your Venmo, for collecting wagers and paying winners.</p>
          <button className="primary-button" type="submit">{saving ? "Placing wager…" : !board ? "Loading…" : !open ? "Betting is closed" : "Place wager"}</button>
        </fieldset>
        {error && <p className="notice error" role="alert">{error}</p>}
        {notice && <p className="notice success" role="status">{notice}</p>}
        <p className="fine-print">One public, final bet per person · $1–$1,000 USD · Pay the host separately. Ties split the jackpot by wager amount.</p>
      </form>
    </section>

    <section className="wagers-section" aria-labelledby="wagers-title">
      <h2 id="wagers-title">Wagers</h2>
      <div className="wagers-table-wrap" role="region" aria-label="Everyone’s wagers" tabIndex={0}>
        <table>
          <thead><tr><th scope="col">Name</th><th scope="col">Predicted date</th><th scope="col" className="amount-column">Wager</th>{board?.status === "settled" && <th scope="col" className="amount-column">{board.refunded ? "Refund due" : "Payout due"}</th>}</tr></thead>
          <tbody>{board?.bets.map(bet => <tr key={bet.id} className={board.status === "settled" && board.payoutsCents[bet.id] && !board.refunded ? "winning-row" : ""}>
            <td>{bet.name}</td><td>{formatDate(bet.date)}</td><td className="amount-column">{formatMoney(bet.amount_cents)}</td>
            {board.status === "settled" && <td className="amount-column">{formatMoney(board.payoutsCents[bet.id] || 0)}</td>}
          </tr>)}</tbody>
        </table>
        {!board?.bets.length && <p className="empty-board">{board ? "No wagers yet. Be the first." : "Loading wagers…"}</p>}
      </div>
    </section>
    <footer className="page-footer"><a href={HOME+"host/"}>Host controls</a></footer>
  </main>;
}
