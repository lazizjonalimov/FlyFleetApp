// The makes a fleet's trucks and trailers are most likely to be, in the order people look for them. Anything else
// is typed in under Other. Product reference data, not records.

export const TRUCK_MAKES = ["Freightliner", "Kenworth", "Peterbilt", "Volvo", "International", "Mack", "Western Star", "Hino", "Isuzu", "Ford", "Chevrolet", "GMC", "Ram", "Autocar", "Navistar"];

export const TRAILER_MAKES = ["Utility", "Wabash", "Great Dane", "Hyundai Translead", "Stoughton", "Vanguard", "Fontaine", "Manac", "Reitnouer", "Kentucky", "Wilson", "Polar", "Heil", "Trail King", "East"];

export const CDL_CLASSES: [code: string, label: string][] = [["A", "Class A"], ["B", "Class B"], ["C", "Class C"]];

export const ENDORSEMENTS: [code: string, label: string][] = [["H", "H · Hazardous materials"], ["N", "N · Tank vehicles"], ["T", "T · Double and triple trailers"], ["X", "X · Tank and hazmat"], ["P", "P · Passenger"], ["S", "S · School bus"]];
