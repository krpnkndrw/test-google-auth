import { Request } from "express";
import { storeCodeVerifier, getCodeVerifierByWriteKey } from "../db/keystorage";

interface StoreMeta {
  [key: string]: unknown;
}

export class KeyStorageStateStore {
  // Вызывается при построении URL авторизации (/auth/redirect).
  // passport-oauth2 при PKCE передаёт: store(req, verifier, state, meta, callback)
  // — второй аргумент это строка code_verifier, не объект.
  store(
    req: Request,
    verifier: string | undefined,
    _state: unknown,
    _meta: StoreMeta,
    callback: (err: Error | null, state?: string) => void,
  ): void {
    const writeKey = req.query.state as string;
    if (!writeKey) {
      return callback(new Error("Missing writeKey in query"));
    }
    if (verifier) {
      storeCodeVerifier(writeKey, verifier);
    }
    callback(null, writeKey);
  }

  // Вызывается в callback от Google.
  // passport-oauth2 при PKCE ожидает code_verifier вторым аргументом: (err, ok)
  // где ok === code_verifier (string), и тогда подставляет params.code_verifier = ok.
  verify(
    req: Request,
    providedState: string,
    _meta: StoreMeta,
    callback: (
      err: Error | null,
      ok: boolean | string,
      state?: unknown,
    ) => void,
  ): void {
    const cookieKey = req.cookies?.oauth_write_key as string | undefined;
    if (!cookieKey || cookieKey.trim() !== providedState) {
      console.error(
        "State verify failed: cookie present:",
        !!cookieKey,
        "cookie===state:",
        cookieKey?.trim() === providedState?.trim(),
      );
      return callback(null, false);
    }
    const codeVerifier = getCodeVerifierByWriteKey(providedState);
    if (!codeVerifier) {
      console.error("State verify: no code_verifier found for writeKey");
      return callback(null, false);
    }
    callback(null, codeVerifier);
  }
}
