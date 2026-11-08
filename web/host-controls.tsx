"use client";
import {apiFetch} from "./api";
import {useEffect,useState} from "react";
import {formatDate,formatMoney,type HostBoard} from "../server/game";
import {venmoProfileUrl} from "../server/venmo";

export default function HostControls() {
  const [board,setBoard]=useState<HostBoard|null>(null);
  const [date,setDate]=useState("");
  const [message,setMessage]=useState("");
  const [busy,setBusy]=useState(false);

  async function load(){
    const res=await apiFetch("/api/v2/host");
    const body=await res.json() as HostBoard & {error?:string};
    if(!res.ok)throw new Error(body.error);
    setBoard(body);
  }
  useEffect(()=>{load().catch(e=>setMessage(e.message));},[]);

  async function act(action:"close"|"settle"){
    const confirmation=action==="close"
      ? "Close betting now? No more wagers will be accepted. You can record Scarlett’s first steps later."
      : `Record the winner using ${formatDate(date)} as the actual first-steps date? This result will be final.`;
    if(!window.confirm(confirmation))return;
    setBusy(true);setMessage("");
    try{
      const payload=action==="close"?{action}:{action,date};
      const res=await apiFetch("/api/v2/host",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
      const body=await res.json() as {error?:string};
      if(!res.ok)throw new Error(body.error);
      await load();
      setMessage(action==="close"
        ? "Betting is closed. The wagers are saved. Record the result after Scarlett takes her first steps."
        : "The result is recorded. Payout amounts are live on the main page; arrange payment with the winners.");
    }catch(e){setMessage(e instanceof Error?e.message:"Please try again.");}
    finally{setBusy(false);}
  }

  return <div className="host-controls">
    <p>{board?`${formatMoney(board.jackpotCents)} pledged · ${board.bets.length} bets · ${board.status}`:"Loading…"}</p>
    {board?.status==="open"&&<section aria-labelledby="close-betting-title">
      <h2 id="close-betting-title">Close betting</h2>
      <p>Stop accepting new wagers. Existing predictions stay saved, including future dates. No first-steps date is needed yet.</p>
      <button type="button" className="secondary-button" disabled={busy} onClick={()=>act("close")}>Close betting</button>
    </section>}
    {board?.status==="closed"&&<form onSubmit={e=>{e.preventDefault();act("settle");}} aria-labelledby="record-result-title">
      <h2 id="record-result-title">Record the result</h2>
      <p>Betting is closed. Come back here after Scarlett takes her first steps to record the day it happened.</p>
      <label htmlFor="actual-date">Date Scarlett actually took her first steps</label>
      <input type="date" id="actual-date" value={date} onChange={e=>setDate(e.target.value)} min="2026-01-01" max={new Date().toISOString().slice(0,10)} required aria-describedby="actual-date-help"/>
      <p id="actual-date-help" className="fine-print">Use the actual date, today or earlier—not a predicted date from a wager.</p>
      <button type="submit" className="primary-button" disabled={busy||!date}>Record winner & payout amounts</button>
      <p className="fine-print">The latest prediction on or before the actual date wins. Ties split the pot in proportion to their wagers. The host handles payments.</p>
    </form>}
    {board?.status==="settled"&&<p>First steps: {formatDate(board.actualDate!)}. The result is final.</p>}
    <p role="status">{message}</p>
    {board&&<section className="host-contacts" aria-labelledby="venmo-contacts-title">
      <h2 id="venmo-contacts-title">Wagers & Venmo</h2>
      <p className="fine-print">Venmo details are visible only to you. Open a profile to pay or request money in Venmo.</p>
      <div className="wagers-table-wrap" role="region" aria-label="Private wager contact details" tabIndex={0}>
        <table>
          <thead><tr><th scope="col">Name</th><th scope="col" className="amount-column">Wager</th><th scope="col">Venmo</th>{board.status==="settled"&&<th scope="col" className="amount-column">{board.refunded?"Refund due":"Payout due"}</th>}</tr></thead>
          <tbody>{board.bets.map(bet=>{
            const username=board.venmoByBet[bet.id];
            return <tr key={bet.id}>
              <td>{bet.name}</td><td className="amount-column">{formatMoney(bet.amount_cents)}</td>
              <td className="venmo-contact">{username?<a href={venmoProfileUrl(username)} target="_blank" rel="noopener noreferrer">@{username} ↗</a>:<span className="optional-label">Not provided</span>}</td>
              {board.status==="settled"&&<td className="amount-column">{formatMoney(board.payoutsCents[bet.id]||0)}</td>}
            </tr>;
          })}</tbody>
        </table>
        {!board.bets.length&&<p className="empty-board">No wagers yet.</p>}
      </div>
    </section>}
  </div>;
}
