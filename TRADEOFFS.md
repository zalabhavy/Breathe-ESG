# Tradeoffs

Three things I deliberately did not build, and why.

## 1. Real-time API integration with SAP, utilities, or Concur

**What it would be:** Instead of file uploads, the system would directly connect to SAP OData services, utility Green Button APIs, and Concur's v4 API to pull data automatically on a schedule.

**Why I didn't build it:** Each integration requires OAuth2/API key management, client-specific configuration (SAP system URLs, Concur company IDs, utility account credentials), error handling for rate limits and downtime, and webhook or polling infrastructure. That's weeks of work per integration, and it requires the client's IT team to be involved for credential provisioning. For an onboarding prototype, file upload achieves the same outcome — data gets into the system — without any of that complexity. The parser architecture I built (one parser function per source type, all producing the same `EmissionRecord`) makes it straightforward to add API-based ingestion later: you'd write a new parser that takes an API response instead of a file, with the same normalization logic.

**What I'd build next:** A Celery task queue with scheduled jobs that pull from configured API endpoints, parse the response using the same normalization pipeline, and create records. The `DataSource` model already has a `source_type` field that could distinguish "api_pull" from "file_upload."

## 2. User authentication and role-based access control

**What it would be:** Login system with three roles — **data admin** (can upload files), **analyst** (can review and approve records), **auditor** (read-only access to approved records and audit logs). Each role would see different UI elements and have different API permissions.

**Why I didn't build it:** Authentication adds significant surface area (login flow, password reset, session management, CSRF token handling between React and Django, token refresh logic) without advancing the core problem of data ingestion and review. The assignment's weight is 35% data model + 25% decisions + 20% source realism — none of which require auth. I spent that time making the parsers handle realistic edge cases (German number formatting, SAP plant code lookups, airport distance estimation) instead.

**What I'd build next:** Django REST Framework's SimpleJWT for token-based auth, a `TenantMembership` model linking users to tenants with roles, and `IsAnalyst`/`IsAuditor` permission classes on the viewsets. The `reviewed_by` and `uploaded_by` foreign keys on the models are already in place — they just need to be populated from `request.user` once auth exists.

## 3. Location-based vs. market-based Scope 2 calculation

**What it would be:** For electricity (Scope 2), the GHG Protocol requires companies to report using two methods: **location-based** (grid average emission factor for the region where electricity is consumed) and **market-based** (emission factor from the specific electricity supplier, adjusted for renewable energy certificates). My prototype only does location-based with a single global average factor (0.42 kg CO₂e/kWh).

**Why I didn't build it:** Proper location-based calculation requires a grid emission factor database (e.g., EPA eGRID for the US, EEA for Europe) mapped to facility locations. Market-based requires supplier-specific factors and REC/guarantee-of-origin tracking — data the client would need to provide separately. Both require a `Facility` model with geographic information (country, grid region) that I don't have. Using a single average factor is transparent (the factor is stored on every record) and produces directionally correct results. The analyst can see exactly what factor was used and flag records where a more specific factor should apply.

**What I'd build next:** A `GridRegion` model with annual emission factors sourced from EPA/EEA. Each `EmissionRecord` for Scope 2 would link to a grid region (derived from the facility's location). The system would calculate both location-based and market-based totals and let the analyst choose which to report.
