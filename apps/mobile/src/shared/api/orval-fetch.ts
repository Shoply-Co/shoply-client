import { apiRequest } from "./client";

export async function shoplyFetch<T>(url: string, options: RequestInit = {}): Promise<T> {
  return apiRequest<T>(url, options);
}
