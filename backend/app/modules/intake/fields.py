"""What is read from each kind of document, and how each value is written: the same list drives the built-in PDF
reader, the photo reader's instructions and the review screen."""
from dataclasses import dataclass


@dataclass(frozen=True)
class Field:
    key: str
    label: str
    # text | date (YYYY-MM-DD) | money (1234.56) | int | state (two letters) | vin | list (comma separated)
    type: str = "text"
    # Where the label usually reads on the document, for the built-in reader of text PDFs.
    labels: tuple[str, ...] = ()


KINDS: dict[str, tuple[str, list[Field]]] = {
    "cdl": ("Commercial driver's license", [
        Field("first_name", "First name", labels=("first name", "first", "given name")),
        Field("last_name", "Last name", labels=("last name", "last", "surname", "family name")),
        Field("cdl_number", "CDL number", labels=("dl no", "license no", "license number", "dl number", "lic no")),
        Field("cdl_state", "CDL state", "state", labels=("state", "issued by")),
        Field("cdl_class", "Class", labels=("class",)),
        Field("endorsements", "Endorsements", "list", labels=("end", "endorsements", "endorse")),
        Field("restrictions", "Restrictions", "list", labels=("rest", "restrictions", "restr")),
        Field("cdl_expiry", "Expires", "date", labels=("exp", "expires", "expiration")),
        Field("date_of_birth", "Date of birth", "date", labels=("dob", "date of birth", "birth date")),
        Field("address", "Address", labels=("address",)),
    ]),
    "registration": ("Vehicle registration", [
        Field("vin", "VIN", "vin", labels=("vin", "vehicle identification number", "vehicle id no")),
        Field("plate", "Plate", labels=("plate", "plate no", "plate number", "license plate", "tag")),
        Field("plate_state", "Plate state", "state", labels=("state", "jurisdiction", "registration state")),
        Field("registration_expiry", "Plate expires", "date",
              labels=("expires", "expiration", "exp", "valid through", "valid thru")),
        Field("year", "Year", "int", labels=("year", "model year", "yr")),
        Field("make", "Make", labels=("make",)),
        Field("model", "Model", labels=("model", "model / body", "model body")),
        Field("body", "Body", labels=("body", "body type")),
        Field("gvwr", "GVWR", "int", labels=("gvwr", "gross vehicle weight", "gvw", "declared gross weight")),
        Field("registered_owner", "Registered owner", labels=("registered owner", "registrant", "owner")),
    ]),
    "rate_confirmation": ("Rate confirmation", [
        Field("customer_name", "Customer", labels=("broker", "bill to", "customer", "shipper of record")),
        Field("reference", "Reference", labels=("load #", "load number", "load no", "reference #", "reference no",
                                                "ref #", "pro #", "order #", "confirmation #", "shipment #", "trip #")),
        Field("rate_total", "Total rate", "money",
              labels=("total carrier pay", "total rate", "total pay", "total", "agreed rate", "rate")),
        Field("line_haul", "Line haul", "money", labels=("line haul", "linehaul", "flat rate", "base rate")),
        Field("fuel_surcharge", "Fuel surcharge", "money", labels=("fuel surcharge", "fsc")),
        Field("pickup_name", "Pickup", labels=("shipper", "pickup", "pick up", "origin")),
        Field("pickup_city", "Pickup city"),
        Field("pickup_state", "Pickup state", "state"),
        Field("pickup_date", "Pickup date", "date", labels=("pickup date", "pick up date", "ship date")),
        Field("delivery_name", "Delivery", labels=("consignee", "receiver", "delivery", "destination", "drop")),
        Field("delivery_city", "Delivery city"),
        Field("delivery_state", "Delivery state", "state"),
        Field("delivery_date", "Delivery date", "date", labels=("delivery date", "deliver by", "due date")),
        Field("commodity", "Commodity", labels=("commodity", "description")),
        Field("weight_lbs", "Weight (lb)", "int", labels=("weight", "wt")),
        Field("equipment_type", "Equipment", labels=("equipment", "trailer type", "equipment type")),
        Field("miles", "Miles", "int", labels=("miles", "distance")),
    ]),
    "pod": ("Proof of delivery", [
        Field("reference", "Load or reference", labels=("load #", "load number", "reference #", "pro #", "bol #",
                                                         "bill of lading", "order #", "shipment #")),
        Field("delivered_on", "Delivered", "date", labels=("delivered", "delivery date", "date received", "received", "date")),
        Field("receiver_name", "Receiver", labels=("consignee", "receiver", "ship to")),
        Field("signed_by", "Signed by", labels=("received by", "signed by", "signature", "print name")),
        Field("pieces", "Pieces", "int", labels=("pieces", "pcs", "cartons", "pallets", "qty")),
        Field("weight_lbs", "Weight (lb)", "int", labels=("weight", "wt")),
        Field("exceptions", "Exceptions", labels=("exceptions", "shortage", "damage", "over short damage", "os&d")),
        Field("detention", "Detention", "money", labels=("detention",)),
        Field("lumper", "Lumper", "money", labels=("lumper", "unloading")),
    ]),
    "inspection_report": ("Roadside inspection report", [
        Field("report_number", "Report number", labels=("report number", "report no", "report #", "inspection report")),
        Field("inspected_on", "Inspected", "date", labels=("inspection date", "date")),
        Field("level", "Level", labels=("level", "inspection level")),
        Field("state", "State", "state", labels=("state",)),
        Field("location", "Location", labels=("location", "highway", "address")),
        Field("driver_name", "Driver", labels=("driver", "driver name")),
        Field("driver_license", "Driver's license", labels=("license", "license no", "cdl")),
        Field("truck_plate", "Truck plate", labels=("plate", "license plate", "unit 1 plate")),
        Field("truck_vin", "Truck VIN", "vin", labels=("vin",)),
        Field("trailer_plate", "Trailer plate", labels=("unit 2 plate", "trailer plate")),
        Field("out_of_service", "Out of service", labels=("out of service", "oos")),
        Field("inspector", "Inspector", labels=("inspector", "officer", "badge")),
    ]),
    "fuel_receipt": ("Fuel receipt", [
        Field("vendor", "Station", labels=("station", "merchant", "location")),
        Field("city", "City"),
        Field("state", "State", "state", labels=("state",)),
        Field("purchased_on", "Date", "date", labels=("date", "trans date", "transaction date")),
        Field("gallons", "Gallons", labels=("gallons", "gal", "qty", "quantity", "volume")),
        Field("price_per_gallon", "Price per gallon", "money", labels=("price/gal", "ppg", "unit price", "price")),
        Field("total", "Total", "money", labels=("total", "amount", "total sale", "fuel total")),
        Field("def_gallons", "DEF gallons", labels=("def",)),
        Field("unit_number", "Truck", labels=("unit", "truck", "tractor", "vehicle")),
        Field("card_last4", "Card", labels=("card", "card no", "card number")),
    ]),
}

DOCUMENT_TYPE = {"cdl": "license", "registration": "registration", "rate_confirmation": "rate_confirmation",
                 "pod": "pod", "inspection_report": "inspection", "fuel_receipt": "receipt"}


def keys_of(kind: str) -> list[str]:
    return [f.key for f in KINDS[kind][1]]
