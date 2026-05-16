import { ERROR_MESSAGES } from "./constants";

export type FailureMode =
  | "missing-credentials"
  | "login-failed"
  | "captcha"
  | "2fa-required"
  | "network"
  | "unexpected-dom"
  | "timeout"
  | "empty-history"
  | "cookie-banner-block"
  | "unknown";

export type ScrapeErrorOptions = {
  mode: FailureMode;
  message?: string;
  details?: string;
  step?: string;
  screenshotPath?: string;
};

export class ScrapeError extends Error {
  public readonly mode: FailureMode;
  public readonly details?: string;
  public readonly step?: string;
  public screenshotPath?: string;

  constructor(opts: ScrapeErrorOptions) {
    super(opts.message ?? messageForMode(opts.mode));
    this.name = "ScrapeError";
    this.mode = opts.mode;
    this.details = opts.details;
    this.step = opts.step;
    this.screenshotPath = opts.screenshotPath;
  }
}

function messageForMode(mode: FailureMode): string {
  switch (mode) {
    case "missing-credentials":
      return ERROR_MESSAGES.MISSING_CREDS;
    case "login-failed":
      return ERROR_MESSAGES.LOGIN_FAILED;
    case "captcha":
      return ERROR_MESSAGES.CAPTCHA_GENERIC;
    case "2fa-required":
      return ERROR_MESSAGES.TFA_REQUIRED;
    case "network":
      return ERROR_MESSAGES.NETWORK;
    case "unexpected-dom":
      return ERROR_MESSAGES.UNEXPECTED_DOM;
    case "timeout":
      return ERROR_MESSAGES.TIMEOUT;
    case "empty-history":
      return ERROR_MESSAGES.EMPTY_HISTORY;
    case "cookie-banner-block":
      return ERROR_MESSAGES.COOKIE_BANNER_BLOCK;
    case "unknown":
    default:
      return ERROR_MESSAGES.UNKNOWN;
  }
}

export type FormattedError = {
  stderr: string;
  exitCode: number;
};

/**
 * ScrapeError'ı stderr formatına ve exit code'a çevirir.
 * `empty-history` özel: exit code 0 (success — sipariş yok, scraping çalıştı).
 */
export function formatError(err: ScrapeError, verbose: boolean): FormattedError {
  const lines: string[] = [];

  const baseMsg = err.message;
  const stepSuffix = err.step ? ` (adım: ${err.step})` : "";
  const detailsSuffix = err.details ? ` — ${err.details}` : "";

  lines.push(`Hata: ${baseMsg}${detailsSuffix}${stepSuffix}`);

  if (err.screenshotPath) {
    lines.push(`Screenshot: ${err.screenshotPath}`);
  }

  if (verbose && err.stack) {
    lines.push("");
    lines.push("Stack trace (--verbose):");
    lines.push(err.stack);
  }

  const exitCode = err.mode === "empty-history" ? 0 : 1;

  return {
    stderr: lines.join("\n") + "\n",
    exitCode,
  };
}
