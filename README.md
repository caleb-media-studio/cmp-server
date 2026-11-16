# CMP Server (Core)

**Enterprise Self-Hosted is planned:** Paid proprietary modules will require CMP-issued signed licenses and will not relicense or gate Apache-2.0 Core. [Enterprise edition](docs/enterprise-self-hosted.md). Cloud-only managed Connect, WSS agents and archives remain Cloud-only.


## Public source versus proprietary CMP Cloud

The Core protocol, self-hosted Core server, and CMP client SDKs are
Apache-2.0 licensed. **CMP Connect, managed authentication, WebSocket
streaming, agent coordination, and session archives are proprietary CMP Cloud
services, not part of the self-hosted server.** The CMP Web source repository
is private. See [Public vs. proprietary](docs/public-vs-proprietary.md),
[LICENSE](LICENSE), and [Security](SECURITY.md).


Self-hosted reference implementation of the public **Context Management
Protocol** repository API. This codebase is public-source, in pre-alpha, and not production-certified.

## Features

- Persistent SQLite context repositories and immutable record revisions.
- HTTP JSON APIs for records, snapshots, conditional commits and branch heads.
- Branch creation, structural merges, diffs and historical repository events.
- Optional constrained MCP Code Mode for context-only operations.
- Local development bearer protection and loopback binding.

CMP Cloud exclusively operates CMP Connect, managed user/org authentication,
WebSocket streaming, agent coordination and session archives. None of those
backend implementations, dependencies or RPC method families ship here.

This server remains development-only until security and release gates pass.
It must not be publicly exposed with a development token.

## Run locally

Requirements: Node.js 24+ and pnpm.

    pnpm install --frozen-lockfile
    pnpm build
    pnpm run env:init
    pnpm start

Configure a local operator token, then use the HTTP repository API. The
server binds to loopback and requires CMP_ENV=development. It never
requires a CMP Cloud account.

Useful endpoints:

    GET /healthz
    GET /.well-known/context-management
    GET /v1/capabilities
    GET /v1/repos
    POST /v1/repos
    GET /v1/repos/:repo/records
    POST /v1/repos/:repo/commits
    POST /mcp

Full specification: https://github.com/caleb-media-studio/cmp-protocol
Client SDKs: https://github.com/caleb-media-studio/cmp-client
