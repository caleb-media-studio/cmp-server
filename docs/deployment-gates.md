# Core server release checklist

1. TypeScript builds cleanly and Core-only HTTP/MCP tests pass.
2. Database restart, stale commit, branch merge and error cases pass.
3. No Cloud-only services, source imports, hidden methods or transitive
   runtime dependencies are included in the public source or tarball.
4. Operator access protection, network scope, logs and backups receive
   production hardening and external review.
5. A clean Git history is used, with secret/dependency/CI artifact audit.
6. Only after passing checks may source visibility or production binding change.
