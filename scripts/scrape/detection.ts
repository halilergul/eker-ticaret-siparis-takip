import type { Page } from "playwright";
import { DETECTION_PATTERNS } from "./constants";

export type CaptchaInfo = {
  kind: "recaptcha" | "hcaptcha" | "cloudflare" | "unknown";
};

export type TwoFactorInfo = {
  method: "sms" | "otp" | "authenticator" | "unknown";
};

/**
 * Sayfada CAPTCHA / bot koruması belirtisi var mı kontrol et.
 * URL, iframe src ve body içeriği üzerinden çoklu sinyal.
 */
export async function detectCaptcha(page: Page): Promise<CaptchaInfo | null> {
  const url = page.url().toLowerCase();

  // URL keyword'leri
  if (url.includes("cdn-cgi/challenge") || url.includes("cf_chl")) {
    return { kind: "cloudflare" };
  }
  if (
    DETECTION_PATTERNS.CAPTCHA_URL_KEYWORDS.some((kw) => url.includes(kw))
  ) {
    return { kind: "unknown" };
  }

  // Iframe src kontrolü
  const iframeKind = await page.evaluate(
    (patterns: readonly string[]) => {
      const iframes = document.querySelectorAll("iframe");
      for (const iframe of Array.from(iframes)) {
        const src = (iframe.getAttribute("src") ?? "").toLowerCase();
        for (const p of patterns) {
          if (src.includes(p)) {
            if (p.includes("recaptcha")) return "recaptcha";
            if (p.includes("hcaptcha")) return "hcaptcha";
            if (p.includes("cloudflare")) return "cloudflare";
            return "unknown";
          }
        }
      }
      return null;
    },
    DETECTION_PATTERNS.CAPTCHA_IFRAME_SRC_PATTERNS,
  );

  if (iframeKind) {
    return { kind: iframeKind as CaptchaInfo["kind"] };
  }

  // Body içeriği keyword'leri
  const bodyText = (await page.textContent("body").catch(() => null)) ?? "";
  const lowerBody = bodyText.toLowerCase();
  const bodyMatch = DETECTION_PATTERNS.CAPTCHA_BODY_KEYWORDS.some((kw) =>
    lowerBody.includes(kw),
  );

  if (bodyMatch) {
    return { kind: "unknown" };
  }

  return null;
}

/**
 * Sayfada 2FA prompt'u var mı kontrol et.
 *
 * Sıkı pattern: sadece visible input + spesifik name'ler (otp/tfa_code/2fa),
 * veya body'de FULL PHRASE eşleşmesi ("doğrulama kodunu girin" gibi).
 * Tek kelime "kod" / "doğrulama" yaygın UI text'lerinde geçer (örn. "Ürün
 * kodu"), false positive doğurur. Bilinçli olarak konservatif.
 */
export async function detect2FA(page: Page): Promise<TwoFactorInfo | null> {
  // Sadece VISIBLE input'larda spesifik 2FA-only name'lere bak
  const inputMethod = await page.evaluate(
    (names: readonly string[]) => {
      const inputs = document.querySelectorAll(
        'input:not([type="hidden"])',
      );
      for (const input of Array.from(inputs)) {
        const el = input as HTMLInputElement;
        // Visible check: offsetParent null değil + display !== none
        if (el.offsetParent === null) continue;

        const nameAttr = (el.getAttribute("name") ?? "").toLowerCase();
        const idAttr = (el.getAttribute("id") ?? "").toLowerCase();

        for (const candidate of names) {
          if (nameAttr === candidate || idAttr === candidate) {
            if (candidate === "otp") return "otp";
            if (candidate.includes("auth")) return "authenticator";
            return "unknown";
          }
        }
      }
      return null;
    },
    DETECTION_PATTERNS.TFA_INPUT_NAMES,
  );

  if (inputMethod) {
    return { method: inputMethod as TwoFactorInfo["method"] };
  }

  // Body text — FULL PHRASE match
  const bodyText = (await page.textContent("body").catch(() => null)) ?? "";
  const lowerBody = bodyText.toLowerCase();
  const matchedPhrase = DETECTION_PATTERNS.TFA_BODY_PHRASES.find((phrase) =>
    lowerBody.includes(phrase.toLowerCase()),
  );

  if (matchedPhrase) {
    // Hangi tip 2FA tahmin et
    if (matchedPhrase.includes("sms") || matchedPhrase.includes("telefon"))
      return { method: "sms" };
    if (matchedPhrase.includes("authenticator")) return { method: "authenticator" };
    if (matchedPhrase.includes("one-time") || matchedPhrase.includes("tek kullanımlık"))
      return { method: "otp" };
    return { method: "unknown" };
  }

  return null;
}

/**
 * Beklenen selector'lardan biri bulundu mu kontrol et.
 * Hiçbiri bulunmadıysa true (= unexpected) döner.
 */
export async function detectUnexpectedDom(
  page: Page,
  selectors: readonly string[],
  timeoutMs = 5000,
): Promise<boolean> {
  for (const selector of selectors) {
    try {
      const el = await page.locator(selector).first();
      const count = await el.count();
      if (count > 0) {
        // En azından bir tane bulundu, expected
        return false;
      }
    } catch {
      // selector parse hatası veya benzeri — sonraki adaya geç
    }
  }
  // Hiçbir selector bulunamadı
  return true;
}
