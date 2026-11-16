# CMP Server security boundary

Core repository APIs can contain sensitive knowledge and accept writes.
The reference implementation uses a single development bearer token and
loopback-only binding. It fails closed outside CMP_ENV=development and
does not offer tenant management or Cloud OAuth.

Never publicly expose the development server. A future safe deployment
must have independent operator-managed access controls, input limits,
audit logs, backups, update policy and negative authorization tests.
No anonymous public write API.

No managed CMP Connect source credentials, WSS agent sessions, contracts,
session archives or Cloud authentication backend are part of this repo.
