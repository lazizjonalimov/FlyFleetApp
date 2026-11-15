import { DRIVERS, LOADS, OWN5, TRUCKS, U5 } from "./model/console-model";
import { driverSlug, ORG_SLUG } from "./routes";

/**
 * The records that have a page of their own. Pages are prerendered from these lists and nothing else is
 * served, so a record missing here is a 404 however it is linked.
 */
export const LOAD_IDS: string[] = LOADS.map((load) => load.id);

export const DRIVER_SLUGS: string[] = DRIVERS.map((driver) => driverSlug(driver.n));

/** Everyone who owns equipment the carrier runs, the carrier itself included. */
export const OWNER_IDS: string[] = OWN5.map((owner) => owner.id);

/** Owners other than the carrier: they can be edited and have a portal of their own. */
export const OUTSIDE_OWNER_IDS: string[] = OWN5.filter((owner) => owner.cat !== "carrier").map((owner) => owner.id);

/** Owners with a settlement. An owner who is still onboarding has none yet. */
export const STATEMENT_IDS: string[] = OWN5.filter((owner) => owner.cat !== "carrier" && owner.status !== "Onboarding").map((owner) => owner.id);

/** Every unit: the trucks of the fleet and all equipment under an ownership agreement, trailers included. */
export const UNIT_IDS: string[] = [...new Set([...TRUCKS.map((truck) => truck[0]), ...Object.keys(U5)])];

/** The address of every record page. */
export const RECORD_PATHS: string[] = [
  ...LOAD_IDS.map((id) => `loads/${id}`),
  ...DRIVER_SLUGS.map((slug) => `drivers/${slug}`),
  ...OWNER_IDS.map((id) => `owners/${id}`),
  ...OUTSIDE_OWNER_IDS.flatMap((id) => [`owners/${id}/edit`, `owners/${id}/portal`]),
  ...STATEMENT_IDS.map((id) => `finance/statements/${id}`),
  ...UNIT_IDS.map((id) => `equipment/trucks/${id}`),
].map((path) => `/${ORG_SLUG}/${path}`);
