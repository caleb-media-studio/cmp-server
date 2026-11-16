# CMP Server Core MVP

- No Cloud-only code or backend capabilities in self-hosted release.
- HTTP repository creation, snapshots, record revisions, history and CAS.
- Branching, diffs, merges, error semantics and persistence across restart.
- Optional repository-only MCP compatibility, no agent identity headers.
- Local operator access restriction and loopback-only development mode.
- Tests explicitly reject WSS tickets, agent coordination, archiving and Connect.
- Production exposure awaits authentication/access security assessment,
  durability testing, dependency/license audit, packaged release verification.

The current dev token is NOT a production-authentication solution.
No Cloud OAuth stack is required by the public self-hosted server.
