import type { ErrorEnvelope } from "./generated/shoply";

export const COMMON_ERROR_MESSAGE = "오류가 발생했어요. 잠시 후 다시 시도해주세요.";

export const BACKEND_ERROR_MESSAGES = {
  ADMIN_REQUIRED: "관리자 권한이 필요한 요청입니다.",
  APPLE_IDENTITY_TOKEN_INVALID: "Apple 로그인 인증 정보를 확인하지 못했어요. 다시 로그인해주세요.",
  BAD_REQUEST: "요청 정보를 확인해주세요.",
  CONFLICT: "현재 상태에서는 처리할 수 없어요.",
  FORBIDDEN: "이 작업을 할 권한이 없어요.",
  INTERNAL_SERVER_ERROR: COMMON_ERROR_MESSAGE,
  INVALID_INTERACTION_TYPE: "지원하지 않는 리뷰 반응입니다.",
  MEDIA_PROCESSING_EMPTY: "미디어를 처리하지 못했어요. 다른 파일로 다시 시도해주세요.",
  MULTIPART_PARSE_ERROR: "파일 업로드 요청을 처리하지 못했어요. 이미지를 다시 선택해주세요.",
  NETWORK_ERROR: "네트워크 연결을 확인한 뒤 다시 시도해주세요.",
  NOT_FOUND: "요청한 정보를 찾을 수 없어요.",
  PAYLOAD_TOO_LARGE: "파일 용량이 너무 큽니다. 더 작은 파일로 다시 시도해주세요.",
  R2_STORAGE_NOT_CONFIGURED: "파일 업로드가 아직 준비되지 않았어요. 잠시 후 다시 시도해주세요.",
  R2_STORAGE_UPLOAD_FAILED: "파일 업로드에 실패했어요. 잠시 후 다시 시도해주세요.",
  RATE_LIMIT_EXCEEDED: "요청이 너무 많아요. 잠시 후 다시 시도해주세요.",
  REQUEST_FAILED: COMMON_ERROR_MESSAGE,
  RESPONSE_VALIDATION_ERROR: COMMON_ERROR_MESSAGE,
  REVIEW_OWNER_REQUIRED: "내가 작성한 리뷰만 수정할 수 있어요.",
  SERVICE_UNAVAILABLE: "서비스가 잠시 불안정해요. 잠시 후 다시 시도해주세요.",
  UNAUTHORIZED: "로그인이 필요하거나 세션이 만료됐어요. 다시 로그인해주세요.",
  UNKNOWN_BACKEND_ERROR: COMMON_ERROR_MESSAGE,
  UNPROCESSABLE_ENTITY: "입력한 정보를 다시 확인해주세요.",
  UNSUPPORTED_MEDIA_TYPE: "지원하지 않는 파일 형식입니다. 다른 이미지로 다시 시도해주세요.",
  VALIDATION_ERROR: "입력한 정보를 다시 확인해주세요."
} as const;

export type BackendErrorCode = keyof typeof BACKEND_ERROR_MESSAGES;

interface ApiErrorInput {
  code: BackendErrorCode;
  details?: unknown;
  rawMessage?: string;
  requestId?: string;
  status: number;
}

export class ApiError extends Error {
  readonly code: BackendErrorCode;
  readonly details?: unknown;
  readonly rawMessage?: string;
  readonly requestId?: string;
  readonly status: number;

  constructor(input: ApiErrorInput) {
    super(BACKEND_ERROR_MESSAGES[input.code]);
    this.name = "ApiError";
    this.code = input.code;
    this.details = input.details;
    this.rawMessage = input.rawMessage;
    this.requestId = input.requestId;
    this.status = input.status;
  }
}

export function createApiErrorFromResponse(status: number, body: unknown): ApiError {
  const envelope = parseErrorEnvelope(body);
  const fallbackCode = backendErrorCodeFromStatus(status);
  const code = normalizeBackendErrorCode(envelope?.error.code, fallbackCode);

  return new ApiError({
    code,
    details: envelope?.error.details,
    rawMessage: envelope?.error.message,
    requestId: envelope?.meta?.requestId,
    status
  });
}

export function createNetworkError(error: unknown): ApiError {
  return new ApiError({
    code: "NETWORK_ERROR",
    rawMessage: error instanceof Error ? error.message : undefined,
    status: 0
  });
}

export function userFacingErrorMessage(error: unknown, fallback = COMMON_ERROR_MESSAGE) {
  if (error instanceof ApiError) return error.message;
  return fallback;
}

function parseErrorEnvelope(body: unknown): ErrorEnvelope | null {
  if (!body || typeof body !== "object" || !("error" in body)) return null;
  const envelope = body as Partial<ErrorEnvelope>;
  if (!envelope.error || typeof envelope.error !== "object") return null;
  return envelope as ErrorEnvelope;
}

function normalizeBackendErrorCode(value: unknown, fallback: BackendErrorCode): BackendErrorCode {
  if (typeof value !== "string") return fallback;
  const normalized = value.trim().toUpperCase();
  return isBackendErrorCode(normalized) ? normalized : "UNKNOWN_BACKEND_ERROR";
}

function isBackendErrorCode(value: string): value is BackendErrorCode {
  return value in BACKEND_ERROR_MESSAGES;
}

function backendErrorCodeFromStatus(status: number): BackendErrorCode {
  if (status === 400) return "BAD_REQUEST";
  if (status === 401) return "UNAUTHORIZED";
  if (status === 403) return "FORBIDDEN";
  if (status === 404) return "NOT_FOUND";
  if (status === 409) return "CONFLICT";
  if (status === 413) return "PAYLOAD_TOO_LARGE";
  if (status === 415) return "UNSUPPORTED_MEDIA_TYPE";
  if (status === 422) return "UNPROCESSABLE_ENTITY";
  if (status === 429) return "RATE_LIMIT_EXCEEDED";
  if (status === 503) return "SERVICE_UNAVAILABLE";
  if (status >= 500) return "INTERNAL_SERVER_ERROR";
  return "REQUEST_FAILED";
}
