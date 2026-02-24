import { Request } from "express";
import { storeCodeVerifier, getCodeVerifierByWriteKey } from "../db/keystorage";

interface StoreOptions {
  codeVerifier?: string;
}

interface StoreMeta {
  [key: string]: unknown;
}

export class KeyStorageStateStore {
  // Вызывается при построении URL авторизации (/plugin/auth)
  // Passport передаёт сгенерированный code_verifier в options
  // Мы сохраняем его под writeKey и возвращаем writeKey как OAuth state
  store(
    req: Request,
    options: StoreOptions,
    _state: unknown,
    _meta: StoreMeta,
    callback: (err: Error | null, state?: string) => void,
  ): void {
    const writeKey = req.query.state as string;
    if (!writeKey) {
      return callback(new Error("Missing writeKey in query"));
    }
    if (options.codeVerifier) {
      storeCodeVerifier(writeKey, options.codeVerifier);
    }
    callback(null, writeKey);
  }

  // Вызывается в callback от Google
  // Проверяет CSRF cookie и достаёт code_verifier
  verify(
    req: Request,
    providedState: string,
    _meta: StoreMeta,
    callback: (
      err: Error | null,
      ok: boolean,
      state?: { codeVerifier?: string },
    ) => void,
  ): void {
    const cookieKey = req.cookies?.oauth_write_key as string | undefined;
    if (!cookieKey || cookieKey.trim() !== providedState) {
      return callback(null, false);
    }
    const codeVerifier = getCodeVerifierByWriteKey(providedState);
    callback(null, true, codeVerifier ? { codeVerifier } : {});
  }
}
