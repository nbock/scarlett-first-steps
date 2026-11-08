export type Bet = { id: string; name: string; date: string; amount_cents: number; created_at: number };
export type GameStatus = "open" | "closed" | "settled";
export type Board = { currency: "USD"; bets: Bet[]; jackpotCents: number; status: GameStatus; actualDate: string | null; winningDate: string | null; payoutsCents: Record<string,number>; refunded: boolean };
export type HostBoard = Board & {venmoByBet: Record<string,string | null>};

export function dollarsToCents(value: string): number | null {
  if (!/^\d+(?:\.\d{1,2})?$/.test(value)) return null;
  const [dollars, cents = ""] = value.split(".");
  const amount = Number(dollars) * 100 + Number(cents.padEnd(2, "0"));
  return Number.isSafeInteger(amount) && amount >= 100 && amount <= 100000 ? amount : null;
}

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
  const totalStake = winners.reduce((sum,bet) => sum + BigInt(bet.amount_cents),0n);
  const shares = winners.map(bet => {const weighted = jackpot * BigInt(bet.amount_cents);return {bet,whole:Number(weighted / totalStake),remainder:weighted % totalStake};});
  let leftover = Number(jackpot) - shares.reduce((sum,s) => sum + s.whole,0);
  shares.sort((a,b) => a.remainder === b.remainder ? a.bet.created_at - b.bet.created_at || a.bet.id.localeCompare(b.bet.id) : a.remainder > b.remainder ? -1 : 1);
  for (const share of shares) payoutsCents[share.bet.id] = share.whole + (leftover-- > 0 ? 1 : 0);
  return {winningDate, payoutsCents, refunded: false};
}

export const formatDate = (value: string) => new Date(value + "T12:00:00").toLocaleDateString("en-US", {month:"short",day:"numeric",year:"numeric"});
