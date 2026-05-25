"""Parsers for each source type. Each parser takes a file-like object and tenant,
creates a DataSource, parses rows, normalizes units, flags anomalies, and creates EmissionRecords."""

import csv
import io
from datetime import datetime
from decimal import Decimal, InvalidOperation

from dateutil import parser as dateparser

from .models import DataSource, EmissionRecord, AuditLog


# --- Emission factors (kg CO2e per unit) ---
# Simplified but realistic factors from DEFRA/EPA
EMISSION_FACTORS = {
    'diesel_litre': Decimal('2.68'),       # kg CO2e/litre diesel
    'petrol_litre': Decimal('2.31'),       # kg CO2e/litre petrol
    'natural_gas_m3': Decimal('2.02'),     # kg CO2e/m³ natural gas
    'heating_oil_litre': Decimal('2.54'),  # kg CO2e/litre heating oil
    'electricity_kwh': Decimal('0.42'),    # kg CO2e/kWh (grid average, varies by region)
    'flight_km': Decimal('0.255'),         # kg CO2e/passenger-km (average)
    'flight_short_km': Decimal('0.156'),   # short-haul <500km
    'flight_medium_km': Decimal('0.131'),  # 500-3700km
    'flight_long_km': Decimal('0.115'),    # >3700km
    'hotel_night': Decimal('20.6'),        # kg CO2e/room-night (DEFRA)
    'car_km': Decimal('0.171'),            # kg CO2e/km average car
    'rail_km': Decimal('0.037'),           # kg CO2e/km rail
    'taxi_km': Decimal('0.210'),           # kg CO2e/km taxi
}

# Unit normalization maps
UNIT_MAP = {
    # Volume
    'l': 'litres', 'ltr': 'litres', 'litre': 'litres', 'litres': 'litres',
    'liter': 'litres', 'liters': 'litres',
    'gal': 'gallons', 'gallon': 'gallons', 'gallons': 'gallons',
    'm3': 'm3', 'm³': 'm3', 'cbm': 'm3',
    # Energy
    'kwh': 'kWh', 'kilowatthour': 'kWh', 'kilowatt-hour': 'kWh',
    'mwh': 'MWh', 'megawatthour': 'MWh',
    # Distance
    'km': 'km', 'kilometer': 'km', 'kilometers': 'km', 'kilometre': 'km',
    'mi': 'miles', 'mile': 'miles', 'miles': 'miles',
    # Mass
    'kg': 'kg', 'kilogram': 'kg', 'kilograms': 'kg',
    'mt': 'tonnes', 'tonne': 'tonnes', 'tonnes': 'tonnes', 't': 'tonnes',
}

# SAP German column header map
SAP_HEADER_MAP = {
    'Werk': 'plant_code',
    'Materialnummer': 'material_number',
    'Materialbezeichnung': 'material_description',
    'Menge': 'quantity',
    'Mengeneinheit': 'unit',
    'Buchungsdatum': 'posting_date',
    'Belegdatum': 'document_date',
    'Belegnummer': 'document_number',
    'Bewegungsart': 'movement_type',
    'Kostenstelle': 'cost_center',
    'Lieferant': 'vendor',
    # English variants
    'Plant': 'plant_code',
    'Material Number': 'material_number',
    'Material Description': 'material_description',
    'Quantity': 'quantity',
    'Unit of Measure': 'unit',
    'UoM': 'unit',
    'Posting Date': 'posting_date',
    'Document Date': 'document_date',
    'Document Number': 'document_number',
    'Movement Type': 'movement_type',
    'Cost Center': 'cost_center',
    'Vendor': 'vendor',
}

# SAP plant code lookup (simulated)
PLANT_LOOKUP = {
    '1000': 'Frankfurt HQ',
    '1100': 'Munich Plant',
    '2000': 'Hamburg Logistics',
    '3000': 'Berlin Office',
    'DE01': 'Düsseldorf',
    'US01': 'Houston TX',
}

# SAP material → fuel type mapping
MATERIAL_FUEL_MAP = {
    '50000001': ('diesel', 'litres', 'stationary_combustion', 1),
    '50000002': ('petrol', 'litres', 'mobile_combustion', 1),
    '50000003': ('natural_gas', 'm3', 'stationary_combustion', 1),
    '50000004': ('heating_oil', 'litres', 'stationary_combustion', 1),
}

