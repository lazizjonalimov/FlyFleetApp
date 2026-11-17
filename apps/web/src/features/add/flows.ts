// How each kind of record can be added: from a document (scan, check, save), by hand, or from a spreadsheet.
import { I } from "@/features/console/icons";
import type { DocumentType } from "@/lib/upload";

export type IntakeKind = "cdl" | "registration" | "rate_confirmation" | "pod" | "inspection_report" | "fuel_receipt";
export type ImportKind = "drivers" | "trucks" | "trailers";

export type Flow = {
  title: string;
  icon: string;
  /** The button that saves the record. */
  cta: string;
  scan: {
    intake: IntakeKind;
    doc: DocumentType;
    title: string;
    detail: string;
    reads: string[];
    slots: [title: string, detail: string][];
    tips: string[];
    note: string;
    /** Which record's documents the original is kept with. */
    keptWith: string;
  };
  manualDetail: string;
  /** A separate page does the manual entry (the guided new-load form). */
  manualScreen?: string;
  importKind?: ImportKind;
  plural: string;
};

export const FLOWS: Record<string, Flow> = {
  driver: {
    title: "Add a driver",
    icon: I.user,
    cta: "Create driver",
    plural: "drivers",
    importKind: "drivers",
    manualDetail: "Type the driver’s name, license and hire details into the form yourself.",
    scan: {
      intake: "cdl",
      doc: "license",
      title: "Scan the CDL",
      detail: "Take or upload a photo of the commercial driver license. We read it and fill in the profile; you check every field before anything is saved.",
      reads: ["Name", "License #", "Class", "Endorsements", "Expiry"],
      slots: [["Front of the CDL", "Required"], ["Back of the CDL", "Optional · endorsements and restrictions"]],
      tips: ["Lay the card flat with all four corners in the frame", "Tilt away from overhead lights so there’s no glare", "Front first; the back helps with endorsements"],
      note: "Drivers can also scan their own CDL in the driver app after you invite them.",
      keptWith: "qualification file",
    },
  },
  truck: {
    title: "Add a truck",
    icon: I.truck,
    cta: "Create truck",
    plural: "trucks",
    importKind: "trucks",
    manualDetail: "Type the unit number, VIN, plate and service details into the form yourself.",
    scan: {
      intake: "registration",
      doc: "registration",
      title: "Scan the registration",
      detail: "A photo or PDF of the cab card. We read the VIN, plate and expiry, then decode the VIN to double-check the year and make.",
      reads: ["VIN", "Plate", "Year · make · model", "Expiry"],
      slots: [["Registration or cab card", "Photo or PDF"]],
      tips: ["Get the whole card in the frame, VIN included", "Avoid glare on the plastic sleeve", "A PDF from the state portal reads best"],
      note: "The registration is saved to the truck’s documents and its expiry shows on Compliance.",
      keptWith: "truck’s documents",
    },
  },
  trailer: {
    title: "Add a trailer",
    icon: I.trailer,
    cta: "Create trailer",
    plural: "trailers",
    importKind: "trailers",
    manualDetail: "Type the unit number, type, VIN and plate into the form yourself.",
    scan: {
      intake: "registration",
      doc: "registration",
      title: "Scan the registration",
      detail: "A photo or PDF of the trailer registration. We read the VIN, plate and expiry and decode the VIN for the year and make.",
      reads: ["VIN", "Plate", "Type · year", "Expiry"],
      slots: [["Trailer registration", "Photo or PDF"]],
      tips: ["Get the whole document in the frame, VIN included", "Avoid glare and shadows across the text", "A PDF from the state portal reads best"],
      note: "The registration is saved to the trailer’s documents and its expiry shows on Compliance.",
      keptWith: "trailer’s documents",
    },
  },
  load: {
    title: "New load",
    icon: I.loads,
    cta: "Create draft load",
    plural: "loads",
    manualScreen: "newload",
    manualDetail: "Use the guided form for the customer, stops, rate and documents.",
    scan: {
      intake: "rate_confirmation",
      doc: "rate_confirmation",
      title: "From a rate confirmation",
      detail: "Upload the rate con PDF or snap a photo. We fill in the customer, reference, stops, appointments and rate; the load starts as a draft.",
      reads: ["Customer", "Reference", "Stops", "Appointments", "Rate"],
      slots: [["Rate confirmation", "PDF, photo or screenshot"]],
      tips: ["PDFs straight from the email read best", "For photos, get the whole page, flat and in good light", "Add every page of a multi-page rate con"],
      note: "The rate confirmation is attached to the load, and the load stays a draft until you mark it ready.",
      keptWith: "load’s documents",
    },
  },
  invoice: {
    title: "New invoice",
    icon: I.invoice,
    cta: "Create draft invoice",
    plural: "invoices",
    manualDetail: "Pick the customer and loads, then check the charges yourself.",
    scan: {
      intake: "pod",
      doc: "pod",
      title: "From a signed POD",
      detail: "Scan the signed proof of delivery. We match the load and fill in the charges for you to check.",
      reads: ["Load match", "Delivered", "Signed by", "Detention", "Lumper"],
      slots: [["Signed proof of delivery", "PDF or photo"]],
      tips: ["Include the signature and the in and out times", "One document per load works best", "For photos, get the whole page, flat and in good light"],
      note: "Invoices stay drafts until you issue them. Nothing is sent to the customer yet.",
      keptWith: "load’s documents",
    },
  },
  inspection: {
    title: "Log an inspection",
    icon: I.inspect,
    cta: "Save inspection",
    plural: "inspections",
    manualDetail: "Enter the level, result and any violations yourself.",
    scan: {
      intake: "inspection_report",
      doc: "inspection",
      title: "From the inspection report",
      detail: "A photo or PDF of the roadside inspection report. We read the level, violations and any out-of-service order and match the driver and units.",
      reads: ["Level", "Violations", "Out of service", "Driver", "Units"],
      slots: [["Inspection report", "All pages, photo or PDF"]],
      tips: ["Include every page; violations often run onto page 2", "Get the report number and the officer’s signature in frame", "A PDF from the state portal reads best"],
      note: "The report is kept with the inspection; out-of-service orders block dispatch until they are cleared.",
      keptWith: "inspection",
    },
  },
};

export const hasFlow = (kind: string): boolean => kind in FLOWS;
