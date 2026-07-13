import { API_BASE_URL } from "@/shared/config/constants";
import { readAccessToken } from "@/shared/storage/secure-store";
import { createApiErrorFromResponse, createNetworkError } from "./errors";

export interface ApiEnvelope<T> {
  data: T;
  meta?: {
    requestId?: string;
    serverTime?: string;
  };
}

export interface RequestOptions extends RequestInit {
  auth?: boolean;
  unwrapEnvelope?: boolean;
}

export interface ApiResponse<T> {
  data: T;
  status: number;
  headers: Headers;
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { auth = true, unwrapEnvelope = true, ...requestOptions } = options;
  const { body } = await executeApiRequest(path, auth, requestOptions);

  if (!unwrapEnvelope) {
    return body as T;
  }

  if (body && typeof body === "object" && "data" in body) {
    return (body as ApiEnvelope<T>).data;
  }

  return body as T;
}

export async function apiRequestWithResponse<T>(
  path: string,
  options: RequestOptions = {}
): Promise<ApiResponse<T>> {
  const { auth = true, unwrapEnvelope: _unwrapEnvelope, ...requestOptions } = options;
  const { body, response } = await executeApiRequest(path, auth, requestOptions);
  return { data: body as T, status: response.status, headers: response.headers };
}

async function executeApiRequest(path: string, auth: boolean, requestOptions: RequestInit) {
  const headers = new Headers(requestOptions.headers);
  const bodyIsFormData = isFormData(requestOptions.body);
  headers.set("Accept", "application/json");

  if (bodyIsFormData) {
    headers.delete("Content-Type");
  } else if (requestOptions.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  if (auth !== false) {
    const token = await readAccessToken();
    if (token) headers.set("Authorization", `Bearer ${token}`);
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...requestOptions,
      headers
    });
  } catch (error) {
    throw createNetworkError(error);
  }

  const contentType = response.headers.get("content-type") ?? "";
  const body = contentType.includes("application/json") ? await parseJsonBody(response) : null;

  if (!response.ok) {
    throw createApiErrorFromResponse(response.status, body);
  }

  return { body, response };
}

async function parseJsonBody(response: Response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function isFormData(body: unknown): body is FormData {
  if (!body || typeof body !== "object") return false;
  if (typeof FormData !== "undefined" && body instanceof FormData) return true;

  const tag = Object.prototype.toString.call(body);
  if (tag === "[object FormData]") return true;

  const maybeFormData = body as { append?: unknown; getParts?: unknown; _parts?: unknown };
  return (
    typeof maybeFormData.append === "function" &&
    (typeof maybeFormData.getParts === "function" || Array.isArray(maybeFormData._parts))
  );
}
