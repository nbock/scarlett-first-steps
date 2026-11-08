"use client";
import {apiFetch} from "./api";
import {useEffect,useState} from "react";
import {formatDate,type Board} from "../server/game";
export default function HostControls() {
  const [board,setBoard]=useState<Board|null>(null);const [date,setDate]=useState("");const [message,setMessage]=useState("");const [busy,setBusy]=useState(false);
  async function load(){const res=await apiFetch("/api/predictions");const body=await res.json() as Board & {error?:string};if(!res.ok)throw new Error(body.error);setBoard(body);}
  useEffect(()=>{load().catch(e=>setMessage(e.message));},[]);
  async function act(action:"close"|"settle"){
    if(!window.confirm(action==="close"?"Close betting now? No more bets will be accepted.":`Award the jackpot using ${formatDate(date)} as the actual first-steps date? This result will be final.`))return;
    setBusy(true);setMessage("");try{const res=await apiFetch("/api/host",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action,date})});const body=await res.json() as {error?:string};if(!res.ok)throw new Error(body.error);await load();setMessage(action==="close"?"Betting is closed.":"The jackpot has been awarded. The results are live on the main page.");}catch(e){setMessage(e instanceof Error?e.message:"Please try again.");}finally{setBusy(false);}
  }
  return <div className="host-controls"><p>{board?`${board.jackpot.toLocaleString()} chips · ${board.bets.length} bets · ${board.status}`:"Loading…"}</p><p>Close betting before Scarlett’s first steps become known to the group. When she takes them, record the actual date to calculate the winner automatically.</p>{board?.status==="open"&&<button className="secondary-button" disabled={busy} onClick={()=>act("close")}>Close betting</button>}{board&&board.status!=="settled"&&<form onSubmit={e=>{e.preventDefault();act("settle");}}><label htmlFor="actual-date">Actual first-steps date</label><input type="date" id="actual-date" value={date} onChange={e=>setDate(e.target.value)} min="2026-01-01" max={new Date().toISOString().slice(0,10)} required/><button className="primary-button" disabled={busy||!date}>Award the jackpot</button><p className="fine-print">Awarding also closes betting. The latest date on or before the actual date wins; tied dates split the pot in proportion to their wagers.</p></form>}{board?.status==="settled"&&<p>First steps: {formatDate(board.actualDate!)}. The result is final.</p>}<p role="status">{message}</p></div>;
}
