export type Bet = { id: string; name: string; date: string; amount: number; created_at: number };
export type GameStatus = "open" | "closed" | "settled";
export type Board = { bets: Bet[]; jackpot: number; status: GameStatus; actualDate: string | null; winningDate: string | null; payouts: Record<string,number>; refunded: boolean };

export function validDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + "T12:00:00Z");
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0,10) === value && +value.slice(0,4) >= 2026 && +value.slice(0,4) <= 2035;
}

export function settleBets(bets: Bet[], actualDate: string | null) {
  const payouts: Record<string,number> = {};
  if (!actualDate) return {winningDate: null, payouts, refunded: false};
  const eligible = bets.filter(bet => bet.date <= actualDate);
  if (!eligible.length) return {winningDate: null, payouts: Object.fromEntries(bets.map(bet => [bet.id,bet.amount])), refunded: true};
  const winningDate = eligible.reduce((latest,bet) => bet.date > latest ? bet.date : latest, "");
  const winners = eligible.filter(bet => bet.date === winningDate).sort((a,b) => a.created_at - b.created_at || a.id.localeCompare(b.id));
  const jackpot = bets.reduce((sum,bet) => sum + bet.amount,0);
  const totalStake = winners.reduce((sum,bet) => sum + bet.amount,0);
  const shares = winners.map(bet => ({bet, whole: Math.floor(jackpot * bet.amount / totalStake), remainder: (jackpot * bet.amount) % totalStake}));
  let leftover = jackpot - shares.reduce((sum,s) => sum + s.whole,0);
  shares.sort((a,b) => b.remainder - a.remainder || a.bet.created_at - b.bet.created_at || a.bet.id.localeCompare(b.bet.id));
  for (const share of shares) payouts[share.bet.id] = share.whole + (leftover-- > 0 ? 1 : 0);
  return {winningDate, payouts, refunded: false};
}

export const formatDate = (value: string) => new Date(value + "T12:00:00").toLocaleDateString("en-US", {month:"short",day:"numeric",year:"numeric"});
