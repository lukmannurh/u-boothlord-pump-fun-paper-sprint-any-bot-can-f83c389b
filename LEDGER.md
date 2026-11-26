# LEDGER — u-boothlord-pump-fun-paper-sprint-any-bot-can-f83c389b

- Competition: Pump.fun Paper Sprint: Any Bot Can Win
- Slug: u-boothlord-pump-fun-paper-sprint-any-bot-can-f83c389b
- Prize: $2, winner takes all (1st place only)
- Deadline: 26 Nov 2026 12:40 WIB (05:40 UTC)
- Final window: 6 hours of pump.fun data recorded after entries close
- Harness: pumpfun-replay/v2, capital 10 SOL, max 5 open positions,
  max order 1% of real reserve, max 16 orders/batch, latency 2 slots
- Guardrail: >= 0.01 SOL round trip on each of >= 20 coins; max drawdown <= 50%

## Build

- Kit init: `makefun anchor a86768b77539db7b409f63889b7d40d1ebff8c4b round 34286144`
  (26 Nov 2026 ~09:56 WIB, keypair ~/workspace/makefun/makefun-keypair.json)
- Strategy: early momentum, written fresh in main.ts (not copied from any
  other entry). Entry: age >= 300 slots, 40-slot window, net inflow
  >= 0.5 SOL, >= 3 buys / >= 3 distinct buyers, price +3%..+200% and >= 90%
  of window high, real SOL 1–80. First buy 0.1 SOL, pyramid +0.2 SOL to
  max 1.0 SOL/position while price above last buy, position up, inflow
  continues. Exits: -25% stop, -30% trail once +10%, fade < -1 SOL/20 slots,
  2000-slot max hold. Probes 0.01 SOL, pace 25 coins / 240 fills over
  6h (PACE_SECS 21600). Max 4 main positions + 1 probe slot.
- vendor/makefun-bot.ts: byte-identical copy of the kit SDK shim (cmp OK).

## Strategy change (26 Nov ~11:10-11:42 WIB, Lukman: submit the BEST version, push top 500 min / top 100)

- The early-momentum bot lost -5.863 SOL on the dev window (drawdown 58.6%,
  over the 50% guardrail), so it was replaced by a launch sniper, tuned:
  buy each new curve at launch (age 0-3 slots, 0.1 SOL) only when the launch
  looks clean — creator skin in the game (0.2-2.5 SOL of own buys in the
  create slot) AND exactly two distinct organic buyers early (0-1 = no
  interest, 3+ = bundled dump in waiting); real SOL 0.3-30, no creator sell,
  no big single sell. Exits: TP +40%, SL -10%, trail arm +20% / trail -15%,
  max hold 60 slots, exit on creator sell. Deterministic (no clock, no
  Math.random, no environment). main.ts rewritten in >=2 messages (full
  write + genuine refactor of the buyer-count range check).
- Variants graded (all with node22 v22.23.5, --driver process, --worktree):
  momentum original -5.863 SOL; sniper-tuned -0.368; exit tuning -0.366;
  stricter entry (minDevBuy 0.05 + minBuyers 1) -0.237; long hold -0.505;
  strictest entry (minDevBuy 0.1 + buyers exactly 2) -0.045; BEST
  (minDevBuy 0.2 + buyers exactly 2) -0.042 SOL. Exit tuning and longer
  holds did not help; the entry filter is what matters. No --stress run
  (time); the final window is unseen data, so the dev score is a guide,
  not a forecast.

## Grading — RUN (grade-local, node22 v22.23.5, --driver process, --worktree)

- Dev score: net PnL -0.0423 SOL (return -0.42% on 10 SOL capital)
- result_sha256: cedddd55c57f0ab96a2592eeb8665374b1dfcd28b0aefdc1f5f337600ceff521
- Max drawdown: 1.0% (guardrail <= 50%: PASS)
- Win rate: 17.6%; round trips 74; distinct mints 74 (guardrail >= 20: PASS)
- Fills: 148; fees 0.048 SOL
- Determinism: VERIFIED (l1 reproduced: true; two runs byte-identical)
- Prize eligibility: net PnL is still slightly negative (-0.042 SOL), so it
  does NOT clear the > 0 SOL bar on the dev window — but it is ~138x better
  than the original (-5.863 SOL), meets both guardrails with wide margin,
  and the final window is different data. Best version available; submit it.

## Submissions

- None. No commit, push, bundle, or submit performed (parent handles that).

## Submission

- Submission: 01a21619-56e5-71e6-8c45-f5c15552190b
- Commit: 7c11c8212995969f7f1921ec4850c057039addfd
- Repo: https://github.com/lukmannurh/u-boothlord-pump-fun-paper-sprint-any-bot-can-f83c389b
- Claim code: AF-2VKRJ-2JT8E-0W684-K1SQP
- Submitted: 2026-11-26T04:25:09.110Z (parent pipeline)
