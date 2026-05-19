"use client";

import { useState } from "react";

import { EmptyState } from "@/components/ui/empty-state";
import { Monogram } from "@/components/ui/monogram";
import { Segmented } from "@/components/ui/segmented";
import { formatTry } from "@/lib/format/currency";
import type { OrderItemPreview } from "@/lib/queries/orders";

/**
 * Order items view per design brief §3.5.
 *
 * Lives inside an expanded accordion row. Two view modes (Card default,
 * List), and a per-instance Segmented toggle to switch between them.
 */

type Props = {
  items: OrderItemPreview[];
  initialView?: "card" | "list";
};

export function OrderItemsView({ items, initialView = "card" }: Props) {
  const [view, setView] = useState<"card" | "list">(initialView);

  if (items.length === 0) {
    return (
      <EmptyState
        icon="box"
        title="Bu siparişte ürün satırı bulunamadı"
        body="Tedarikçi portalı bu siparişin detaylarını paylaşmamış olabilir."
      />
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="t-cap">{items.length} ürün</p>
        <Segmented
          value={view}
          options={[
            { value: "card", label: "Kart" },
            { value: "list", label: "Liste" },
          ]}
          onChange={setView}
        />
      </div>

      {view === "card" ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {items.map((item) => (
            <ItemCard key={item.id} item={item} />
          ))}
        </div>
      ) : (
        <ul className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          {items.map((item, i) => (
            <li
              key={item.id}
              className={i === 0 ? "" : "border-t border-slate-200"}
            >
              <ItemListRow item={item} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Item card (Card view) per §3.7 — square image area + product code +
 * 2-line product name + qty/total bottom row.
 */
function ItemCard({ item }: { item: OrderItemPreview }) {
  const lineTotal = item.quantity * item.unitPriceAtOrder;
  return (
    <article className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_4px_12px_rgba(15,23,42,0.04)] transition-transform duration-200 hover:-translate-y-px">
      <div className="aspect-square w-full bg-slate-100">
        {item.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.imageUrl}
            alt={item.productName}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <Monogram name={item.productName} size="card" />
        )}
      </div>
      <div className="flex flex-col gap-1 p-3">
        <p className="text-[10.5px] font-medium uppercase tracking-wider text-slate-500">
          {item.productCode}
        </p>
        <h4
          className="line-clamp-2 text-sm font-medium leading-4.5 text-slate-900"
          title={item.productName}
        >
          {item.productName}
        </h4>
        <div className="mt-1.5 flex items-center justify-between text-xs">
          <span className="text-slate-600">{item.quantity} ad.</span>
          <span className="font-medium text-slate-900 tnum">
            {formatTry(lineTotal)}
          </span>
        </div>
      </div>
    </article>
  );
}

/**
 * Item list row (List view) per §3.8 — 40px thumbnail + name + code + qty/total.
 */
function ItemListRow({ item }: { item: OrderItemPreview }) {
  const lineTotal = item.quantity * item.unitPriceAtOrder;
  return (
    <div className="flex items-center gap-3 px-3 py-2 hover:bg-slate-50">
      <div className="h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-slate-100">
        {item.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.imageUrl}
            alt={item.productName}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <Monogram name={item.productName} size="thumb" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p
          className="truncate text-sm font-medium text-slate-900"
          title={item.productName}
        >
          {item.productName}
        </p>
        <p className="mt-0.5 text-[10.5px] font-medium uppercase tracking-wider text-slate-500">
          {item.productCode}
        </p>
      </div>
      <div className="shrink-0 text-right text-xs">
        <p className="text-slate-600">{item.quantity} ad.</p>
        <p className="mt-0.5 font-medium text-slate-900 tnum">
          {formatTry(lineTotal)}
        </p>
      </div>
    </div>
  );
}
