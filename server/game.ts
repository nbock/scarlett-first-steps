export type Bet = { id: string; name: string; date: string; amount_cents: number; created_at: number };
export type GameStatus = "open" | "closed" | "settled";
export const ENTRY_FEE_CENTS = 500;
export type Board = { currency: "USD"; entryFeeCents: number; hostVenmo: string | null; bets: Bet[]; jackpotCents: number; status: GameStatus; actualDate: string | null; winningDate: string | null; payoutsCents: Record<string,number>; refunded: boolean };
export type HostBoard = Board & {venmoByBet: Record<string,string | null>};

export const formatMoney = (cents: number) => new Intl.NumberFormat("en-US", {style:"currency",currency:"USD"}).format(cents / 100);

export function validDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + "T12:00:00Z");
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0,10) === value && +value.slice(0,4) >= 2026 && +value.slice(0,4) <= 2035;
}

export function settleBets(bets: Bet[], actualDate: string | null) {
  const payoutsCents: Record<string,number> = {};
  if (!actualDate) return {winningDate: null, payoutsCents, refunded: false};
  const eligible = bets.filter(bet => bet.date <= actualDate);
  if (!eligible.length) return {winningDate: null, payoutsCents: Object.fromEntries(bets.map(bet => [bet.id,bet.amount_cents])), refunded: true};
  const winningDate = eligible.reduce((latest,bet) => bet.date > latest ? bet.date : latest, "");
  const winners = eligible.filter(bet => bet.date === winningDate).sort((a,b) => a.created_at - b.created_at || a.id.localeCompare(b.id));
  const jackpot = bets.reduce((sum,bet) => sum + BigInt(bet.amount_cents),0n);
  const share = Number(jackpot / BigInt(winners.length));
  const leftover = Number(jackpot % BigInt(winners.length));
  winners.forEach((bet,index) => {payoutsCents[bet.id] = share + (index < leftover ? 1 : 0);});
  return {winningDate, payoutsCents, refunded: false};
}

export const formatDate = (value: string) => new Date(value + "T12:00:00").toLocaleDateString("en-US", {month:"short",day:"numeric",year:"numeric"});
