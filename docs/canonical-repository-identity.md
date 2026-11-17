# Core reference: canonical `local/name` identity

CMP's client-facing repo identifier is `owner/name`. This development-only
Core server supports `local/name` only. `local` is a namespace label,
**not** authentication, a tenant, or a permission. Bearer auth and loopback
binding remain mandatory; this does not introduce Cloud OAuth.

The current flat SQLite key `name` and associated event and commit keys
remain unchanged. Existing repositories are not rewritten or duplicated.
`GET /v1/repos`, `POST /v1/repos`, repository metadata and
`context.list` emit canonical `local/name` values. The canonical REST
route is `/v1/repos/local%2Fname/{head,records,branches,commits,diff,merge,events}`.
Encoded IDs are single path parameters, decoded exactly once and validated.
Unknown owners, traversal, double encoding and malformed names fail closed.
Existing flat create and resource identifiers are deprecated local-only
aliases for `local/name` and remain accepted during compatibility rollout.

The `.cmp` transport `/local/name.cmp` advertises the same canonical
`repository` identity. It is JSON CMP context transport, not Git.

Supported Core names: `[a-z0-9][a-z0-9_-]{1,63}` (2 to 64 chars).
This more restrictive Core namespace must not be silently widened to match
Cloud owner/name without protocol review.

Run `pnpm test` for SQLite restart/persistence, legacy alias requests,
canonical REST/RPC, full Core context operations, invalid owner/encoded
slashes and raw HTTP traversal checks. A separate native CMP CLI conformance
suite is required for cross-repository M1 completion.

No SQL migration, production deployment, key change or remote networking
outside loopback is needed for this adapter.
