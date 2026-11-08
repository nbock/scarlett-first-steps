# Scarlett’s First Steps Jackpot

A birthday prediction game with a permanent GitHub Pages frontend and a small Node/SQLite backend hosted on a Ryzen machine. All wagers are play chips. There are no payments or cash prizes.

## Addresses

- Guest site: https://nbock.github.io/scarlett-first-steps/
- Host entry: https://nbock.github.io/scarlett-first-steps/host/
- Printable QR sign: https://nbock.github.io/scarlett-first-steps/invite/

The QR points to GitHub Pages, so it stays valid when the temporary tunnel address changes. The `runtime` branch contains only `backend.json`, updated by the tunnel supervisor. The guest site reads that configuration and submits bets to the Ryzen API. The host entry opens the password-protected host page on the active tunnel.

Bets, sessions, the host password, and service configuration are stored outside this repository. The database is SQLite in WAL mode. Host sessions are HTTP-only, same-site cookies. Host write endpoints reject cross-origin requests; public betting accepts only the local site and the configured GitHub Pages origin. Forged ChatGPT identity headers confer no access.

## Game rules

Each person supplies a name, predicted date, and wager from 1–1,000 play chips. The latest predicted date on or before the actual date wins. Ties split the pot proportionally to wagers, using largest-remainder whole-chip rounding. If all guesses are too late, all wagers are returned. The host closes betting and records the actual date; a settled result is final.

## Development and hosting

Requires Node 22.16 or later.

```sh
npm ci
npm run typecheck
npm run build
npm test
npm start
```

GitHub Pages publishes `/docs` from `main`. The frontend shares components with the local host page. Both `/host/` and `/invite/` have real static entry files, so direct visits do not depend on SPA fallback routing.

On the configured Ryzen, the user services `scarlett-jackpot` and `scarlett-tunnel` restart after failure and at boot. The tunnel supervisor discovers its random Cloudflare Quick Tunnel URL, checks that it responds, and updates `backend.json` on the `runtime` branch through the authenticated GitHub CLI. Quick Tunnels are temporary and have no uptime guarantee. A permanent ngrok or named Cloudflare tunnel can replace it later.

```sh
systemctl --user status scarlett-jackpot scarlett-tunnel
systemctl --user restart scarlett-jackpot scarlett-tunnel
journalctl --user -u scarlett-jackpot -u scarlett-tunnel -n 50
```

Local configuration: `~/.config/scarlett-jackpot/config.json` (mode 600). Host password: `~/.config/scarlett-jackpot/host-password.txt` (mode 600). Database: `~/.local/share/scarlett-jackpot/bets.sqlite`. Back up the database with SQLite-aware backup tooling; do not commit it.
