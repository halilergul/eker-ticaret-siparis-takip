/**
 * TR locale fiyat string'ini number'a çevirir.
 *
 * Örnekler:
 *   parseTrPrice("1.234,56 ₺")  // 1234.56
 *   parseTrPrice("12,50 TL")    // 12.5
 *   parseTrPrice("1234.56")     // 1234.56 (sadece nokta varsa ondalık)
 *   parseTrPrice("1.234")       // 1234   (sadece nokta + binlik formatı varsa binlik)
 *   parseTrPrice("")            // null
 *   parseTrPrice(null)          // null
 *   parseTrPrice("abc")         // null
 *
 * Strateji:
 *   1. Currency sembollerini ve whitespace'i sil
 *   2. Hem `.` hem `,` varsa: nokta = binlik, virgül = ondalık → ".replace nokta" + ",replace . → ondalık"
 *   3. Sadece `,` varsa: ondalık
 *   4. Sadece `.` varsa: binlik mi ondalık mı belirsiz. Pragmatik karar:
 *      - 3 haneli grup varsa (X.XXX, X.XXX.XXX) binlik
 *      - Aksi takdirde ondalık (US format fallback)
 */
export function parseTrPrice(raw: string | null | undefined): number | null {
  if (!raw) return null;

  // 1. Trim + currency sembolleri ve harfleri sil
  let cleaned = String(raw)
    .replace(/[₺$€£]/g, "")
    .replace(/\b(TL|TRY|USD|EUR|GBP)\b/gi, "")
    .replace(/\s+/g, "")
    .trim();

  if (cleaned.length === 0) return null;

  const hasDot = cleaned.includes(".");
  const hasComma = cleaned.includes(",");

  if (hasDot && hasComma) {
    // 1.234,56 → 1234.56
    cleaned = cleaned.replace(/\./g, "").replace(",", ".");
  } else if (hasComma) {
    // 12,50 → 12.50
    cleaned = cleaned.replace(",", ".");
  } else if (hasDot) {
    // Sadece nokta var: binlik mi, ondalık mı?
    // Pragmatik kural: nokta sonrası 3 hane varsa binlik (1.234 = 1234),
    // 1-2 hane varsa ondalık (1.5 = 1.5; 12.34 = 12.34).
    const parts = cleaned.split(".");
    const lastPart = parts[parts.length - 1] ?? "";
    if (parts.length >= 2 && lastPart.length === 3) {
      // binlik formatı: 1.234 veya 1.234.567
      cleaned = cleaned.replace(/\./g, "");
    }
    // else: ondalık olarak bırak (12.50 olduğu gibi)
  }

  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed)) return null;
  return parsed;
}