# Airport distance lookup (simplified — great circle km between major airports)
AIRPORT_DISTANCES = {
    ('JFK', 'LHR'): 5539, ('LHR', 'JFK'): 5539,
    ('JFK', 'LAX'): 3983, ('LAX', 'JFK'): 3983,
    ('JFK', 'ORD'): 1188, ('ORD', 'JFK'): 1188,
    ('JFK', 'SFO'): 4139, ('SFO', 'JFK'): 4139,
    ('LHR', 'CDG'): 341, ('CDG', 'LHR'): 341,
    ('LHR', 'FRA'): 654, ('FRA', 'LHR'): 654,
    ('LHR', 'SIN'): 10871, ('SIN', 'LHR'): 10871,
    ('LAX', 'SFO'): 543, ('SFO', 'LAX'): 543,
    ('ORD', 'LAX'): 2802, ('LAX', 'ORD'): 2802,
    ('FRA', 'SIN'): 10261, ('SIN', 'FRA'): 10261,
    ('DEL', 'BOM'): 1148, ('BOM', 'DEL'): 1148,
    ('DEL', 'LHR'): 6717, ('LHR', 'DEL'): 6717,
    ('BOM', 'SIN'): 3911, ('SIN', 'BOM'): 3911,
}


def _normalize_unit(raw_unit):
    """Normalize a unit string to standard form."""
    key = raw_unit.strip().lower().replace(' ', '').replace('-', '')
    return UNIT_MAP.get(key, raw_unit.strip())


def _parse_decimal(value):
    """Parse a decimal from various formats (1.234,56 German or 1,234.56 US)."""
    if not value:
        return None
    s = str(value).strip().replace(' ', '')
    # German format: 1.234,56
    if ',' in s and '.' in s:
        if s.rindex(',') > s.rindex('.'):
            s = s.replace('.', '').replace(',', '.')
        else:
            s = s.replace(',', '')
    elif ',' in s:
        # Could be German decimal or US thousands
        parts = s.split(',')
        if len(parts) == 2 and len(parts[1]) != 3:
            s = s.replace(',', '.')
        else:
            s = s.replace(',', '')
    try:
        return Decimal(s)
    except InvalidOperation:
        return None


def _parse_date(value):
    """Parse dates from various formats including DD.MM.YYYY (SAP German)."""
    if not value:
        return None
    s = str(value).strip()
    # SAP German: DD.MM.YYYY
    for fmt in ['%d.%m.%Y', '%Y%m%d', '%d/%m/%Y', '%m/%d/%Y', '%Y-%m-%d']:
        try:
            return datetime.strptime(s, fmt).date()
        except ValueError:
            continue
    try:
        return dateparser.parse(s).date()
    except (ValueError, TypeError):
        return None


def _convert_gallons_to_litres(qty):
    return qty * Decimal('3.78541')


def _convert_miles_to_km(qty):
    return qty * Decimal('1.60934')


def _convert_mwh_to_kwh(qty):
    return qty * Decimal('1000')


def _get_flight_factor(distance_km):
    if distance_km < 500:
        return EMISSION_FACTORS['flight_short_km']
    elif distance_km < 3700:
        return EMISSION_FACTORS['flight_medium_km']
    else:
        return EMISSION_FACTORS['flight_long_km']


def _flag_anomalies(record_data):
    """Return list of flag strings for suspicious data."""
    flags = []
    qty = record_data.get('quantity')
    if qty and qty < 0:
        flags.append('negative_quantity')
    if qty and qty == 0:
        flags.append('zero_quantity')
    if record_data.get('category', '').startswith('business_travel_air'):
        if qty and qty > 20000:
            flags.append('unusually_high_distance')
    if record_data.get('category') == 'purchased_electricity':
        if qty and qty > 500000:
            flags.append('unusually_high_consumption')
    if record_data.get('unit') == '' or record_data.get('unit') is None:
        flags.append('missing_unit')
    return flags


