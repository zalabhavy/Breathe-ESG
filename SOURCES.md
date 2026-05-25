# Sources

For each data source: what real-world format I researched, what I learned, what my sample data looks like and why, and what would break in a real deployment.

---

## 1. SAP — Fuel & Procurement

### What I researched

SAP provides multiple data extraction methods:
- **SE16/SE16N** — direct table browser exports (flat files)
- **LSMW** — Legacy System Migration Workbench exports
- **IDocs** — Intermediate Documents for EDI (event-driven, XML-like)
- **OData** — RESTful APIs via SAP Gateway (S/4HANA)
- **BAPIs/RFCs** — function-level programmatic access
- **ABAP reports** — custom reports exported to CSV/Excel

I chose **SE16 flat file export** because it's the most common extraction method for ad-hoc data pulls. When a PM says "data sitting in SAP," they almost always mean someone needs to run a report and export it.

### What I learned

- SAP's default delimiter is **semicolon** (not comma), because German locale uses commas as decimal separators
- German number format: `2.500,00` means 2500.00
- Dates default to **DD.MM.YYYY** in German installations, but can also appear as YYYYMMDD (SAP internal format)
- Column headers depend on the user's language settings — the same table might export as "Werk" (German) or "Plant" (English)
- **Material numbers** are the key to identifying what was purchased. SAP's MM module uses material master records where `50000001` might be "Diesel Kraftstoff"
- **Movement types** indicate what happened: 101 = goods receipt, 102 = reversal. Reversals produce negative quantities
- **Plant codes** are arbitrary (1000, 1100, DE01) and meaningless without a lookup table

### My sample data

The file `sample_data/sap_fuel_export.csv` contains 12 rows that exercise realistic edge cases:

| Row | What it tests |
|-----|---------------|
| 1-2 | Normal diesel consumption at Frankfurt HQ, German number format (2.500,00) |
| 3-4 | Petrol (Benzin) at Munich Plant |
| 5-6 | Natural gas (Erdgas) in cubic meters |
| 7 | Heating oil |
| 8 | **Zero quantity** — should be flagged |
| 9 | **Negative quantity** — SAP reversal (movement type 102) |
| 10 | **Gallons instead of litres** — US plant data mixed into German export |
| 11 | English column values with a DE01 plant code |
| 12 | US plant with US date format (YYYY-MM-DD) |

### What would break in production

- **Thousands of material numbers** that don't map to known fuel types. My hardcoded mapping handles 4 materials; a real client might have 50,000+ materials, most of which aren't fuels.
- **Multiple SAP systems** (one per business unit) with different configurations, different material numbering, different plant codes.
- **Custom fields** (Z-fields) that the client added to their SAP installation. My parser would silently ignore them.
- **Character encoding** — SAP can export in Latin-1, UTF-8, or even EBCDIC depending on the system. My parser tries UTF-8 then falls back to Latin-1, but EBCDIC would fail.

---

## 2. Utility — Electricity

### What I researched

- **Utility portals** (E.ON, RWE, EnBW, EDF, US utilities) typically offer CSV or Excel downloads of consumption history
- **Green Button** (ESPI/NAESB) is a US standard for energy data exchange — XML-based, rarely used in practice by facilities teams
- **PDF bills** are the most common format but require OCR
- **Interval data** (15-minute or hourly readings) is available from smart meters but produces enormous files
- **Billing period data** (monthly reads) is what facilities teams typically work with

I chose **portal CSV export** because it's what a facilities manager actually downloads. They log into the utility portal, select a date range, and click "Export."

### What I learned

- Billing periods **don't align with calendar months**. A "January" bill might cover Dec 16 to Jan 15, depending on the meter read schedule
- **Multiple meters per site** — a factory might have 5 meters (main, HVAC, lighting, process, backup)
- **Units vary** — small sites report in kWh, large industrial sites might report in MWh
- **Tariff structures** affect cost but not consumption or emissions. However, some tariffs indicate renewable energy content (green tariffs), which matters for market-based Scope 2
- **Estimated vs. actual reads** — utilities sometimes estimate consumption when they can't read the meter. These should be flagged

