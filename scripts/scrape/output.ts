import { DEFAULT_CURRENCY } from "./constants";

export type OrderLine = {
  product_name: string;
  order_date: string;
  purchase_unit_price: number;
  current_unit_price: number | null;
  currency: typeof DEFAULT_CURRENCY;
  notes?: string;
};

export function formatText(lines: OrderLine[]): string {
  if (lines.length === 0) {
    return "(Sipariş geçmişi boş — parse edilecek satır yok)\n";
  }

  const blocks = lines.map((line) => {
    const currentPriceStr =
      line.current_unit_price === null
        ? "— (ürün artık listede değil)"
        : `${line.current_unit_price.toFixed(2)} ₺`;

    const noteStr = line.notes ? `Not: ${line.notes}\n` : "";

    return (
      `Ürün: ${line.product_name}\n` +
      `Sipariş tarihi: ${line.order_date}\n` +
      `Alış birim fiyatı: ${line.purchase_unit_price.toFixed(2)} ₺\n` +
      `Güncel birim fiyat: ${currentPriceStr}\n` +
      noteStr
    );
  });

  const summary = `(${lines.length} sipariş bulundu, ilk sayfa, tek deneme)\n`;
  return blocks.join("\n") + "\n" + summary;
}

export function formatJson(lines: OrderLine[]): string {
  return JSON.stringify(lines, null, 2);
}

export function isValidOrderLine(line: Partial<OrderLine>): line is OrderLine {
  return (
    typeof line.product_name === "string" &&
    line.product_name.trim().length > 0 &&
    typeof line.order_date === "string" &&
    line.order_date.length > 0 &&
    typeof line.purchase_unit_price === "number" &&
    line.purchase_unit_price > 0 &&
    (line.current_unit_price === null ||
      (typeof line.current_unit_price === "number" &&
        line.current_unit_price >= 0)) &&
    line.currency === DEFAULT_CURRENCY
  );
}