def parse_sap_file(file_obj, tenant, user=None):
    """Parse SAP flat file export (tab or semicolon delimited).
    
    SAP MM/FI exports via SE16/LSMW typically produce semicolon-delimited files
    with German headers. We handle both German and English column names.
    """
    content = file_obj.read()
    if isinstance(content, bytes):
        # Try UTF-8, fall back to latin-1 (common for SAP exports)
        try:
            text = content.decode('utf-8')
        except UnicodeDecodeError:
            text = content.decode('latin-1')
    else:
        text = content

    # Detect delimiter
    first_line = text.split('\n')[0]
    if '\t' in first_line:
        delimiter = '\t'
    elif ';' in first_line:
        delimiter = ';'
    else:
        delimiter = ','

    reader = csv.DictReader(io.StringIO(text), delimiter=delimiter)

    ds = DataSource.objects.create(
        tenant=tenant,
        source_type='sap_fuel',
        file_name=file_obj.name if hasattr(file_obj, 'name') else 'sap_upload.csv',
        uploaded_by=user,
        status='processed',
    )

    records_created = 0
    errors = 0

    for row_num, row in enumerate(reader, start=2):
        try:
            # Normalize headers
            normalized = {}
            for key, val in row.items():
                mapped = SAP_HEADER_MAP.get(key.strip(), key.strip().lower().replace(' ', '_'))
                normalized[mapped] = val.strip() if val else ''

            # Parse fields
            raw_qty = normalized.get('quantity', '')
            qty = _parse_decimal(raw_qty)
            raw_unit = normalized.get('unit', '')
            norm_unit = _normalize_unit(raw_unit)
            posting_date = _parse_date(normalized.get('posting_date', ''))
            plant = normalized.get('plant_code', '')
            material = normalized.get('material_number', '')
            description = normalized.get('material_description', '')

            if qty is None or posting_date is None:
                errors += 1
                continue

            # Determine fuel type from material number
            fuel_info = MATERIAL_FUEL_MAP.get(material)
            if fuel_info:
                fuel_type, std_unit, category, scope = fuel_info
            else:
                # Infer from description
                desc_lower = description.lower()
                if 'diesel' in desc_lower:
                    fuel_type, std_unit, category, scope = 'diesel', 'litres', 'stationary_combustion', 1
                elif 'petrol' in desc_lower or 'gasoline' in desc_lower or 'benzin' in desc_lower:
                    fuel_type, std_unit, category, scope = 'petrol', 'litres', 'mobile_combustion', 1
                elif 'gas' in desc_lower and 'natur' in desc_lower or 'erdgas' in desc_lower:
                    fuel_type, std_unit, category, scope = 'natural_gas', 'm3', 'stationary_combustion', 1
                elif 'heiz' in desc_lower or 'heating' in desc_lower:
                    fuel_type, std_unit, category, scope = 'heating_oil', 'litres', 'stationary_combustion', 1
                else:
                    fuel_type, std_unit, category, scope = 'diesel', 'litres', 'purchased_goods', 3

            # Unit conversion
            if norm_unit == 'gallons':
                qty = _convert_gallons_to_litres(qty)
                norm_unit = 'litres'

            # Emission factor
            factor_key = f"{fuel_type}_{std_unit}"
            ef = EMISSION_FACTORS.get(factor_key, Decimal('0'))
            co2e = qty * ef

            facility_name = PLANT_LOOKUP.get(plant, plant)

            rec_data = {
                'quantity': qty, 'unit': norm_unit, 'category': category,
            }
            flags = _flag_anomalies(rec_data)

            record = EmissionRecord.objects.create(
                tenant=tenant,
                data_source=ds,
                scope=scope,
                category=category,
                activity_date=posting_date,
                quantity=qty,
                unit=std_unit,
                emission_factor=ef,
                co2e_kg=co2e,
                raw_quantity=raw_qty,
                raw_unit=raw_unit,
                raw_row_number=row_num,
                raw_data=dict(row),
                facility=facility_name,
                description=description,
                flags=flags,
                review_status='flagged' if flags else 'pending',
            )
            AuditLog.objects.create(record=record, action='created', performed_by=user,
                                   details={'source': 'sap_flat_file', 'row': row_num})
            records_created += 1

        except Exception:
            errors += 1

    ds.row_count = records_created
    ds.error_count = errors
    ds.save()
    return ds


