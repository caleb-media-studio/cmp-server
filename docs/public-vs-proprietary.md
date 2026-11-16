# CMP: public source and proprietary services

CMP is a family of related products. Public GitHub repositories and a
publicly accessible managed service are not the same thing.

## Source and feature ownership

| Component | Source visibility | Included capabilities |
| --- | --- | --- |
| CMP Protocol | Public, Apache-2.0 | Core repository API contracts, versioned knowledge records, snapshots, commits, branches, merge, diff, and compatibility |
| CMP Server | Public, Apache-2.0 | Development-only self-hosted Core HTTP repository API, SQLite persistence, and repository-only MCP bridge |
| CMP Client | Public, Apache-2.0 | HTTP SDKs/CLI for Core and optional client-side calls/host adapters for CMP Cloud |
| CMP Enterprise Self-Hosted | Proprietary, planned | Customer-installed paid extensions, customer IdP, advanced RBAC, KMS, audit export, regional controls, CMP-issued license activation |
| CMP Cloud | Proprietary, private source | Managed accounts and authorization, organizations, CMP Connect, authenticated external data sources, WebSocket streaming, agent presence and communication, work contracts and claims, session archives, retention and intelligence |
| CMP Web | Proprietary, private source | Website implementation; public website and documentation do not make its source public |

**CMP Connect is exclusively a CMP Cloud service.** It is not part of
self-hosted CMP Server. A record's manual evidence/source reference is
a Core field, not an external connector or permission to access a source.

**Managed authentication is exclusively CMP Cloud.** The self-hosted
development server may require a local operator bearer token and loopback
binding to prevent unrestricted access. This is not a bundled OAuth, tenant,
account, or organization identity service.

**WebSocket streaming, agent coordination, and session saving belong to
CMP Cloud.** They are not available in self-hosted CMP Server.

## Why some Cloud-related code appears in the public Client

Publishing an API *client* does not publish its server implementation.
The public SDK may include Cloud request schemas, endpoint adapters,
WebSocket consumers, agent host adapters, opt-in capture helpers and
capability checks so one SDK can communicate with Core or Cloud.

An SDK method does not imply a Cloud feature is deployed, accessible,
included in a subscription, or available on a self-hosted server.
Check server capabilities and authorization before using it.

These public client helpers do not grant permission to access unrelated
repositories, capture third-party sessions, or retrieve private sources.

## License boundary

Apache License 2.0 covers files in the three public repositories to
which the corresponding LICENSE file applies. It does **not** apply to
the private CMP Cloud or CMP Web source repositories, their internal
implementations, private credentials, data, service infrastructure or
third-party content accessed through a connector.

Public API compatibility does not create a right to reuse proprietary
Cloud source code or invoke private Cloud endpoints without authorization.
Third-party libraries remain under their respective licenses.

## Release safety

This source is a pre-alpha development reference, not production-certified
infrastructure. In particular, CMP Server binds to loopback and requires
CMP_ENV=development. Do not expose it directly to the public internet.
Running your own secure public server requires further security review.

Current operational implementation and capability availability are not
guaranteed by descriptions of planned Cloud functionality.

## Enterprise license and Core freedom

The planned CMP Enterprise Self-Hosted commercial add-on requires a signed CMP-issued license. It is distinct from Apache-2.0 Core, which never requires a paid license, license validation, or an online CMP account. Enterprise license requests carry minimal commercial/install metadata, never customer context content. Entitlement lapse must preserve Core reads and exports. Read [Enterprise Self-Hosted](enterprise-self-hosted.md).
