# Data Model — Breathe ESG Ingestion Platform

## Overview

The data model handles four concerns:

1. **Multi-tenancy** — every row belongs to a `Tenant`
2. **Source-of-truth tracking** — every row links back to its `DataSource` and preserves the raw original data
3. **Normalized emission records** — a single `EmissionRecord` schema that all three source types normalize into
4. **Audit trail** — an append-only `AuditLog` for every action taken on a record

## Entity Relationship

```
Tenant (1) ──→ (N) DataSource (1) ──→ (N) EmissionRecord (1) ──→ (N) AuditLog
                                              ↑
                                         User (reviewer)
```

## Tables

### Tenant
| Field | Type | Purpose |
|-------|------|---------|
| id | UUID (PK) | Stable identifier, no sequential leakage |
| name | varchar(255) | Client company name |
| created_at | datetime | When the tenant was onboarded |

**Why multi-tenancy at the row level?** For a prototype, row-level tenant isolation (foreign key on every table) is the right trade-off. It's simple, works with a single database, and makes queries straightforward. In production you might consider schema-per-tenant (PostgreSQL schemas) for stronger isolation, but that adds operational complexity we don't need here.

### DataSource
| Field | Type | Purpose |
|-------|------|---------|
| id | UUID (PK) | |
| tenant | FK → Tenant | Ownership |
| source_type | enum | `sap_fuel`, `utility`, `travel` |
| file_name | varchar(500) | Original filename for traceability |
| uploaded_by | FK → User (nullable) | Who uploaded it |
| uploaded_at | datetime | When |
| status | enum | `pending`, `processed`, `failed` |
| row_count | int | How many records were successfully created |
| error_count | int | How many rows failed parsing |
| raw_file | FileField | The original file, preserved for audit |

**Why track the source file?** Auditors need to trace any number back to the original document. If a record says "2,500 litres of diesel", they need to see which SAP export that came from, which row, and what the original values looked like before normalization.

### EmissionRecord (core table)
| Field | Type | Purpose |
|-------|------|---------|
| id | UUID (PK) | |
| tenant | FK → Tenant | |
| data_source | FK → DataSource | Which ingestion batch produced this |
| **Classification** | | |
| scope | int (1/2/3) | GHG Protocol scope |
| category | enum | Specific emission category (stationary combustion, purchased electricity, business travel air, etc.) |
| **Temporal** | | |
| activity_date | date | The date of the activity |
| period_start | date (nullable) | For utility data: billing period start |
| period_end | date (nullable) | For utility data: billing period end |
| **Normalized values** | | |
| quantity | decimal(16,4) | Quantity in the normalized unit |
| unit | varchar(30) | Normalized unit (kWh, litres, km, etc.) |
| emission_factor | decimal(12,6) | kg CO₂e per unit, from DEFRA/EPA factors |
| co2e_kg | decimal(16,4) | Computed: quantity × emission_factor |
| **Raw / source-of-truth** | | |
| raw_quantity | varchar(100) | Original value as string (e.g., "2.500,00") |
| raw_unit | varchar(50) | Original unit (e.g., "L", "GAL", "m³") |
| raw_row_number | int | Row number in the source file |
| raw_data | JSON | Complete original row as key-value pairs |
| **Location** | | |
| facility | varchar(255) | Plant name, meter location, etc. |
| description | varchar(500) | Human-readable context |
| **Review workflow** | | |
| review_status | enum | `pending`, `approved`, `flagged`, `rejected` |
| reviewed_by | FK → User (nullable) | |
| reviewed_at | datetime (nullable) | |
| review_notes | text | Analyst's notes |
| is_locked | boolean | Once approved, record is immutable |
| **Anomaly detection** | | |
| flags | JSON (list) | Auto-detected issues: `negative_quantity`, `zero_quantity`, `distance_estimated`, `unusually_high_consumption`, etc. |
| **Timestamps** | | |
| created_at | datetime | |
| updated_at | datetime | |

**Key design decisions:**

1. **Single table for all emission types.** All three source types normalize into the same `EmissionRecord`. This is deliberate: the analyst review dashboard needs to show a unified view. The alternative — separate tables per source — would make the review UI, reporting, and aggregation significantly more complex for no real benefit. The `category` field distinguishes emission types, and `raw_data` preserves source-specific fields.

2. **raw_data as JSON.** Each source has different columns (SAP has Werk/Belegnummer, utility has Meter ID/Tariff, travel has Origin/Destination). Rather than modeling every possible source field as a column, we store the complete original row as JSON. This preserves full audit traceability without schema explosions.

3. **Scope assignment is deterministic.** SAP fuel → Scope 1 (direct combustion). Utility electricity → Scope 2 (purchased energy). Travel → Scope 3 (value chain). This follows GHG Protocol. The `category` field provides finer granularity.

4. **is_locked for audit immutability.** Once a record is approved, `is_locked = True`. The application prevents any further edits. This is what auditors require — a point-in-time snapshot that cannot be modified after sign-off.

5. **flags as JSON list.** Anomaly flags are auto-populated during parsing. Examples: `negative_quantity` (SAP reversal rows), `distance_estimated` (travel records where we used airport code lookup instead of actual distance), `zero_quantity` (suspicious zero-value records). This gives analysts immediate visibility into what needs human attention.

### AuditLog
| Field | Type | Purpose |
|-------|------|---------|
| id | UUID (PK) | |
| record | FK → EmissionRecord | Which record this log entry is about |
| action | enum | `created`, `approved`, `flagged`, `rejected`, `edited`, `locked` |
| performed_by | FK → User (nullable) | |
| performed_at | datetime | |
| details | JSON | Contextual data (e.g., old/new values for edits, notes) |

**Why a separate audit log?** The `EmissionRecord.updated_at` only tells you the last change. For auditors, you need the full history: who created it, when, who reviewed it, what action they took, and any notes. This is append-only — rows are never deleted or modified.

## Indexes

- `(tenant, scope)` — dashboard aggregation queries
- `(tenant, review_status)` — "show me all pending records for this client"  
- `(data_source)` — "show me all records from this upload"

## What I'd add with more time

- **EmissionFactor table** — currently hardcoded in Python. In production, you'd want a versioned emission factor database (DEFRA publishes annual updates) with year, region, and source fields.
- **Facility/Site table** — to properly model plant locations with addresses, grid regions (for location-based Scope 2), and tenant relationships.
- **User roles** — analyst vs. auditor vs. admin, with row-level permissions.
- **Versioned records** — instead of `is_locked`, a proper version history where amendments create new versions linked to the original.
