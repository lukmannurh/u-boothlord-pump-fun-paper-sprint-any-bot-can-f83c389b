// Pump.fun Paper Sprint (6h final window) — launch sniper, tuned.
//
// Buy each new curve at launch (age 0-3 slots) with a small stake, but only
// when the launch looks genuinely clean: the creator put real skin in the
// game (0.2-2.5 SOL of their own buys in the create slot) AND exactly two
// distinct organic buyers showed up early (zero or one means no interest,
// three or more means a bundled dump in waiting). Real SOL in a sane band,
// no creator sell yet, no big single sell. Take profit at +40%, cut losers
// at -10%, trail winners once up +20%, never hold past 60 slots, and leave
// at once when the creator sells. The point is to be first (the cheapest
// price on the curve) and to get out before the dump that follows most
// launches. Dev-window evidence: this filter is what separates the entries
// that survive from the momentum-chasing that loses -5.9 SOL.
// Deterministic: no clock, no Math.random, no environment.

import { LAMPORTS_PER_SOL, runBot, type Batch, type BotState, type OrderInput, type Pubkey } from './vendor/makefun-bot.ts';

const LAMPORTS = 1e9;
const SOL = LAMPORTS_PER_SOL;
const CURVE_FEE = 0.0125; // protocol 95 bps + creator 30 bps

// Tunables (round numbers; chosen from the dev-window evidence, not fitted per-coin).
const CFG = {
  stakeSol: 0.1, // per-coin stake
  minBuySol: 0.005,
  buySlipBps: 10_000,
  minAge: 0, // youngest age (slots since create) at which a coin may be bought
  maxAge: 3, // oldest age at which a first buy may still be decided
  minRealSol: 0.3, // real SOL reserve window at decision time
  maxRealSol: 30,
  minDevBuySol: 0.2, // creator's own buys in the create slot, at least
  maxDevBuySol: 2.5, // creator's own buys in the create slot, at most
  minBuyers: 2, // distinct non-creator buyers before entry, at least
  maxBuyers: 2, // distinct non-creator buyers before entry, at most
  takeProfit: 0.40, // exit when the position is worth this much over its cost
  stopLoss: 0.10, // exit when it is worth this much under its cost
  trailArm: 0.20, // trailing stop: once up at least this, exit on a fall of trail from the best value
  trail: 0.15,
  maxHold: 60, // exit after holding this many slots
} as const;

interface Launch {
  creator: string;
  created: number;
  vq0: number; // create-time virtual quote reserves (price reference)
  vt0: number; // create-time virtual token reserves
  devBuy: number; // creator buys in the create slot, SOL
  trades: number;
  buyers: Set<string>; // distinct non-creator buyers
  bought: number; // SOL bought by others
  soldByOthers: number; // SOL sold by others
  bigSell: number; // largest single non-creator sell, as a fraction of the reserve before it
  devSold: boolean;
  complete: boolean;
  done: boolean; // never buy it again
}

interface HeldCoin {
  opened: number;
  best: number; // best net value seen, SOL
  txPaid: number; // tx fees paid on this coin's fills, SOL
}

const launches = new Map<Pubkey, Launch>();
const held = new Map<Pubkey, HeldCoin>();
const selling = new Set<Pubkey>();

function launchFor(mint: Pubkey, slot: number, creator: string, vq0: bigint, vt0: bigint): Launch {
  let c = launches.get(mint);
  if (c === undefined) {
    c = {
      creator,
      created: slot,
      vq0: Number(vq0),
      vt0: Number(vt0),
      devBuy: 0,
      trades: 0,
      buyers: new Set(),
      bought: 0,
      soldByOthers: 0,
      bigSell: 0,
      devSold: false,
      complete: false,
      done: false,
    };
    launches.set(mint, c);
  }
  return c;
}

/** Net value of selling `tokens` against (vq, vt), after the 1.25% curve fee and one tx fee. */
function sellValue(tokens: number, vq: number, vt: number, tx: number): number {
  if (tokens <= 0 || vt <= 0) return 0;
  return ((tokens * vq) / (vt + tokens) / LAMPORTS) * (1 - CURVE_FEE) - tx;
}

