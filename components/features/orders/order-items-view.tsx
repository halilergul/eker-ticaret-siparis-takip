"use client";

import { useState } from "react";

import { formatTry } from "@/lib/format/currency";
import type { OrderItemPreview } from "@/lib/queries/orders";

type Props = {
  items: OrderItemPreview[];
  /**
   * View tercihini parent'tan iletmek istersek (controlled). Geçilmezse
   * component kendi state'inde 'card' default ile başlar.
   */
  initialView?: "card" | "list";
};

export function OrderItemsView({ items, initialView = "card" }: Props) {
  const [view, setView] = useState<"card" | "list">(initialView);

  if (items.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-500">
        Bu siparişte ürün satırı bulunamadı.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase tracking-wide text-slate-500">
          {items.length} ürün
        </p>
        <ViewToggle current={view} onChange={setView} />
      </div>

      {view === "card" ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {items.map((item) => (
            <ItemCard key={item.id} item={item} />
          ))}
        </div>
      ) : (
        <ul className="divide-y divide-slate-200 overflow-hidden rounded-md border border-slate-200 bg-white">
          {items.map((item) => (
            <ItemListRow key={item.id} item={item} />
          ))}
        </ul>
      )}
    </div>
  );
}

function ViewToggle({
  current,
  onChange,
}: {
  current: "card" | "list";
  onChange: (v: "card" | "list") => void;
}) {
  return (
    <div className="inline-flex rounded-md border border-slate-200 bg-slate-50 p-0.5 text-xs">
      <button
        type="button"
        onClick={() => onChange("card")}
        className={
          current === "card"
            ? "rounded px-2 py-1 bg-white text-slate-900 shadow-sm font-medium"
            : "rounded px-2 py-1 text-slate-500 hover:text-slate-700"
        }
        aria-pressed={current === "card"}
      >
        Kart
      </button>
      <button
        type="button"
        onClick={() => onChange("list")}
        className={
          current === "list"
            ? "rounded px-2 py-1 bg-white text-slate-900 shadow-sm font-medium"
            : "rounded px-2 py-1 text-slate-500 hover:text-slate-700"
        }
        aria-pressed={current === "list"}
      >
        Liste
      </button>
    </div>
  );
}

function ItemCard({ item }: { item: OrderItemPreview }) {
  const lineTotal = item.quantity * item.unitPriceAtOrder;
  return (
    <article className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <ItemImage item={item} className="aspect-square w-full" />
      <div className="space-y-1 p-3">
        <p className="text-[11px] uppercase tracking-wide text-slate-500">
          {item.productCode}
        </p>
        <h4
          className="line-clamp-2 text-sm font-medium text-slate-900"
          title={item.productName}
        >
          {item.productName}
        </h4>
        <div className="flex items-center justify-between pt-1 text-xs">
          <span className="text-slate-600">{item.quantity} ad.</span>
          <span className="tabular-nums font-medium text-slate-900">
            {formatTry(lineTotal)}
          </span>
        </div>
      </div>
    </article>
  );
}

function ItemListRow({ item }: { item: OrderItemPreview }) {
  const lineTotal = item.quantity * item.unitPriceAtOrder;
  return (
    <li className="flex items-center gap-3 px-3 py-2">
      <ItemImage item={item} className="h-10 w-10 shrink-0 rounded-md" />
      <div className="min-w-0 flex-1">
        <p
          className="truncate text-sm text-slate-900"
          title={item.productName}
        >
          {item.productName}
        </p>
        <p className="text-[11px] uppercase tracking-wide text-slate-500">
          {item.productCode}
        </p>
      </div>
      <div className="shrink-0 text-right text-xs">
        <p className="text-slate-600">{item.quantity} ad.</p>
        <p className="tabular-nums font-medium text-slate-900">
          {formatTry(lineTotal)}
        </p>
      </div>
    </li>
  );
}

function ItemImage({
  item,
  className,
}: {
  item: OrderItemPreview;
  className: string;
}) {
  if (item.imageUrl) {
    // Faz B aktif olduğunda burada gerçek görsel gösterilir.
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={item.imageUrl}
        alt={item.productName}
        className={`${className} object-cover bg-slate-100`}
        loading="lazy"
      />
    );
  }
  // Fallback: monogram placeholder
  const initial = (item.productName?.[0] ?? item.productCode?.[0] ?? "•").toUpperCase();
  return (
    <div
      className={`${className} flex items-center justify-center bg-slate-100 text-slate-400`}
      aria-hidden="true"
    >
      <span className="text-2xl font-semibold">{initial}</span>
    </div>
  );
}
