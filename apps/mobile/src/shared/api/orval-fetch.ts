import { apiRequestWithResponse } from "./client";

export async function shoplyFetch<T>(url: string, options: RequestInit = {}): Promise<T> {
  return apiRequestWithResponse<unknown>(url, options) as Promise<T>;
}
