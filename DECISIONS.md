# Decisions

Every ambiguity I resolved, what I chose, why, and what I'd ask the PM.

## 1. SAP: Which export format?

**Decision:** Semicolon-delimited flat file (SE16/LSMW export), not IDoc, OData, or BAPI.

**Why:** SAP offers many data extraction paths. IDocs are event-driven (good for real-time integration, wrong for batch onboarding). OData services require SAP Gateway configuration that the client's IT team may not have set up. BAPIs require RFC connections. For an enterprise onboarding where the data "sits in SAP," the most realistic scenario is: someone in procurement runs a report in SE16 or MM60, exports it to a file, and emails it. That file is semicolon-delimited with German headers (SAP's default locale in DACH-region installations) and dates in DD.MM.YYYY format.

**What I handle:** Movement type 101 (goods receipt) rows with material numbers mapped to fuel types. German number formatting (1.234,56). German and English column headers. Plant codes resolved via a lookup table.

**What I'd ask the PM:**
- Which SAP modules are in scope? Just MM (procurement), or also FI (finance) and PM (plant maintenance)?
- Does the client use SAP S/4HANA or ECC? S/4HANA has better OData support.
- Can we get their actual SE16 export structure, or do we need to handle arbitrary column orderings?

## 2. SAP: What subset of fuel/procurement data?

**Decision:** Fuel consumption records only (diesel, petrol, natural gas, heating oil). Not all procurement.

**Why:** "Fuel and procurement" is enormous in SAP — it could mean tens of thousands of material categories. For Scope 1 emissions, what matters is fuel consumed for stationary combustion (boilers, generators) and mobile combustion (fleet vehicles). I map specific SAP material numbers to fuel types and fall back to description-based inference for unmapped materials.

**What I ignored:** Purchased goods and services (Scope 3 Category 1) — this would require supplier emission factors, spend-based calculations, and a mapping of SAP material groups to emission categories. That's a separate project.

## 3. Utility: Portal CSV export, not PDF or API

**Decision:** CSV file upload from a utility portal.

**Why:** In my research, most utilities (E.ON, RWE, EDF, US utilities via Green Button) offer CSV/Excel downloads from their online portals. PDF bills exist but require OCR — unreliable and out of scope for a 4-day prototype. Utility APIs (Green Button/ESPI) are standardized but rarely deployed. The realistic scenario is: the facilities manager logs into each utility portal monthly, downloads a CSV, and uploads it here.

**What I handle:** Meter ID, billing periods that don't align with calendar months (e.g., Dec 16 – Jan 15), multiple meters per site, kWh and MWh units, tariff names.

**What I'd ask the PM:**
- How many utility accounts does this client have? If it's 200+ meters, we need bulk upload support.
- Do they want location-based or market-based Scope 2? Location-based uses grid average factors; market-based uses supplier-specific factors. I default to location-based.
- Are there renewable energy certificates (RECs) or green tariffs to account for?

## 4. Travel: Concur-style CSV export, not API

**Decision:** CSV file upload mimicking a Concur/Navan expense report export.

**Why:** Concur's API (v4) requires OAuth2, SAP Concur partner certification, and client-specific configuration. Navan's API is similar. For onboarding, the realistic path is: the travel admin exports a report from Concur's reporting module as CSV. The fields map to their standard export format: booking ref, traveler name, travel date, expense category, origin/destination, distance.

**What I handle:**
- **Air travel:** When distance is missing (common — Concur stores airport codes, not distances), I look up distances from a built-in airport-pair table. I apply distance-tiered emission factors (short-haul vs. medium vs. long-haul, per DEFRA).
- **Hotels:** Room-nights with a per-night emission factor.
- **Ground transport:** Car rentals, taxis, rail — with different emission factors per mode.
- **Unit conversion:** Miles to kilometers for US-originated bookings.

**What I'd ask the PM:**
- Does the client use Concur, Navan, or something else? The export format differs.
- Do we need to handle cabin class (economy vs. business)? Business class has ~2x the emission factor.
- Are personal trips mixed in with business travel in their exports?

## 5. Ingestion mechanism: File upload for all three

**Decision:** All three sources use file upload (drag-and-drop or file picker).

**Why:** For an onboarding scenario, file upload is the right choice. The data already exists in files — SAP exports, utility portal downloads, Concur reports. Building API integrations would take weeks per source and require the client's IT involvement. File upload lets the sustainability lead start immediately. I'd build API pull later once the client relationship is established.

## 6. Emission factors: Hardcoded, not database-driven

**Decision:** Emission factors are constants in Python code, not a database table.

**Why:** For a prototype, hardcoded factors from DEFRA 2024/EPA eGRID are sufficient. The values are realistic (e.g., 2.68 kg CO₂e/litre diesel, 0.42 kg CO₂e/kWh grid average). In production, you'd want a versioned emission factor database with year, region, fuel type, and source fields.

## 7. Unit normalization: Convert everything to metric base units

**Decision:** All quantities normalize to: litres (fuel), kWh (electricity), km (distance), room-nights (hotels).

**Why:** Consistent units are essential for aggregation and comparison. The parser layer handles conversion (gallons→litres, miles→km, MWh→kWh) and stores both the raw and normalized values.

## 8. Authentication: Disabled for prototype

**Decision:** All API endpoints use `AllowAny` permission.

**Why:** The assignment scope is data ingestion and review, not user management. Adding authentication would take time away from the core features. In production, I'd use Django's built-in auth with token-based authentication (SimpleJWT) and role-based permissions (analyst can review, auditor can only view, admin can upload).

## 9. Anomaly flagging: Rule-based, not ML

**Decision:** Simple rule-based flags: negative quantities, zero values, estimated distances, unusually high consumption.

**Why:** These cover the most common data quality issues. ML-based anomaly detection (e.g., detecting a consumption spike relative to historical patterns) requires historical data we don't have yet. The flags are stored as a JSON list on each record, making it easy to add new flag types without schema changes.

## 10. Review workflow: Two-state (pending/approved) with flags

**Decision:** Records start as `pending` (or `flagged` if anomalies detected). Analysts can approve, flag, or reject. Approval locks the record.

**Why:** This matches the real auditor workflow: review everything, sign off on what's clean, escalate what's suspicious. The `is_locked` flag prevents post-approval modifications — critical for audit integrity.
