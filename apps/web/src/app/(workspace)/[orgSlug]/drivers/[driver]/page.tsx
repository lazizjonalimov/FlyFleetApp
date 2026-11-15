import type { Metadata } from "next";
import { DRIVERS } from "@/features/console/model/console-model";
import { DRIVER_SLUGS } from "@/features/console/records";
import { driverSlug } from "@/features/console/routes";
import { DriverScreen } from "@/features/drivers/driver-screen";

export const dynamicParams = false;

export function generateStaticParams() {
  return DRIVER_SLUGS.map((driver) => ({ driver }));
}

export async function generateMetadata({ params }: PageProps<"/[orgSlug]/drivers/[driver]">): Promise<Metadata> {
  const { driver } = await params;
  return { title: DRIVERS.find((d) => driverSlug(d.n) === driver)?.n ?? "Driver" };
}

export default function DriverPage() {
  return <DriverScreen />;
}
