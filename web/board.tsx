"use client";
import {useCallback,useEffect,useRef,useState} from "react";
import {apiFetch,HOME} from "./api";
import {ENTRY_FEE_CENTS,formatDate,formatMoney,type Board} from "../server/game";
import {normalizeVenmo,venmoProfileUrl} from "../server/venmo";

const DRAFT_KEY="scarlett-entry-draft-v3";
type Draft={name:string;date:string;venmo:string;requestId:string};
const emptyDraft:Draft={name:"",date:"",venmo:"",requestId:""};
function readDraft():Draft{
  try{
    const draft=JSON.parse(sessionStorage.getItem(DRAFT_KEY)||"null");
    if(draft&&Object.keys(emptyDraft).every(key=>typeof draft[key]==="string"))return draft;
  }catch{}
  return {...emptyDraft};
}
function saveDraft(draft:Draft){try{sessionStorage.setItem(DRAFT_KEY,JSON.stringify(draft));}catch{}}

export default function Home(){
  const [board,setBoard]=useState<Board|null>(null);
  const [error,setError]=useState("");
  const [loadError,setLoadError]=useState("");
  const [notice,setNotice]=useState("");
  const [draft,setDraft]=useState(readDraft);
  const [saving,setSaving]=useState(false);
  const submitting=useRef(false);
  const load=useCallback(async()=>{
    const res=await apiFetch("/api/v3/predictions",{cache:"no-store"});
    const data=await res.json() as Board & {error?:string};
    if(!res.ok)throw new Error(data.error||"Couldn’t load the jackpot.");
    setBoard(data);setLoadError("");
  },[]);
  useEffect(()=>{
    const refresh=()=>load().catch(e=>setLoadError(e.message));
    refresh();const timer=setInterval(refresh,15000);
    return ()=>clearInterval(timer);
  },[load]);
  useEffect(()=>saveDraft(draft),[draft]);
  function update(field:"name"|"date"|"venmo",value:string){setDraft(current=>({...current,[field]:value,requestId:""}));}
  async function submit(event:React.FormEvent){
    event.preventDefault();if(submitting.current)return;
    submitting.current=true;setSaving(true);setError("");setNotice("");
    try{
      if(!draft.name.trim())throw new Error("Enter your name to save your entry.");
      const username=normalizeVenmo(draft.venmo);
      if(!username)throw new Error("Venmo is required. Enter your @username or paste your Venmo profile link.");
      const requestId=draft.requestId||crypto.randomUUID();
      const pending={...draft,requestId};
      setDraft(pending);saveDraft(pending);
      const response=await apiFetch("/api/v3/predictions",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name:draft.name,date:draft.date,venmo:username,currency:"USD",amountCents:ENTRY_FEE_CENTS,requestId})});
      const data=await response.json() as {error?:string;saved?:boolean};
      if(!response.ok)throw new Error(data.error||"Your entry wasn’t saved.");
      setNotice(`You’re in, ${draft.name.trim()}! Your $5 entry for ${formatDate(draft.date)} is saved. Pick another date to enter again.`);
      const next={...draft,date:"",requestId:""};setDraft(next);saveDraft(next);
      try{await load();}catch{setLoadError("Entry saved. Refresh to see the updated jackpot.");}
    }catch(e){setError(e instanceof Error?e.message:"Please try again.");}
    finally{submitting.current=false;setSaving(false);}
  }
  const open=board?.status==="open";
  const winnerNames=[...new Set(board?.bets.filter(b=>board.payoutsCents[b.id]>0).map(b=>b.name)||[])];
  return <main className="jackpot-page">
    <header className="page-heading">
      <h1>Scarlett’s first steps</h1>
      <p>$5 per entry. Pick the date. Win the pot.</p>
    </header>
    <section className="jackpot" aria-labelledby="jackpot-title">
      <h2 id="jackpot-title">Jackpot</h2>
      <p className="jackpot-number" aria-live="polite">{board?formatMoney(board.jackpotCents):"—"}</p>
      <p className="jackpot-meta"><span>{board?`${board.bets.length} ${board.bets.length===1?"entry":"entries"}`:"Loading…"}</span>{board&&<span className={`bet-status ${open?"open":"closed"}`}>{open?"Entries open":board.status==="settled"?"Result recorded":"Entries closed"}</span>}</p>
    </section>
    <p className="entry-rules">The closest date <strong>on or before</strong> her first steps wins the whole pot. Tied winning entries split it equally.</p>
    {loadError&&<div className="notice error" role="alert">{loadError}<button type="button" onClick={()=>load().catch(e=>setLoadError(e.message))}>Refresh</button></div>}
    {board?.status==="settled"&&<section className="result" aria-label="Result">
      <p>First steps: <strong>{formatDate(board.actualDate!)}</strong></p>
      <h2>{board.refunded?"All entry fees are due back.":`${winnerNames.join(" & ")} ${winnerNames.length===1?"wins":"win"}!`}</h2>
      <p>{board.refunded?"Every prediction was too late.":`Winning date: ${formatDate(board.winningDate!)}. Payouts are listed below.`}</p>
    </section>}
    <section className="wager-section" aria-labelledby="entry-title">
      <h2 id="entry-title">Enter for $5</h2>
      <form onSubmit={submit}>
        <fieldset disabled={!open||saving}>
          <legend className="sr-only">Your $5 first-steps entry</legend>
          <label htmlFor="date">1. Pick the day</label>
          <input id="date" name="date" type="date" required min="2026-01-01" max="2035-12-31" value={draft.date} onChange={e=>update("date",e.target.value)}/>
          <div className="entry-payment">
            <h3>2. Venmo the host $5</h3>
            {board?.hostVenmo?<><p>Send $5 per entry to <strong>@{board.hostVenmo}</strong>. Include your name in the payment note.</p>{open&&<a className="secondary-button venmo-pay" href={venmoProfileUrl(board.hostVenmo)} target="_blank" rel="noopener noreferrer">Open Venmo ↗</a>}</>:<p>Send the host $5 on Venmo for each entry. Include your name in the payment note.</p>}
          </div>
          <h3 className="entry-details-title">3. Add your details</h3>
          <div className="entry-fields">
            <div><label htmlFor="name">Your name</label><input id="name" name="name" autoComplete="name" placeholder="e.g. Sam" required maxLength={40} value={draft.name} onChange={e=>update("name",e.target.value)}/></div>
            <div><label htmlFor="venmo">Your Venmo</label><input id="venmo" name="venmo" type="text" placeholder="@username or profile link" required autoComplete="off" autoCapitalize="none" spellCheck={false} maxLength={240} value={draft.venmo} onChange={e=>update("venmo",e.target.value)} aria-describedby="venmo-help"/></div>
          </div>
          <p id="venmo-help" className="fine-print">Only the host sees your Venmo, to collect entry fees and pay winners.</p>
          <button className="primary-button" type="submit">{saving?"Saving entry…":!board?"Loading…":!open?"Entries are closed":"Submit my $5 entry"}</button>
        </fieldset>
        {error&&<p className="notice error" role="alert">{error}</p>}
        {notice&&<p className="notice success" role="status">{notice}</p>}
        <p className="fine-print">Enter as many times as you like: each submission is a separate $5 entry. Each winning entry gets one equal share of the pot. If all guesses are too late, entry fees are returned.</p>
      </form>
    </section>
    <section className="wagers-section" aria-labelledby="entries-title">
      <h2 id="entries-title">Entries</h2>
      <div className="wagers-table-wrap" role="region" aria-label="Everyone’s entries" tabIndex={0}>
        <table><thead><tr><th scope="col">Name</th><th scope="col">Predicted date</th><th scope="col" className="amount-column">Entry</th>{board?.status==="settled"&&<th scope="col" className="amount-column">{board.refunded?"Refund due":"Payout due"}</th>}</tr></thead>
          <tbody>{board?.bets.map(bet=><tr key={bet.id} className={board.status==="settled"&&board.payoutsCents[bet.id]&&!board.refunded?"winning-row":""}>
            <td>{bet.name}</td><td>{formatDate(bet.date)}</td><td className="amount-column">{formatMoney(bet.amount_cents)}</td>
            {board.status==="settled"&&<td className="amount-column">{formatMoney(board.payoutsCents[bet.id]||0)}</td>}
          </tr>)}</tbody>
        </table>
        {!board?.bets.length&&<p className="empty-board">{board?"No entries yet. Be the first.":"Loading entries…"}</p>}
      </div>
    </section>
    <footer className="page-footer"><a href={HOME+"host/"}>Host controls</a></footer>
  </main>;
}
