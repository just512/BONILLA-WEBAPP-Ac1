import React, { useEffect, useState } from 'react';
import { apiFetch, formatMoney } from '../../lib/api.ts';
import { useApp } from '../../context/AppContext.tsx';

interface OverviewPayload {
  kpis: {
    totalRevenueCents: number;
    totalOrders: number;
    pendingOrders: number;
    completedOrders: number;
    totalCustomers: number;
    totalProducts: number;
    lowStockProducts: number;
  };
  revenueSeries: Array<{ date: string; revenueCents: number; orders: number }>;
  popularProducts: Array<{ productName: string; unitsSold: number; revenueCents: number }>;
  statusBreakdown: Record<string, number>;
  lowStockItems: Array<{ id: number; itemName: string; quantityOnHand: number; reorderThreshold: number; unit: string }>;
  recentOrders: Array<{
    id: number;
    orderNumber: string;
    customerName: string;
    branchName: string;
    status: string;
    totalCents: number;
    createdAt: string;
  }>;
}

export const AdminOverviewTab: React.FC = () => {
  const { currencySymbol, realtimeTick } = useApp();
  const [data, setData] = useState<OverviewPayload | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch<OverviewPayload>('/api/admin/overview')
      .then(setData)
      .finally(() => setLoading(false));
  }, [realtimeTick]);

  if (loading) {
    return <div className="h-96 rounded-2xl bg-neutral-100 dark:bg-neutral-800 animate-pulse" />;
  }

  if (!data) return null;

  const maxRev = Math.max(100, ...data.revenueSeries.map((d) => d.revenueCents));

  const kpiCards = [
    { label: 'Total Revenue', value: formatMoney(data.kpis.totalRevenueCents, currencySymbol), highlight: true },
    { label: 'Total Orders', value: String(data.kpis.totalOrders) },
    { label: 'Active / Pending', value: String(data.kpis.pendingOrders) },
    { label: 'Completed Orders', value: String(data.kpis.completedOrders) },
    { label: 'Total Customers', value: String(data.kpis.totalCustomers) },
    { label: 'Menu Products', value: String(data.kpis.totalProducts) },
    { label: 'Low Stock Alerts', value: String(data.kpis.lowStockProducts), alert: data.kpis.lowStockProducts > 0 },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
        {kpiCards.map((k) => (
          <div
            key={k.label}
            className={`rounded-xl border p-4 transition-colors ${
              k.alert
                ? 'border-red-300 dark:border-red-900/60 bg-red-50 dark:bg-red-950/40'
                : k.highlight
                  ? 'border-[#171717] dark:border-neutral-800 bg-[#171717] text-white'
                  : 'border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#1A1A1A]'
            }`}
          >
            <p className={`text-xs ${k.highlight ? 'text-neutral-300' : 'text-neutral-500 dark:text-neutral-400'}`}>
              {k.label}
            </p>
            <p
              className={`font-mono text-xl font-extrabold mt-1 tabular-nums ${
                k.alert
                  ? 'text-[#D62828] dark:text-red-400'
                  : k.highlight
                    ? 'text-[#FFC928]'
                    : 'text-[#171717] dark:text-white'
              }`}
            >
              {k.value}
            </p>
          </div>
        ))}
      </div>

      {/* 7-Day Revenue Bar Chart + Status Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#1A1A1A] p-6 transition-colors">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="font-display text-lg font-bold text-[#171717] dark:text-white">
                7-Day Revenue Analytics
              </h3>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                Daily gross order volume across branches
              </p>
            </div>
          </div>
          <div className="h-52 flex items-end gap-3">
            {data.revenueSeries.map((day) => {
              const pct = Math.max(4, Math.round((day.revenueCents / maxRev) * 100));
              return (
                <div key={day.date} className="flex-1 flex flex-col items-center gap-2 h-full justify-end">
                  <span className="font-mono text-[11px] font-semibold text-neutral-600 dark:text-neutral-300 tabular-nums">
                    {formatMoney(day.revenueCents, currencySymbol)}
                  </span>
                  <div
                    className="w-full rounded-t-lg bg-[#D62828] transition-all duration-300 min-h-[6px]"
                    style={{ height: `${pct}%` }}
                    title={`${day.date}: ${day.orders} orders`}
                  />
                  <span className="font-mono text-[10px] text-neutral-400 dark:text-neutral-500">
                    {day.date.slice(5)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="lg:col-span-4 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#1A1A1A] p-6 space-y-4 transition-colors">
          <h3 className="font-display text-lg font-bold text-[#171717] dark:text-white">
            Popular Items
          </h3>
          {data.popularProducts.length === 0 ? (
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              No order item sales recorded yet.
            </p>
          ) : (
            <div className="space-y-3">
              {data.popularProducts.map((p) => (
                <div key={p.productName} className="flex items-center justify-between text-sm">
                  <span className="truncate font-medium text-[#171717] dark:text-neutral-100 pr-2">
                    {p.productName}
                  </span>
                  <span className="font-mono text-xs text-neutral-600 dark:text-neutral-400 shrink-0 tabular-nums">
                    {p.unitsSold} sold · {formatMoney(p.revenueCents, currencySymbol)}
                  </span>
                </div>
              ))}
            </div>
          )}

          {data.lowStockItems.length > 0 && (
            <div className="pt-4 border-t border-neutral-200 dark:border-neutral-800">
              <h4 className="text-xs font-bold uppercase tracking-wider text-[#D62828] dark:text-red-400 mb-2">
                Low Stock Alerts
              </h4>
              <ul className="space-y-1.5 text-xs">
                {data.lowStockItems.map((item) => (
                  <li key={item.id} className="flex justify-between text-neutral-700 dark:text-neutral-300">
                    <span className="truncate pr-2">{item.itemName}</span>
                    <span className="font-mono font-bold text-[#D62828] dark:text-red-400 tabular-nums">
                      {item.quantityOnHand} {item.unit}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      {/* Recent Orders */}
      <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#1A1A1A] overflow-hidden transition-colors">
        <div className="px-6 py-4 border-b border-neutral-200 dark:border-neutral-800">
          <h3 className="font-display text-lg font-bold text-[#171717] dark:text-white">
            Recent Orders
          </h3>
        </div>
        {data.recentOrders.length === 0 ? (
          <p className="p-6 text-sm text-neutral-500 dark:text-neutral-400">No orders placed yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-neutral-50 dark:bg-neutral-900/60 text-xs text-neutral-500 dark:text-neutral-400 border-b border-neutral-200 dark:border-neutral-800">
                <tr>
                  <th className="px-6 py-3 font-semibold">Order #</th>
                  <th className="px-6 py-3 font-semibold">Customer</th>
                  <th className="px-6 py-3 font-semibold">Branch</th>
                  <th className="px-6 py-3 font-semibold">Status</th>
                  <th className="px-6 py-3 font-semibold text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                {data.recentOrders.map((o) => (
                  <tr key={o.id} className="hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors">
                    <td className="px-6 py-3 font-mono font-semibold text-[#171717] dark:text-white">
                      {o.orderNumber}
                    </td>
                    <td className="px-6 py-3 text-neutral-800 dark:text-neutral-200">{o.customerName}</td>
                    <td className="px-6 py-3 text-neutral-500 dark:text-neutral-400">{o.branchName}</td>
                    <td className="px-6 py-3 capitalize font-medium text-neutral-800 dark:text-neutral-200">
                      {o.status.replace(/_/g, ' ')}
                    </td>
                    <td className="px-6 py-3 text-right font-mono font-semibold text-[#171717] dark:text-white tabular-nums">
                      {formatMoney(o.totalCents, currencySymbol)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
