export type UnauthorizedHandler = () => void;

let unauthorizedHandler: UnauthorizedHandler | null = null;

export function setUnauthorizedHandler(handler: UnauthorizedHandler | null): void {
  unauthorizedHandler = handler;
}

export interface ApiFetchOptions extends RequestInit {
  // Set for the login call itself: a 401 there means "wrong password", not
  // "your session expired", so it must not trigger the redirect-to-login
  // interceptor below.
  suppressUnauthorizedHandler?: boolean;
}

export async function apiFetch(path: string, options: ApiFetchOptions = {}): Promise<Response> {
  const { suppressUnauthorizedHandler, ...init } = options;
  const res = await fetch(path, { ...init, credentials: "include" });
  if (res.status === 401 && !suppressUnauthorizedHandler) {
    unauthorizedHandler?.();
  }
  return res;
}