def parse_utility_file(file_obj, tenant, user=None):
    """Parse utility portal CSV export for electricity consumption.
    
    Typical utility portal exports contain: account number, meter ID,
    read date, consumption, unit, billing period, tariff, cost.
    """
    content = file_obj.read()
    if isinstance(content, bytes):
        try:
            text = content.decode('utf-8')
        except UnicodeDecodeError:
            text = content.decode('latin-1')
    else:
        text = content

    reader = csv.DictReader(io.StringIO(text))

    ds = DataSource.objects.create(
        tenant=tenant,
        source_type='utility',
        file_name=file_obj.name if hasattr(file_obj, 'name') else 'utility_upload.csv',
        uploaded_by=user,
        status='processed',
    )

    records_created = 0
    errors = 0

    for row_num, row in enumerate(reader, start=2):
        try:
            # Flexible header matching
            norm = {k.strip().lower().replace(' ', '_').replace('#', ''): v.strip() for k, v in row.items() if k}

            raw_qty = (norm.get('consumption') or norm.get('usage') or
                       norm.get('kwh') or norm.get('consumption_(kwh)') or
                       norm.get('total_kwh') or '')
            qty = _parse_decimal(raw_qty)

            raw_unit = (norm.get('unit') or norm.get('uom') or 'kWh')
            norm_unit = _normalize_unit(raw_unit)

            read_date = _parse_date(
                norm.get('read_date') or norm.get('billing_date') or
                norm.get('date') or norm.get('meter_read_date') or ''
            )
            period_start = _parse_date(norm.get('period_start') or norm.get('billing_period_start') or '')
            period_end = _parse_date(norm.get('period_end') or norm.get('billing_period_end') or '')

            meter_id = norm.get('meter_id') or norm.get('meter') or norm.get('meter_number') or ''
            account = norm.get('account') or norm.get('account_number') or norm.get('account_no') or ''
            facility = norm.get('facility') or norm.get('site') or norm.get('location') or ''
            tariff = norm.get('tariff') or norm.get('rate_schedule') or ''

            if qty is None or read_date is None:
                errors += 1
                continue

            # Convert MWh to kWh
            if norm_unit == 'MWh':
                qty = _convert_mwh_to_kwh(qty)
                norm_unit = 'kWh'

            ef = EMISSION_FACTORS['electricity_kwh']
            co2e = qty * ef

            rec_data = {'quantity': qty, 'unit': norm_unit, 'category': 'purchased_electricity'}
            flags = _flag_anomalies(rec_data)

            record = EmissionRecord.objects.create(
                tenant=tenant,
                data_source=ds,
                scope=2,
                category='purchased_electricity',
                activity_date=read_date,
                period_start=period_start,
                period_end=period_end,
                quantity=qty,
                unit='kWh',
                emission_factor=ef,
                co2e_kg=co2e,
                raw_quantity=raw_qty,
                raw_unit=raw_unit,
                raw_row_number=row_num,
                raw_data=dict(row),
                facility=facility or f"Meter {meter_id}",
                description=f"Account {account}, Tariff: {tariff}",
                flags=flags,
                review_status='flagged' if flags else 'pending',
            )
            AuditLog.objects.create(record=record, action='created', performed_by=user,
                                   details={'source': 'utility_csv', 'row': row_num})
            records_created += 1

        except Exception:
            errors += 1

    ds.row_count = records_created
    ds.error_count = errors
    ds.save()
    return ds


