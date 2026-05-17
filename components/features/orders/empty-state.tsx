import { CopyCommandButton } from "./copy-command-button";

const SCRAPE_COMMAND = "npm run scrape -- --supplier enderyapi";

export function EmptyState() {
  return (
    <section className="rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center">
      <h2 className="text-base font-semibold text-slate-900">
        Henüz sipariş yok.
      </h2>
      <p className="mt-2 text-sm text-slate-600">
        Tedarikçi sitesinden ilk veriyi çekmek için aşağıdaki komutu çalıştır:
      </p>
      <div className="mt-4 inline-flex items-center gap-2 rounded-md bg-slate-900 px-3 py-2 text-left">
        <code className="font-mono text-sm text-slate-100">
          {SCRAPE_COMMAND}
        </code>
        <CopyCommandButton command={SCRAPE_COMMAND} />
      </div>
    </section>
  );
}
