import "server-only";

import { redirect } from "next/navigation";
import { getCustomerService } from "../infrastructure/customer-composition";
import { getCustomerSessionToken } from "./customer-session-cookie";

export async function getCurrentCustomer() {
  const token = await getCustomerSessionToken();
  return token ? getCustomerService().findSession(token) : null;
}

export async function requireCustomer() {
  const customer = await getCurrentCustomer();
  if (!customer) redirect("/login?returnTo=/mi-cuenta");
  return customer;
}