def parse_travel_file(file_obj, tenant, user=None):
    """Parse corporate travel platform CSV export (Concur/Navan style).
    
    Typical fields: booking ref, traveler, travel date, category (air/hotel/car/rail),
    origin, destination, distance, cost, currency.
    """
    content = file_obj.read()
    if isinstance(content, bytes):
        try:
            text = content.decode('utf-8')
        except UnicodeDecodeError:
            text = content.decode('latin-1')
    else:
        text = content

    reader = csv.DictReader(io.StringIO(text))

    ds = DataSource.objects.create(
        tenant=tenant,
        source_type='travel',
        file_name=file_obj.name if hasattr(file_obj, 'name') else 'travel_upload.csv',
        uploaded_by=user,
        status='processed',
    )

    records_created = 0
    errors = 0

    for row_num, row in enumerate(reader, start=2):
        try:
            norm = {k.strip().lower().replace(' ', '_'): v.strip() for k, v in row.items() if k}

            travel_date = _parse_date(
                norm.get('travel_date') or norm.get('departure_date') or
                norm.get('date') or norm.get('check_in_date') or ''
            )
            category_raw = (norm.get('category') or norm.get('travel_type') or
                            norm.get('expense_type') or '').lower()
            origin = norm.get('origin') or norm.get('departure') or norm.get('from') or ''
            destination = norm.get('destination') or norm.get('arrival') or norm.get('to') or ''
            distance_raw = norm.get('distance') or norm.get('distance_km') or norm.get('miles') or ''
            nights = norm.get('nights') or norm.get('number_of_nights') or ''
            traveler = norm.get('traveler') or norm.get('employee') or norm.get('passenger') or ''

            if travel_date is None:
                errors += 1
                continue

            # Determine category and compute emissions
            if 'air' in category_raw or 'flight' in category_raw or 'fly' in category_raw:
                emission_cat = 'business_travel_air'
                scope = 3

                # Try to get distance from airport codes
                distance = _parse_decimal(distance_raw)
                if distance is None and origin and destination:
                    origin_code = origin.upper().strip()
                    dest_code = destination.upper().strip()
                    distance = AIRPORT_DISTANCES.get((origin_code, dest_code))
                    if distance:
                        distance = Decimal(str(distance))

                if distance is None:
                    distance = Decimal('1000')  # Default assumption, flag it
                    flags_extra = ['distance_estimated']
                else:
                    flags_extra = []

                # Check if distance was in miles
                unit_raw = norm.get('distance_unit') or norm.get('unit') or 'km'
                if 'mi' in unit_raw.lower():
                    distance = _convert_miles_to_km(distance)

                ef = _get_flight_factor(float(distance))
                co2e = distance * ef
                qty = distance
                unit = 'km'

            elif 'hotel' in category_raw or 'lodging' in category_raw or 'accommodation' in category_raw:
                emission_cat = 'business_travel_hotel'
                scope = 3
                n = _parse_decimal(nights)
                if n is None:
                    n = Decimal('1')
                    flags_extra = ['nights_estimated']
                else:
                    flags_extra = []
                ef = EMISSION_FACTORS['hotel_night']
                co2e = n * ef
                qty = n
                unit = 'room-nights'

            elif 'car' in category_raw or 'taxi' in category_raw or 'ground' in category_raw or 'rental' in category_raw:
                emission_cat = 'business_travel_ground'
                scope = 3
                distance = _parse_decimal(distance_raw)
                if distance is None:
                    distance = Decimal('50')
                    flags_extra = ['distance_estimated']
                else:
                    flags_extra = []

                unit_raw = norm.get('distance_unit') or norm.get('unit') or 'km'
                if 'mi' in unit_raw.lower():
                    distance = _convert_miles_to_km(distance)

                if 'taxi' in category_raw:
                    ef = EMISSION_FACTORS['taxi_km']
                else:
                    ef = EMISSION_FACTORS['car_km']
                co2e = distance * ef
                qty = distance
                unit = 'km'

            elif 'rail' in category_raw or 'train' in category_raw:
                emission_cat = 'business_travel_ground'
                scope = 3
                distance = _parse_decimal(distance_raw)
                if distance is None:
                    distance = Decimal('200')
                    flags_extra = ['distance_estimated']
                else:
                    flags_extra = []
                ef = EMISSION_FACTORS['rail_km']
                co2e = distance * ef
                qty = distance
                unit = 'km'

            else:
                errors += 1
                continue

            rec_data = {'quantity': qty, 'unit': unit, 'category': emission_cat}
            flags = _flag_anomalies(rec_data) + flags_extra

            record = EmissionRecord.objects.create(
                tenant=tenant,
                data_source=ds,
                scope=scope,
                category=emission_cat,
                activity_date=travel_date,
                quantity=qty,
                unit=unit,
                emission_factor=ef,
                co2e_kg=co2e,
                raw_quantity=distance_raw or nights,
                raw_unit=norm.get('distance_unit', ''),
                raw_row_number=row_num,
                raw_data=dict(row),
                facility='',
                description=f"{traveler}: {origin} → {destination}" if origin else traveler,
                flags=flags,
                review_status='flagged' if flags else 'pending',
            )
            AuditLog.objects.create(record=record, action='created', performed_by=user,
                                   details={'source': 'travel_csv', 'row': row_num})
            records_created += 1

        except Exception:
            errors += 1

    ds.row_count = records_created
    ds.error_count = errors
    ds.save()
    return ds


PARSERS = {
    'sap_fuel': parse_sap_file,
    'utility': parse_utility_file,
    'travel': parse_travel_file,
}
