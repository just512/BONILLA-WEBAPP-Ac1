import React, { useCallback, useEffect, useState } from 'react';
import { Printer, Search, X } from 'lucide-react';
import { apiFetch, formatMoney } from '../../lib/api.ts';
import { useApp } from '../../context/AppContext.tsx';
import { Order, OrderItemSnapshot } from '../../types.ts';

interface KitchenOrder extends Order {
  branchName: string;
  items: OrderItemSnapshot[];
}

export const AdminOrdersKitchenTab: React.FC<{ view: 'orders' | 'kitchen' }> = ({ view }) => {
  const { currencySymbol, realtimeTick, showToast } = useApp();
  const [orders, setOrders] = useState<Order[]>([]);
  const [kitchenCols, setKitchenCols] = useState<{
    newOrders: KitchenOrder[];
    preparing: KitchenOrder[];
    ready: KitchenOrder[];
    completed: KitchenOrder[];
  }>({ newOrders: [], preparing: [], ready: [], completed: [] });
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [receiptOrder, setReceiptOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);

  const loadOrders = useCallback(async () => {
    setLoading(true);
    try {
      if (view === 'orders') {
        const qs = new URLSearchParams();
        if (statusFilter !== 'all') qs.set('status', statusFilter);
        if (search.trim()) qs.set('search', search.trim());
        const res = await apiFetch<{ orders: Order[] }>(`/api/admin/orders?${qs.toString()}`);
        setOrders(res.orders);
      } else {
        const res = await apiFetch<{ columns: typeof kitchenCols }>('/api/kitchen/orders');
        setKitchenCols(res.columns);
      }
    } finally {
      setLoading(false);
    }
  }, [view, statusFilter, search]);

  useEffect(() => {
    loadOrders();
  }, [loadOrders, realtimeTick]);

  const updateOrderStatus = async (orderId: number, status: string, rejectionReason?: string) => {
    try {
      await apiFetch(`/api/admin/orders/${orderId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status, rejectionReason }),
      });
      showToast(`Order updated to ${status.replace(/_/g, ' ')}.`, 'success');
      loadOrders();
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Status update failed', 'error');
    }
  };

  const markPaymentPaid = async (orderId: number) => {
    try {
      await apiFetch(`/api/admin/orders/${orderId}/payment`, {
        method: 'PATCH',
        body: JSON.stringify({ paymentStatus: 'paid' }),
      });
      showToast('Payment marked as paid.', 'success');
      loadOrders();
    } catch {
      showToast('Payment update failed.', 'error');
    }
  };

  if (view === 'kitchen') {
    const columns = [
      { key: 'newOrders', title: 'New Orders', items: kitchenCols.newOrders, accent: 'border-[#D62828]' },
      { key: 'preparing', title: 'Preparing', items: kitchenCols.preparing, accent: 'border-[#FFC928]' },
      { key: 'ready', title: 'Ready / Out', items: kitchenCols.ready, accent: 'border-emerald-600' },
      { key: 'completed', title: 'Completed', items: kitchenCols.completed, accent: 'border-neutral-400 dark:border-neutral-600' },
    ];

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-display text-2xl font-bold text-[#171717] dark:text-white">
              Kitchen Order Display (Live)
            </h2>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              Tickets sync automatically across connected stations via WebSockets.
            </p>
          </div>
          <button
            onClick={loadOrders}
            className="px-4 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 text-xs font-semibold text-[#171717] dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-neutral-800 cursor-pointer transition-colors"
          >
            Refresh Board
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 items-start">
          {columns.map((col) => (
            <div
              key={col.key}
              className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-[#141414] p-3.5 space-y-3 min-h-[420px] transition-colors"
            >
              <div className={`pb-2.5 border-b-2 ${col.accent} flex items-center justify-between`}>
                <h3 className="font-display font-bold text-sm text-[#171717] dark:text-white">
                  {col.title}
                </h3>
                <span className="font-mono text-xs font-bold text-neutral-600 dark:text-neutral-400 tabular-nums">
                  {col.items.length}
                </span>
              </div>

              {col.items.length === 0 ? (
                <p className="text-xs text-neutral-400 dark:text-neutral-500 py-8 text-center">
                  No tickets in queue
                </p>
              ) : (
                col.items.map((ord) => (
                  <div
                    key={ord.id}
                    className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#1A1A1A] p-3.5 space-y-2.5 shadow-sm transition-colors"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono font-bold text-sm text-[#171717] dark:text-white">
                        {ord.orderNumber}
                      </span>
                      <span className="text-[11px] font-semibold uppercase text-[#D62828] dark:text-[#FFC928]">
                        {ord.orderType}
                      </span>
                    </div>
                    <p className="text-xs text-neutral-500 dark:text-neutral-400">
                      {ord.branchName} · {new Date(ord.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>

                    <ul className="space-y-1.5 border-t border-neutral-100 dark:border-neutral-800 pt-2 text-xs">
                      {ord.items.map((it) => (
                        <li key={it.id} className="space-y-0.5">
                          <p className="font-semibold text-[#171717] dark:text-neutral-100">
                            {it.quantity}× {it.productNameSnapshot}
                          </p>
                          {it.customizationsSnapshot?.length > 0 && (
                            <p className="text-[11px] text-neutral-500 dark:text-neutral-400 pl-3">
                              + {it.customizationsSnapshot.map((c) => c.name).join(', ')}
                            </p>
                          )}
                          {it.comboSnapshot && (
                            <p className="text-[11px] text-neutral-500 dark:text-neutral-400 pl-3">
                              {it.comboSnapshot.sideName} · {it.comboSnapshot.drinkName}
                            </p>
                          )}
                          {it.specialInstructions && (
                            <p className="text-[11px] text-[#D62828] dark:text-red-400 font-medium pl-3">
                              Note: {it.specialInstructions}
                            </p>
                          )}
                        </li>
                      ))}
                    </ul>

                    {ord.deliveryInstructions && (
                      <p className="text-[11px] bg-[#FFF8ED] dark:bg-[#231B16] p-2 rounded text-neutral-700 dark:text-neutral-200">
                        Order Note: {ord.deliveryInstructions}
                      </p>
                    )}

                    <div className="pt-2 flex flex-wrap gap-1.5">
                      {(ord.status === 'pending' || ord.status === 'confirmed') && (
                        <button
                          onClick={() => updateOrderStatus(ord.id, 'preparing')}
                          className="flex-1 py-2 rounded-lg bg-[#FFC928] text-[#171717] text-xs font-bold hover:bg-amber-300 cursor-pointer"
                        >
                          Start Preparing
                        </button>
                      )}
                      {ord.status === 'preparing' && (
                        <button
                          onClick={() =>
                            updateOrderStatus(
                              ord.id,
                              ord.orderType === 'delivery' ? 'out_for_delivery' : 'ready_for_pickup'
                            )
                          }
                          className="flex-1 py-2 rounded-lg bg-[#D62828] text-white text-xs font-bold hover:bg-[#B51E1E] cursor-pointer"
                        >
                          {ord.orderType === 'delivery' ? 'Dispatch Courier' : 'Ready for Pickup'}
                        </button>
                      )}
                      {(ord.status === 'ready_for_pickup' || ord.status === 'out_for_delivery') && (
                        <button
                          onClick={() => updateOrderStatus(ord.id, 'completed')}
                          className="flex-1 py-2 rounded-lg bg-[#171717] dark:bg-neutral-800 text-white text-xs font-bold hover:bg-neutral-800 dark:hover:bg-neutral-700 cursor-pointer"
                        >
                          Complete Order
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Search & Status Filter */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search order #, customer, email..."
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 text-xs bg-white dark:bg-[#121212] text-[#171717] dark:text-neutral-100 placeholder:text-neutral-400 dark:placeholder:text-neutral-500"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 text-xs font-semibold bg-white dark:bg-[#121212] text-[#171717] dark:text-neutral-100"
        >
          <option value="all">All Statuses</option>
          <option value="pending">Pending</option>
          <option value="confirmed">Confirmed</option>
          <option value="preparing">Preparing</option>
          <option value="ready_for_pickup">Ready for Pickup</option>
          <option value="out_for_delivery">Out for Delivery</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>

      {loading ? (
        <div className="h-64 rounded-xl bg-neutral-100 dark:bg-neutral-800 animate-pulse" />
      ) : orders.length === 0 ? (
        <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#1A1A1A] p-10 text-center text-sm text-neutral-500 dark:text-neutral-400">
          No matching orders found.
        </div>
      ) : (
        <div className="space-y-4">
          {orders.map((ord) => (
            <div
              key={ord.id}
              className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#1A1A1A] p-5 space-y-4 transition-colors"
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <span className="font-mono font-extrabold text-base text-[#171717] dark:text-white">
                      {ord.orderNumber}
                    </span>
                    <span className="text-xs font-semibold uppercase text-[#D62828] dark:text-[#FFC928]">
                      {ord.orderType}
                    </span>
                    <span className="text-xs text-neutral-500 dark:text-neutral-400">
                      · {ord.branch?.name || 'Branch'} · {new Date(ord.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300 mt-1">
                    {ord.customerName} · {ord.customerPhone} · {ord.customerEmail}
                  </p>
                  {ord.deliveryAddress && (
                    <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
                      Address: {ord.deliveryAddress}
                    </p>
                  )}
                </div>

                <div className="text-right">
                  <p className="font-mono text-lg font-extrabold text-[#171717] dark:text-white tabular-nums">
                    {formatMoney(ord.totalCents, currencySymbol)}
                  </p>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400 uppercase">
                    {ord.paymentMethod.replace(/_/g, ' ')} ·{' '}
                    <strong
                      className={
                        ord.paymentStatus === 'paid'
                          ? 'text-emerald-700 dark:text-emerald-400'
                          : 'text-amber-700 dark:text-amber-400'
                      }
                    >
                      {ord.paymentStatus.replace(/_/g, ' ')}
                    </strong>
                  </p>
                </div>
              </div>

              {/* Items Snapshot */}
              <div className="bg-neutral-50 dark:bg-[#141414] rounded-lg p-3 text-xs space-y-1 text-neutral-800 dark:text-neutral-200">
                {(ord.items ?? []).map((it) => (
                  <div key={it.id} className="flex justify-between gap-2">
                    <span>
                      <strong>{it.quantity}×</strong> {it.productNameSnapshot}
                      {it.customizationsSnapshot?.length > 0
                        ? ` (${it.customizationsSnapshot.map((c) => c.name).join(', ')})`
                        : ''}
                    </span>
                    <span className="font-mono tabular-nums">
                      {formatMoney(it.lineTotalCents, currencySymbol)}
                    </span>
                  </div>
                ))}
              </div>

              {/* Action Controls */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-neutral-100 dark:border-neutral-800">
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={ord.status}
                    onChange={(e) => updateOrderStatus(ord.id, e.target.value)}
                    className="px-3 py-1.5 rounded-lg border border-neutral-300 dark:border-neutral-700 text-xs font-semibold bg-white dark:bg-[#121212] text-[#171717] dark:text-neutral-100"
                  >
                    <option value="pending">Pending</option>
                    <option value="confirmed">Confirmed</option>
                    <option value="preparing">Preparing</option>
                    <option value="ready_for_pickup">Ready for Pickup</option>
                    <option value="out_for_delivery">Out for Delivery</option>
                    <option value="completed">Completed</option>
                    <option value="cancelled">Cancelled</option>
                  </select>

                  {ord.status === 'pending' && (
                    <button
                      onClick={() => updateOrderStatus(ord.id, 'confirmed')}
                      className="px-3 py-1.5 rounded-lg bg-[#D62828] text-white text-xs font-semibold cursor-pointer"
                    >
                      Confirm Order
                    </button>
                  )}

                  {ord.paymentStatus !== 'paid' && ord.status !== 'cancelled' && (
                    <button
                      onClick={() => markPaymentPaid(ord.id)}
                      className="px-3 py-1.5 rounded-lg bg-emerald-700 text-white text-xs font-semibold cursor-pointer"
                    >
                      Mark Paid / Collected
                    </button>
                  )}
                </div>

                <button
                  onClick={() => setReceiptOrder(ord)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-neutral-300 dark:border-neutral-700 text-xs font-semibold text-neutral-700 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-neutral-800 cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Print Receipt</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Printable Receipt Modal */}
      {receiptOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 print:bg-white print:p-0">
          <div className="bg-white dark:bg-[#1A1A1A] dark:border dark:border-neutral-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl print:bg-white print:text-[#171717] print:shadow-none print:border-0">
            <div className="flex items-center justify-between border-b border-neutral-200 dark:border-neutral-800 pb-3 no-print">
              <h3 className="font-display font-bold text-lg text-[#171717] dark:text-white">
                Order Receipt
              </h3>
              <button
                onClick={() => setReceiptOrder(null)}
                className="p-1 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-600 dark:text-neutral-300 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="font-mono text-xs space-y-3 text-[#171717] dark:text-neutral-100 print:text-[#171717]">
              <div className="text-center border-b border-dashed border-neutral-300 dark:border-neutral-700 print:border-neutral-300 pb-3">
                <p className="text-base font-bold">JUST BURGER</p>
                <p>{receiptOrder.branch?.name}</p>
                <p>{receiptOrder.branch?.address}</p>
              </div>
              <div>
                <p>Order #: {receiptOrder.orderNumber}</p>
                <p>Date: {new Date(receiptOrder.createdAt).toLocaleString()}</p>
                <p>Customer: {receiptOrder.customerName}</p>
                <p>Type: {receiptOrder.orderType.toUpperCase()}</p>
              </div>
              <div className="border-y border-dashed border-neutral-300 dark:border-neutral-700 print:border-neutral-300 py-2 space-y-1">
                {(receiptOrder.items ?? []).map((it) => (
                  <div key={it.id} className="flex justify-between">
                    <span>
                      {it.quantity}x {it.productNameSnapshot}
                    </span>
                    <span>{formatMoney(it.lineTotalCents, currencySymbol)}</span>
                  </div>
                ))}
              </div>
              <div className="space-y-1">
                <div className="flex justify-between">
                  <span>Subtotal</span>
                  <span>{formatMoney(receiptOrder.subtotalCents, currencySymbol)}</span>
                </div>
                {receiptOrder.discountCents > 0 && (
                  <div className="flex justify-between">
                    <span>Discount</span>
                    <span>-{formatMoney(receiptOrder.discountCents, currencySymbol)}</span>
                  </div>
                )}
                {receiptOrder.deliveryFeeCents > 0 && (
                  <div className="flex justify-between">
                    <span>Delivery</span>
                    <span>{formatMoney(receiptOrder.deliveryFeeCents, currencySymbol)}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold text-sm pt-1">
                  <span>TOTAL</span>
                  <span>{formatMoney(receiptOrder.totalCents, currencySymbol)}</span>
                </div>
              </div>
            </div>
            <button
              onClick={() => window.print()}
              className="w-full py-2.5 rounded-xl bg-[#171717] dark:bg-[#D62828] dark:hover:bg-[#B51E1E] text-white text-xs font-semibold no-print cursor-pointer"
            >
              Print Now
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
