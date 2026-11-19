import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Clock, MapPin, Package, Search, ShieldCheck, Truck, XCircle } from 'lucide-react';
import { useApp } from '../context/AppContext.tsx';
import { apiFetch, formatMoney } from '../lib/api.ts';
import { Order } from '../types.ts';
import { ProductImage } from '../components/ProductImage.tsx';

const PICKUP_STEPS = [
  { key: 'pending', label: 'Order Placed' },
  { key: 'confirmed', label: 'Confirmed' },
  { key: 'preparing', label: 'Preparing' },
  { key: 'ready_for_pickup', label: 'Ready for Pickup' },
  { key: 'completed', label: 'Completed' },
];

const DELIVERY_STEPS = [
  { key: 'pending', label: 'Order Placed' },
  { key: 'confirmed', label: 'Confirmed' },
  { key: 'preparing', label: 'Preparing' },
  { key: 'out_for_delivery', label: 'Out for Delivery' },
  { key: 'completed', label: 'Completed' },
];

export const OrderTrackingPage: React.FC<{ initialOrderNumber?: string }> = ({
  initialOrderNumber = '',
}) => {
  const { user, navigate, currencySymbol, realtimeTick, showToast } = useApp();
  const [searchInput, setSearchInput] = useState(initialOrderNumber);
  const [order, setOrder] = useState<Order | null>(null);
  const [recentOrders, setRecentOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [gatewayRef, setGatewayRef] = useState('');

  const fetchOrder = useCallback(async (ordNum: string) => {
    if (!ordNum.trim()) return;
    setLoading(true);
    setErrorMsg('');
    try {
      const res = await apiFetch<{ order: Order }>(`/api/orders/${encodeURIComponent(ordNum.trim())}`);
      setOrder(res.order);
    } catch (err: unknown) {
      setOrder(null);
      setErrorMsg(err instanceof Error ? err.message : 'Order not found');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (initialOrderNumber && user) {
      setSearchInput(initialOrderNumber);
      fetchOrder(initialOrderNumber);
    }
  }, [initialOrderNumber, user, fetchOrder, realtimeTick]);

  useEffect(() => {
    if (!user) return;
    apiFetch<{ orders: Order[] }>('/api/orders/my')
      .then((res) => setRecentOrders(res.orders.slice(0, 5)))
      .catch(() => {});
  }, [user, realtimeTick]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      showToast('Please sign in to track your orders.', 'info');
      navigate('/auth/signin');
      return;
    }
    if (!searchInput.trim()) return;
    navigate(`/track/${searchInput.trim().toUpperCase()}`);
    fetchOrder(searchInput.trim());
  };

  const handleVerifyPendingPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!order) return;
    try {
      await apiFetch(`/api/payments/${order.id}/verify`, {
        method: 'POST',
        body: JSON.stringify({ referenceCode: gatewayRef }),
      });
      showToast('Payment reference verified!', 'success');
      setGatewayRef('');
      fetchOrder(order.orderNumber);
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Verification failed', 'error');
    }
  };

  const steps = order?.orderType === 'delivery' ? DELIVERY_STEPS : PICKUP_STEPS;
  const activeStepIdx = order ? steps.findIndex((s) => s.key === order.status) : -1;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10 min-h-[75vh]">
      <div className="mb-8">
        <h1 className="font-display text-3xl sm:text-4xl font-extrabold text-[#171717] dark:text-white">
          Track Your Order
        </h1>
        <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-1">
          Follow real-time grill preparation, pickup readiness, or courier delivery updates.
        </p>
      </div>

      {/* Order Lookup Bar */}
      <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-3 mb-8">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-neutral-400 absolute left-4 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Enter Order Number (e.g. JB-26123456)"
            className="w-full pl-11 pr-4 py-3 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-[#141414] text-[#171717] dark:text-neutral-100 placeholder:text-neutral-400 dark:placeholder:text-neutral-500 font-mono text-sm uppercase focus:outline-none focus:border-[#D62828]"
          />
        </div>
        <button
          type="submit"
          className="px-6 py-3 rounded-xl bg-[#D62828] hover:bg-[#B51E1E] text-white font-semibold text-sm cursor-pointer"
        >
          Track Order
        </button>
      </form>

      {!user && (
        <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-[#FFF8ED] dark:bg-[#191614] p-6 mb-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-sm text-[#171717] dark:text-neutral-200">
            Sign in to view your live orders and real-time kitchen tracking timeline.
          </p>
          <button
            onClick={() => navigate('/auth/signin')}
            className="px-5 py-2.5 rounded-xl bg-[#171717] dark:bg-[#D62828] text-white text-xs font-semibold shrink-0 cursor-pointer"
          >
            Sign In
          </button>
        </div>
      )}

      {user && recentOrders.length > 0 && !order && (
        <div className="mb-8 space-y-3">
          <h2 className="font-display text-base font-bold text-[#171717] dark:text-white">Your Recent Orders</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {recentOrders.map((ro) => (
              <button
                key={ro.id}
                onClick={() => {
                  setSearchInput(ro.orderNumber);
                  navigate(`/track/${ro.orderNumber}`);
                  fetchOrder(ro.orderNumber);
                }}
                className="p-4 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#1A1A1A] hover:border-[#D62828] text-left flex items-center justify-between cursor-pointer"
              >
                <div>
                  <p className="font-mono font-bold text-sm text-[#171717] dark:text-white">{ro.orderNumber}</p>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
                    {new Date(ro.createdAt).toLocaleString()} · {ro.status.replace(/_/g, ' ')}
                  </p>
                </div>
                <span className="font-mono text-sm font-bold text-[#D62828] dark:text-[#FFC928] tabular-nums">
                  {formatMoney(ro.totalCents, currencySymbol)}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {loading && <div className="h-64 rounded-2xl bg-neutral-100 dark:bg-neutral-800 animate-pulse" />}

      {errorMsg && (
        <div className="rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 p-4 text-sm text-[#D62828] dark:text-red-400">
          {errorMsg}
        </div>
      )}

      {order && !loading && (
        <div className="space-y-6">
          {/* Header Card */}
          <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#1A1A1A] p-6 space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4 pb-5 border-b border-neutral-200 dark:border-neutral-800">
              <div>
                <p className="text-xs text-neutral-500 dark:text-neutral-400">
                  Placed {new Date(order.createdAt).toLocaleString()} ·{' '}
                  {order.orderType === 'delivery' ? 'Delivery' : 'Store Pickup'}
                </p>
                <h2 className="font-mono text-2xl font-extrabold text-[#171717] dark:text-white mt-0.5">
                  {order.orderNumber}
                </h2>
              </div>
              <div className="text-right">
                <p className="text-xs text-neutral-500 dark:text-neutral-400">
                  Payment: {order.paymentMethod.replace(/_/g, ' ').toUpperCase()}
                </p>
                <p
                  className={`font-semibold text-sm mt-0.5 ${
                    order.paymentStatus === 'paid'
                      ? 'text-emerald-700 dark:text-emerald-400'
                      : order.paymentStatus === 'pending_verification'
                        ? 'text-amber-700 dark:text-amber-400'
                        : 'text-[#171717] dark:text-neutral-200'
                  }`}
                >
                  {order.paymentStatus.replace(/_/g, ' ').toUpperCase()}
                </p>
              </div>
            </div>

            {/* Payment Verification Alert if Online Payment Pending */}
            {order.paymentStatus === 'pending_verification' && order.status !== 'cancelled' && (
              <form
                onSubmit={handleVerifyPendingPayment}
                className="rounded-xl bg-[#FFF8ED] dark:bg-[#231B16] border border-amber-200 dark:border-amber-900/50 p-4 flex flex-col sm:flex-row items-stretch sm:items-center gap-3"
              >
                <div className="flex-1 text-xs text-neutral-700 dark:text-neutral-300">
                  <strong className="text-[#171717] dark:text-white block mb-0.5">
                    Action Required: Verify Payment Reference
                  </strong>
                  Submit your gateway reference number to confirm payment.
                </div>
                <input
                  type="text"
                  required
                  minLength={6}
                  value={gatewayRef}
                  onChange={(e) => setGatewayRef(e.target.value)}
                  placeholder="Ref # (min 6 chars)"
                  className="px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-[#121212] text-[#171717] dark:text-neutral-100 placeholder:text-neutral-400 dark:placeholder:text-neutral-500 font-mono text-xs uppercase"
                />
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-[#D62828] text-white text-xs font-semibold cursor-pointer"
                >
                  Verify
                </button>
              </form>
            )}

            {/* Progress Timeline */}
            {order.status === 'cancelled' ? (
              <div className="rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 p-4 flex items-center gap-3 text-[#D62828] dark:text-red-400">
                <XCircle className="w-5 h-5 shrink-0" />
                <div className="text-sm">
                  <p className="font-bold">Order Cancelled</p>
                  {order.rejectionReason && <p className="text-xs mt-0.5">{order.rejectionReason}</p>}
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                {steps.map((step, idx) => {
                  const done = activeStepIdx >= idx;
                  return (
                    <div
                      key={step.key}
                      className={`p-3 rounded-xl border ${
                        done
                          ? 'border-[#D62828] bg-[#FFF8ED] dark:bg-[#231B16] text-[#171717] dark:text-white'
                          : 'border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-[#141414] text-neutral-400 dark:text-neutral-500'
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        {done ? (
                          <CheckCircle2 className="w-4 h-4 text-[#D62828]" />
                        ) : (
                          <Clock className="w-4 h-4" />
                        )}
                        <span className="font-mono text-xs font-bold">0{idx + 1}</span>
                      </div>
                      <p className="text-xs font-semibold">{step.label}</p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Order Items & Branch Info */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
            <div className="md:col-span-7 rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#1A1A1A] p-6 space-y-4">
              <h3 className="font-display text-lg font-bold text-[#171717] dark:text-white flex items-center gap-2">
                <Package className="w-4 h-4 text-[#D62828]" />
                <span>Ordered Items</span>
              </h3>
              <div className="space-y-3 divide-y divide-neutral-100 dark:divide-neutral-800">
                {(order.items ?? []).map((item) => (
                  <div key={item.id} className="pt-3 first:pt-0 flex gap-3 items-start">
                    <ProductImage
                      src={item.productImageSnapshot}
                      alt={item.productNameSnapshot}
                      className="w-14 h-14 rounded-lg object-cover shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-[#171717] dark:text-white">
                        {item.quantity}× {item.productNameSnapshot}
                      </p>
                      {item.customizationsSnapshot?.length > 0 && (
                        <p className="text-xs text-neutral-500 dark:text-neutral-400">
                          {item.customizationsSnapshot.map((c) => c.name).join(' · ')}
                        </p>
                      )}
                      {item.comboSnapshot && (
                        <p className="text-xs text-neutral-500 dark:text-neutral-400">
                          Side: {item.comboSnapshot.sideName} · Drink: {item.comboSnapshot.drinkName}
                        </p>
                      )}
                    </div>
                    <span className="font-mono text-sm font-semibold tabular-nums text-[#171717] dark:text-neutral-100">
                      {formatMoney(item.lineTotalCents, currencySymbol)}
                    </span>
                  </div>
                ))}
              </div>

              <div className="pt-4 border-t border-neutral-200 dark:border-neutral-800 space-y-1 text-sm">
                <div className="flex justify-between text-neutral-600 dark:text-neutral-400">
                  <span>Subtotal</span>
                  <span className="font-mono tabular-nums">
                    {formatMoney(order.subtotalCents, currencySymbol)}
                  </span>
                </div>
                {order.discountCents > 0 && (
                  <div className="flex justify-between text-emerald-700 dark:text-emerald-400">
                    <span>Discount</span>
                    <span className="font-mono tabular-nums">
                      -{formatMoney(order.discountCents, currencySymbol)}
                    </span>
                  </div>
                )}
                {order.deliveryFeeCents > 0 && (
                  <div className="flex justify-between text-neutral-600 dark:text-neutral-400">
                    <span>Delivery Fee</span>
                    <span className="font-mono tabular-nums">
                      {formatMoney(order.deliveryFeeCents, currencySymbol)}
                    </span>
                  </div>
                )}
                <div className="flex justify-between font-bold text-[#171717] dark:text-white text-base pt-2">
                  <span>Total</span>
                  <span className="font-mono text-[#D62828] dark:text-[#FFC928] tabular-nums">
                    {formatMoney(order.totalCents, currencySymbol)}
                  </span>
                </div>
              </div>
            </div>

            <div className="md:col-span-5 space-y-6">
              {order.branch && (
                <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#1A1A1A] p-6 space-y-2">
                  <h3 className="font-display text-base font-bold text-[#171717] dark:text-white flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-[#D62828]" />
                    <span>Kitchen Branch</span>
                  </h3>
                  <p className="font-semibold text-sm text-[#171717] dark:text-neutral-100">{order.branch.name}</p>
                  <p className="text-xs text-neutral-600 dark:text-neutral-400">{order.branch.address}</p>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400">{order.branch.phone}</p>
                </div>
              )}

              {order.deliveryAddress && (
                <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#1A1A1A] p-6 space-y-2">
                  <h3 className="font-display text-base font-bold text-[#171717] dark:text-white flex items-center gap-2">
                    <Truck className="w-4 h-4 text-[#D62828]" />
                    <span>Delivery Address</span>
                  </h3>
                  <p className="text-sm text-neutral-700 dark:text-neutral-300">{order.deliveryAddress}</p>
                  {order.deliveryInstructions && (
                    <p className="text-xs text-neutral-500 dark:text-neutral-400">Notes: {order.deliveryInstructions}</p>
                  )}
                </div>
              )}

              {order.history && order.history.length > 0 && (
                <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#1A1A1A] p-6 space-y-3">
                  <h3 className="font-display text-base font-bold text-[#171717] dark:text-white flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-[#D62828]" />
                    <span>Activity Log</span>
                  </h3>
                  <ul className="space-y-2.5 text-xs">
                    {order.history.map((h) => (
                      <li key={h.id} className="pb-2 border-b border-neutral-100 dark:border-neutral-800 last:border-0">
                        <p className="font-semibold text-[#171717] dark:text-neutral-100 capitalize">
                          {h.newStatus.replace(/_/g, ' ')}
                        </p>
                        {h.note && <p className="text-neutral-600 dark:text-neutral-400">{h.note}</p>}
                        <p className="text-neutral-400 dark:text-neutral-500 mt-0.5">
                          {new Date(h.createdAt).toLocaleString()}
                        </p>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
