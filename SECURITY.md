# Security Policy

WayCast is a **local, single-user, self-hosted** tool — not a multi-tenant service.

## Threat model / safe use

- The web **console** and the **MCP server** bind to `127.0.0.1` only. Do **not** expose them to untrusted networks.
- `scrape` and automatic image fetch will request **any URL you give them** (following redirects), with no private-IP / cloud-metadata deny-list. Run them only against your own targets. If you host WayCast for others, add a URL allow-list / SSRF deny-list first.
- API keys live in your local `.env` (gitignored) and are sent only to the provider you choose. WayCast has no telemetry and no backend of its own.
- Rendering fetches `npx hyperframes` and a version-pinned GSAP CDN build at render time (network required).

## Reporting a vulnerability

Please report privately — do **not** open a public issue for security bugs:

- GitHub: repo **Security** tab → **Report a vulnerability** (private advisory).

Supported version: the latest release (currently pre-alpha `0.1.x`).