### My sample data

The file `sample_data/utility_electricity.csv` contains 10 rows:

| Row | What it tests |
|-----|---------------|
| 1-3 | Frankfurt HQ with two meters, calendar-aligned billing periods |
| 4-5 | Munich Plant with **non-calendar billing periods** (mid-month to mid-month) |
| 6 | Hamburg in **MWh** instead of kWh — tests unit conversion |
| 7-8 | Berlin Office, small consumption |
| 9 | Düsseldorf Warehouse with **unusually high consumption** (620,000 kWh) — should flag |
| 10 | **Zero consumption** — empty building or meter error |

### What would break in production

- **Hundreds of utility accounts** across different providers, each with different CSV column names and formats
- **Meter replacements** — when a meter is swapped, the numbering changes and there's a gap in data
- **Estimated reads** — the CSV doesn't always indicate whether a read is actual or estimated
- **Solar/on-site generation** — some meters show net consumption (grid draw minus solar export), which can be negative
- **Time-of-use data** — some exports break consumption into peak/off-peak, requiring aggregation

---

## 3. Corporate Travel — Flights, Hotels, Ground Transport

### What I researched

- **SAP Concur** — market leader, offers CSV/Excel export from the reporting module. API v4 requires partner certification
- **Navan (formerly TripActions)** — similar CSV export capabilities
- **Standard export fields** — booking reference, traveler name, travel date, expense category, origin/destination, cost
- **IATA airport codes** — 3-letter codes (JFK, LHR, FRA) are standard in travel systems
- **Distance data** — travel platforms store airport codes, not distances. Distance must be calculated from great-circle distance between airports

### What I learned

- **Concur's export** categorizes expenses as Air, Hotel, Car Rental, Rail, Taxi, etc. The category determines which emission factor to use
- **Distances are often missing** from exports. Concur stores origin/destination airport codes but doesn't compute distances. You need an airport database or API for that
- **Cabin class** significantly affects emissions (business class ≈ 2x economy due to seat area allocation), but it's not always in the export
- **Hotel emissions** are calculated per room-night, not per guest. DEFRA provides country-specific factors
- **Ground transport** varies widely — rental car, taxi, ride-share, rail all have different factors
- **Multi-leg flights** might appear as one booking with multiple rows, or as separate bookings. There's no standard

### My sample data

The file `sample_data/corporate_travel.csv` contains 18 rows covering realistic travel patterns:

| Rows | What they test |
|------|---------------|
| 1-3 | Round-trip Frankfurt→London with hotel stay, **no distance values** (relies on airport code lookup FRA↔LHR) |
| 4-7 | Transatlantic Frankfurt→New York trip: flight, taxi, hotel, return flight |
| 8-10 | Long-haul Singapore→London with 5-night hotel stay |
| 11-12 | Domestic rail travel (Frankfurt→Munich) + hotel — tests rail emission factor |
| 13-15 | US domestic flights (JFK→LAX) with **distances in miles** — tests unit conversion |
| 16-18 | India domestic flights (DEL→BOM) — tests shorter distances and different airport pairs |

### What would break in production

- **Missing airport codes** — some bookings might have city names instead of IATA codes. My airport distance lookup requires exact 3-letter codes
- **Multi-leg itineraries** — a booking FRA→LHR→JFK would need to be split into two flight segments, each with its own distance and emission factor
- **Cabin class differentiation** — I use a single average emission factor per distance tier. Business class should be ~2x
- **Personal travel mixed in** — some companies allow personal bookings through Concur. These shouldn't be in the corporate emissions inventory
- **Travel agency bookings** — not all bookings go through Concur. Some employees book directly with airlines or hotels
- **Rail vs. air substitution** — European short-haul flights that could have been rail trips. Some companies want to flag these for policy compliance
