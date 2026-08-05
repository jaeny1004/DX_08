import { AlertCircle, DatabaseIcon } from "lucide-react";
import { INVENTORY_ITEMS } from "../config/operationsMockData";

export function InventoryPanel() {
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <header className="border-b border-slate-200 px-5 py-4">
        <div className="flex items-center gap-2">
          <DatabaseIcon size={18} className="text-emerald-700" />
          <h2 className="text-base font-black text-slate-950">
            약제 및 방제 소모품 재고
          </h2>
        </div>
        <p className="mt-1 text-[10px] font-semibold text-slate-400">
          실시간 재고 및 방제 장비 가동 현황을 확인합니다. (시연용 데이터)
        </p>
      </header>

      <div className="grid grid-cols-1 gap-3 p-4 md:grid-cols-2 xl:grid-cols-4">
        {INVENTORY_ITEMS.map((item) => {
          if (item.kind === "warning") {
            return (
              <div
                key={item.id}
                className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 p-3.5"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-red-600 text-white">
                  <AlertCircle size={18} />
                </div>
                <div className="min-w-0">
                  <h3 className="text-[11px] font-bold text-red-900">{item.name}</h3>
                  <p className="mt-0.5 text-[10px] leading-relaxed text-red-700">
                    {item.detail}
                  </p>
                </div>
              </div>
            );
          }

          return (
            <div
              key={item.id}
              className="rounded-xl border border-slate-200 bg-white p-3.5 transition hover:border-emerald-200 hover:shadow-sm"
            >
              <div className="mb-2.5 flex items-center justify-between gap-2">
                <h3 className="truncate text-[11px] font-bold text-slate-600">{item.name}</h3>
                <span className="shrink-0 text-[10px] font-bold text-emerald-700">
                  {item.displayValue}
                </span>
              </div>

              {item.kind === "equipment" ? (
                <div className="flex h-5 gap-0.5 rounded-md bg-slate-100 p-0.5">
                  {Array.from({ length: item.totalUnits ?? 0 }).map((_, index) => (
                    <div
                      key={index}
                      className={`flex-1 rounded-sm ${
                        index < (item.activeUnits ?? 0) ? "bg-emerald-600" : "bg-slate-300"
                      }`}
                    />
                  ))}
                </div>
              ) : (
                <div className="h-5 overflow-hidden rounded-md bg-slate-100 p-0.5">
                  <div
                    className="h-full rounded bg-emerald-600 transition-all"
                    style={{ width: `${item.percent}%` }}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