await runBot({
  onBatch(state: BotState, batch: Batch): OrderInput[] {
    const now = batch.slot;

    // Fold the batch's events into the launch table.
    for (const e of batch.events) {
      if (e.event === 'CreateEvent') {
        launchFor(e.mint, e.slot, e.user, BigInt(e.virtual_quote_reserves), BigInt(e.virtual_token_reserves));
      } else if (e.event === 'TradeEvent') {
        const c = launches.get(e.mint);
        if (c === undefined) continue;
        const sol = Number(e.sol_amount) / LAMPORTS;
        c.trades++;
        const isDev = e.user === c.creator;
        if (e.is_buy) {
          c.bought += sol;
          if (isDev && e.slot === c.created) c.devBuy += sol;
          else if (!isDev) c.buyers.add(e.user);
        } else if (isDev) {
          c.devSold = true;
        } else {
          c.soldByOthers += sol;
          const rqBefore = Number(e.real_quote_reserves) / LAMPORTS + sol;
          if (rqBefore > 0) {
            const frac = sol / rqBefore;
            if (frac > c.bigSell) c.bigSell = frac;
          }
        }
      } else {
        const c = launches.get(e.mint);
        if (c !== undefined) {
          c.complete = true;
          c.done = true;
        }
      }
    }

    // Track our fills: record tx fees per coin, open a HeldCoin record when a
    // buy lands, and clear a sell once it is no longer pending.
    for (const f of batch.fills) {
      if (f.status !== 'filled') continue;
      const fee = Number(f.tx_fee_lamports) / LAMPORTS;
      if (f.side === 'buy') {
        let h = held.get(f.mint);
        if (h === undefined) {
          h = { opened: f.slot, best: 0, txPaid: 0 };
          held.set(f.mint, h);
        }
        h.txPaid += fee;
      } else {
        const h = held.get(f.mint);
        if (h !== undefined) h.txPaid += fee;
        selling.delete(f.mint);
      }
    }
    for (const mint of [...selling]) {
      let pending = false;
      for (const po of state.pending.values()) {
        if (po.order.mint === mint && po.order.side === 'sell') pending = true;
      }
      if (!pending) selling.delete(mint);
    }
    // Drop HeldCoin records whose position is gone (sold or rejected).
    for (const mint of [...held.keys()]) {
      if (!state.positions.has(mint) && !selling.has(mint)) {
        let pendingBuy = false;
        for (const po of state.pending.values()) {
          if (po.order.mint === mint && po.order.side === 'buy') pendingBuy = true;
        }
        if (!pendingBuy) held.delete(mint);
      }
    }

    const marks = new Map(batch.marks.map((m) => [m.mint, m] as const));
    const orders: OrderInput[] = [];
    const cap = state.hello.caps.max_orders_per_batch;
    const tx = Number(state.txFeeLamports()) / LAMPORTS;

    // Exits first.
    for (const [mint, pos] of state.positions) {
      if (orders.length >= cap) break;
      if (selling.has(mint)) continue;
      const c = launches.get(mint);
      const curve = state.curves.get(mint);
      if (curve === undefined || curve.complete) continue;
      let h = held.get(mint);
      if (h === undefined) {
        h = { opened: now, best: 0, txPaid: 0 };
        held.set(mint, h);
      }
      const mk = marks.get(mint);
      const vq = mk ? Number(mk.virtual_quote_reserves) : Number(curve.virtual_quote_reserves);
      const vt = mk ? Number(mk.virtual_token_reserves) : Number(curve.virtual_token_reserves);
      const tokens = Number(pos.token_amount);
      const value = sellValue(tokens, vq, vt, tx);
      const cost = Number(pos.cost_lamports) / LAMPORTS + h.txPaid;
      if (value > h.best) h.best = value;
      let exit = false;
      if (cost > 0) {
        if (value >= cost * (1 + CFG.takeProfit)) exit = true;
        if (value <= cost * (1 - CFG.stopLoss)) exit = true;
        if (h.best >= cost * (1 + CFG.trailArm) && value <= h.best * (1 - CFG.trail)) exit = true;
      }
      if (now - h.opened >= CFG.maxHold) exit = true;
      if (c !== undefined && c.devSold) exit = true;
      if (!exit) continue;
      orders.push({ side: 'sell', mint, token_amount: pos.token_amount, max_slippage_bps: 10_000 });
      selling.add(mint);
      if (c !== undefined) c.done = true;
    }

    // Entries: clean launches, age 0-3 slots, one small stake each.
    let free = Number(state.freeCashLamports()) / LAMPORTS;
    let open = state.committedPositionCount();
    for (const [mint, c] of launches) {
      if (orders.length >= cap) break;
      if (c.done || c.complete) continue;
      const age = now - c.created;
      if (age < CFG.minAge || age > CFG.maxAge) {
        if (age > CFG.maxAge) c.done = true;
        continue;
      }
      if (open >= state.hello.caps.max_open_positions) break;
      const curve = state.curves.get(mint);
      if (curve === undefined || curve.complete) continue;
      // Rug filter.
      const rq = Number(curve.real_quote_reserves) / LAMPORTS;
      if (rq < CFG.minRealSol || rq > CFG.maxRealSol) continue;
      if (c.devBuy < CFG.minDevBuySol || c.devBuy > CFG.maxDevBuySol) continue;
      // Exactly two early organic buyers: fewer means no interest, more
      // means a bundled launch waiting to dump.
      if (c.buyers.size < CFG.minBuyers || c.buyers.size > CFG.maxBuyers) continue;
      if (c.devSold) {
        c.done = true;
        continue;
      }
      if (c.bought > 0 && c.soldByOthers > c.bought) continue;
      if (c.bigSell > 1) continue;
      let pending = false;
      for (const po of state.pending.values()) {
        if (po.order.mint === mint) pending = true;
      }
      if (pending) continue;
      if (held.has(mint)) continue;
      const maxBuy = Number(state.maxBuyLamports(mint)) / LAMPORTS;
      const amount = Math.min(CFG.stakeSol, maxBuy);
      if (amount < CFG.minBuySol) continue;
      if (free < amount + tx) continue;
      orders.push({ side: 'buy', mint, quote_lamports: BigInt(Math.floor(amount * LAMPORTS)), max_slippage_bps: CFG.buySlipBps });
      free -= amount + tx;
      open += 1;
      c.done = true;
    }

    return orders;
  },
});
