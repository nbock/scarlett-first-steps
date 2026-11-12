# Scarlett’s First Steps Jackpot

A birthday prediction game with a permanent GitHub Pages frontend and a small Node/SQLite backend hosted on a Ryzen machine. Wagers and the jackpot are recorded in US dollars. The host collects payments and pays winners separately; the site does not process or transfer money. The displayed jackpot is the total pledged, not a verified cash balance.

## Addresses

- Guest site: https://nbock.github.io/scarlett-first-steps/
- Host entry: https://nbock.github.io/scarlett-first-steps/host/
- Printable QR sign: https://nbock.github.io/scarlett-first-steps/invite/

The QR points to GitHub Pages, so it stays valid when the temporary tunnel address changes. The `runtime` branch contains only `backend.json`, updated by the tunnel supervisor. The guest site reads that configuration and submits bets to the Ryzen API. The host entry opens the password-protected host page on the active tunnel.

Bets, sessions, the host password, and service configuration are stored outside this repository. The database is SQLite in WAL mode. Host sessions are HTTP-only, same-site cookies. Host write endpoints reject cross-origin requests; public betting accepts only the local site and the configured GitHub Pages origin. Forged ChatGPT identity headers confer no access.

## Game rules

Each entry costs exactly $5.00 USD and requires a name, Venmo username, and predicted date. People can submit multiple entries, including multiple entries for the same date. Each submission is one $5 share. The latest predicted date on or before the actual date wins the entire pot. Tied winning entries split it equally; any leftover cents go to the earlier winning entries. If all guesses are too late, the host returns all entry fees. The host closes betting and records the actual date; a settled result is final.

Set the host’s Venmo in host controls to display a payment link for guests. Guest Venmo handles are visible only in host controls. The site records entries but does not confirm or process Venmo payments. The host collects $5 for each entry and pays the winners.

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

For backend code updates, restart only `scarlett-jackpot`. The tunnel uses a `Wants` dependency so it stays running at the same URL when the backend restarts. Frontend-only updates need no service restart. Restart `scarlett-tunnel` only when the tunnel itself needs replacement; this changes its URL, so reopen host controls using the permanent GitHub Pages host entry above.

```sh
systemctl --user status scarlett-jackpot scarlett-tunnel
systemctl --user restart scarlett-jackpot
journalctl --user -u scarlett-jackpot -u scarlett-tunnel -n 50
```

Local configuration: `~/.config/scarlett-jackpot/config.json` (mode 600). Host password: `~/.config/scarlett-jackpot/host-password.txt` (mode 600). Database: `~/.local/share/scarlett-jackpot/bets.sqlite`. Back up the database with SQLite-aware backup tooling; do not commit it.

New $5 entries use `/api/v3/predictions`, enforce exactly 500 cents server-side, and carry a unique request ID so retrying one submission cannot create a second entry. A fresh submission gets a fresh ID. Older prediction endpoints reject writes with a refresh message. Host controls still use `/api/v2/host`. The database migration removes the old unique-name constraint while preserving saved records; earlier chip records remain archived in `legacy_chip_bets` and `legacy_chip_game`.
