# Security and supported status

CMP Core and Client are pre-alpha. No version is currently designated
as a production-supported release.

Please use the repository's GitHub Report a vulnerability private
reporting feature if enabled. Do not disclose credentials or unpatched
exploits in public issues or pull requests.

CMP Server is a development reference with local bearer protection,
loopback binding, and a production-environment guard. Do not put it
directly on the public internet or use it as a multi-tenant auth service.
CMP Cloud authorization, Connect, real-time coordination and archives
are independently owned services outside this repository.

For security-sensitive changes: run the documented tests, review
transitive dependencies, validate scope/authorization, and require a
fresh-source/clean-history audit before release.
