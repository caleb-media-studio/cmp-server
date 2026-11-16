# CMP Enterprise Self-Hosted: proprietary commercial extension

Status: planned product; not available as a production-ready installer yet.

CMP is offered in three distinct editions:

| Edition | Distribution | License |
| --- | --- | --- |
| CMP Core | Public protocol, Core server and SDKs | Apache-2.0 |
| CMP Enterprise Self-Hosted | Proprietary Enterprise add-ons on customer infrastructure | Paid CMP Enterprise license |
| CMP Cloud | Proprietary managed service | Hosted CMP subscription |

## Enterprise licensing

Enterprise installations will request activation from the CMP-operated
licensing service. CMP issues a signed, installation-bound entitlement
for approved paid features. Routine license renewal sends minimum contract,
installation and version metadata only, not customer context repositories,
source code, chat or agent sessions.

An approved offline-license workflow is planned for air-gapped customers.
Signed licenses are time-limited, with a bounded grace period during a
license service outage. An entitlement expiration must not destroy,
encrypt away or prevent export of customers' existing data.

**The Apache-2.0 CMP Core cannot be disabled or placed behind a paid license.**
Enterprise entitlements gate only proprietary Enterprise features.

## Potential Enterprise features, not shipped

Local Enterprise organization controls, customer IdP SSO/SCIM,
advanced RBAC, customer-managed keys, structured audit export,
retention and residency policy diagnostics. The customer's infrastructure
and operators remain responsible for the configured deployment.

Managed CMP Connect, WebSocket agent event streams, agent presence and
communication, work contracts and agent session archiving remain
**CMP Cloud only**, unless a future product decision changes this.

## Compliance and residency

CMP is designing for documented security controls, privacy,
contractual data residency and future SOC 2 Type II assessment.
None of the public CMP repositories is SOC 2 certified, an audited
GDPR-compliant service, or production-certified Enterprise software.
An EU-region setting alone does not prove GDPR or strict EU residency.

Production contracts, technical controls, vendor processing locations,
incident procedures, DPA/SCCs and independent assessments must be completed
before making customer-facing compliance commitments.

See the main product edition explanation:
[Public versus proprietary](public-vs-proprietary.md).
