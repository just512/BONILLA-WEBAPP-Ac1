import React, { useEffect, useMemo, useState } from 'react';
import { Award, CheckCircle2, CreditCard, MapPin, ShieldCheck, Store, Truck } from 'lucide-react';
import { useApp } from '../context/AppContext.tsx';
import { apiFetch, formatMoney } from '../lib/api.ts';
import { Address, Order } from '../types.ts';

export const CheckoutPage: React.FC = () => {
  const {
    user,
    authReady,
    cart,
    branches,
    settings,
    currencySymbol,
    navigate,
    setPendingRedirect,
    refreshCart,
    selectCartBranch,
    applyCoupon,
    removeCoupon,
    showToast,
  } = useApp();

  const [orderType, setOrderType] = useState<'pickup' | 'delivery'>('pickup');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [deliveryInstructions, setDeliveryInstructions] = useState('');
  const [scheduledPickupAt, setScheduledPickupAt] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<string>('cash_on_pickup');
  const [promoCode, setPromoCode] = useState('');
  const [savedAddresses, setSavedAddresses] = useState<Address[]>([]);
  const [pointsBalance, setPointsBalance] = useState(0);
  const [selectedRewardId, setSelectedRewardId] = useState<string>('');
  const [placingOrder, setPlacingOrder] = useState(false);

  // Payment Gateway Verification Step (for GCash / Card)
  const [pendingOrder, setPendingOrder] = useState<Order | null>(null);
  const [gatewayRef, setGatewayRef] = useState('');
  const [verifyingPayment, setVerifyingPayment] = useState(false);

  useEffect(() => {
    if (authReady && !user) {
      setPendingRedirect('/checkout');
      navigate('/auth/signin');
    }
  }, [authReady, user, navigate, setPendingRedirect]);

  useEffect(() => {
    if (!user) return;
    setCustomerName((prev) => prev || user.fullName || '');
    setCustomerPhone((prev) => prev || user.phone || '');
    setCustomerEmail((prev) => prev || user.email || '');

    apiFetch<{ addresses: Address[] }>('/api/account/addresses')
      .then((res) => {
        setSavedAddresses(res.addresses);
        const def = res.addresses.find((a) => a.isDefault) ?? res.addresses[0];
        if (def && !deliveryAddress) {
          setDeliveryAddress(
            `${def.streetAddress}${def.district ? `, ${def.district}` : ''}, ${def.city} ${def.postalCode}`.trim()
          );
          if (def.deliveryNotes) setDeliveryInstructions(def.deliveryNotes);
        }
      })
      .catch(() => {});

    apiFetch<{ account: { pointsBalance: number } }>('/api/account/loyalty')
      .then((res) => setPointsBalance(res.account.pointsBalance))
      .catch(() => {});
  }, [user]);

  const activeBranch = useMemo(
    () => branches.find((b) => b.id === cart?.branchId) ?? branches[0] ?? null,
    [branches, cart?.branchId]
  );

  // Enforce branch supported ordering modes
  useEffect(() => {
    if (!activeBranch) return;
    if (orderType === 'delivery' && !activeBranch.supportsDelivery) {
      setOrderType('pickup');
    } else if (orderType === 'pickup' && !activeBranch.supportsPickup && activeBranch.supportsDelivery) {
      setOrderType('delivery');
    }
  }, [activeBranch, orderType]);

  // Enforce valid payment methods based on orderType + storeSettings
  const availablePaymentMethods = useMemo(() => {
    const cfg = settings.payment_config ?? {
      cash_on_pickup: true,
      cash_on_delivery: true,
      gcash: true,
      card: true,
    };
    const list: Array<{ id: string; label: string; desc: string }> = [];
    if (orderType === 'pickup' && cfg.cash_on_pickup) {
      list.push({
        id: 'cash_on_pickup',
        label: 'Cash on Pickup',
        desc: 'Pay at the counter when picking up your order.',
      });
    }
    if (orderType === 'delivery' && cfg.cash_on_delivery) {
      list.push({
        id: 'cash_on_delivery',
        label: 'Cash on Delivery',
        desc: 'Pay our courier in cash upon arrival.',
      });
    }
    if (cfg.gcash) {
      list.push({
        id: 'gcash',
        label: 'GCash E-Wallet',
        desc: 'Requires payment reference confirmation before kitchen prep.',
      });
    }
    if (cfg.card) {
      list.push({
        id: 'card',
        label: 'Credit / Debit Card',
        desc: 'Requires gateway authorization reference confirmation.',
      });
    }
    return list;
  }, [orderType, settings.payment_config]);

  useEffect(() => {
    if (availablePaymentMethods.length > 0) {
      const stillValid = availablePaymentMethods.some((m) => m.id === paymentMethod);
      if (!stillValid) setPaymentMethod(availablePaymentMethods[0].id);
    }
  }, [availablePaymentMethods, paymentMethod]);

  const rewardsCatalog = settings.loyalty_rules?.rewardsCatalog ?? [];
  const selectedReward = rewardsCatalog.find((r) => r.id === selectedRewardId) ?? null;

  const subtotal = cart?.subtotalCents ?? 0;
  const promoDiscount = cart?.discountCents ?? 0;
  const rewardDiscount = selectedReward ? selectedReward.discountCents : 0;
  const totalDiscount = Math.min(subtotal, promoDiscount + rewardDiscount);
  const deliveryFee = orderType === 'delivery' && activeBranch ? activeBranch.deliveryFeeCents : 0;
  const grandTotal = Math.max(0, subtotal - totalDiscount + deliveryFee);

  const handlePlaceOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeBranch) return;
    setPlacingOrder(true);
    try {
      const res = await apiFetch<{ order: Order; requiresPaymentVerification: boolean }>(
        '/api/checkout',
        {
          method: 'POST',
          body: JSON.stringify({
            branchId: activeBranch.id,
            orderType,
            customerName,
            customerPhone,
            customerEmail,
            deliveryAddress: orderType === 'delivery' ? deliveryAddress : null,
            deliveryInstructions,
            scheduledPickupAt: scheduledPickupAt || null,
            paymentMethod,
            couponCode: cart?.couponCode || null,
            rewardId: selectedRewardId || null,
          }),
        }
      );
      await refreshCart();
      if (res.requiresPaymentVerification) {
        setPendingOrder(res.order);
        showToast('Order created — complete payment reference verification below.', 'info');
      } else {
        showToast(`Order ${res.order.orderNumber} placed!`, 'success');
        navigate(`/track/${res.order.orderNumber}`);
      }
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Checkout failed', 'error');
    } finally {
      setPlacingOrder(false);
    }
  };

  const handleVerifyPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingOrder) return;
    setVerifyingPayment(true);
    try {
      await apiFetch(`/api/payments/${pendingOrder.id}/verify`, {
        method: 'POST',
        body: JSON.stringify({ referenceCode: gatewayRef }),
      });
      showToast('Payment verified! Sending your order to the kitchen.', 'success');
      navigate(`/track/${pendingOrder.orderNumber}`);
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Verification failed', 'error');
    } finally {
      setVerifyingPayment(false);
    }
  };

  if (!user) return null;

  if (pendingOrder) {
    return (
      <div className="max-w-xl mx-auto px-4 py-14">
        <div className="rounded-2xl border border-neutral-200 bg-white p-8 shadow-lg space-y-6">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-[#FFF8ED] text-[#D62828] flex items-center justify-center">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <h1 className="font-display text-2xl font-bold text-[#171717]">
                Confirm Online Payment
              </h1>
              <p className="text-xs text-neutral-500">
                Order {pendingOrder.orderNumber} · Total{' '}
                {formatMoney(pendingOrder.totalCents, currencySymbol)}
              </p>
            </div>
          </div>

          <div className="rounded-xl bg-[#FFF8ED] border border-amber-200 p-4 text-sm text-neutral-700 space-y-2">
            <p className="font-semibold text-[#171717]">
              Payment Method: {pendingOrder.paymentMethod === 'gcash' ? 'GCash E-Wallet' : 'Card Gateway'}
            </p>
            <p className="text-xs leading-relaxed">
              We never mark an online payment as paid without confirmed gateway verification. Complete
              your transfer to <strong>JUST BURGER Kitchens</strong> and submit your 6+ character
              transaction reference below.
            </p>
          </div>

          <form onSubmit={handleVerifyPayment} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-neutral-700 mb-1">
                Payment Reference / Authorization Code
              </label>
              <input
                type="text"
                required
                minLength={6}
                value={gatewayRef}
                onChange={(e) => setGatewayRef(e.target.value)}
                placeholder="e.g. GCASH-948271 or AUTH-88412"
                className="w-full px-4 py-3 rounded-xl border border-neutral-300 font-mono text-sm uppercase"
              />
            </div>

            <button
              type="submit"
              disabled={verifyingPayment}
              className="w-full py-3.5 rounded-xl bg-[#D62828] hover:bg-[#B51E1E] text-white font-semibold text-sm cursor-pointer"
            >
              {verifyingPayment ? 'Verifying Transaction...' : 'Verify Payment & Track Order'}
            </button>
            <button
              type="button"
              onClick={() => navigate(`/track/${pendingOrder.orderNumber}`)}
              className="w-full py-2 text-xs text-neutral-500 hover:text-[#171717] cursor-pointer"
            >
              Verify Later (Keep as Pending Verification)
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (!cart || cart.items.length === 0) {
    return (
      <div className="max-w-xl mx-auto px-4 py-20 text-center">
        <h1 className="font-display text-2xl font-bold text-[#171717]">Your cart is empty</h1>
        <p className="text-sm text-neutral-500 mt-1 mb-6">
          Add burgers or a custom combo before checking out.
        </p>
        <button
          onClick={() => navigate('/menu')}
          className="px-6 py-3 rounded-xl bg-[#D62828] text-white text-sm font-semibold cursor-pointer"
        >
          Browse Menu
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10">
      <h1 className="font-display text-3xl font-extrabold text-[#171717] mb-8">Checkout</h1>

      <form onSubmit={handlePlaceOrder} className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Form Steps */}
        <div className="lg:col-span-7 space-y-6">
          {/* 1. Branch Selection */}
          <section className="rounded-2xl border border-neutral-200 p-6 space-y-4">
            <h2 className="font-display text-lg font-bold text-[#171717] flex items-center gap-2">
              <Store className="w-5 h-5 text-[#D62828]" />
              <span>1. Select Kitchen Branch</span>
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {branches.map((b) => {
                const selected = activeBranch?.id === b.id;
                return (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => selectCartBranch(b.id)}
                    className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
                      selected
                        ? 'border-[#D62828] bg-[#FFF8ED]'
                        : 'border-neutral-200 hover:border-neutral-400'
                    }`}
                  >
                    <p className="font-semibold text-sm text-[#171717]">{b.name}</p>
                    <p className="text-xs text-neutral-500 mt-0.5">{b.address}</p>
                    <p className="text-xs font-medium text-[#D62828] mt-1.5">
                      {b.supportsPickup && b.supportsDelivery
                        ? `Pickup & Delivery (${formatMoney(b.deliveryFeeCents, currencySymbol)})`
                        : 'Store Pickup Only'}
                    </p>
                  </button>
                );
              })}
            </div>
          </section>

          {/* 2. Ordering Option */}
          <section className="rounded-2xl border border-neutral-200 p-6 space-y-4">
            <h2 className="font-display text-lg font-bold text-[#171717]">
              2. Ordering Method
            </h2>
            <div className="grid grid-cols-2 gap-3">
              {activeBranch?.supportsPickup && (
                <button
                  type="button"
                  onClick={() => setOrderType('pickup')}
                  className={`flex items-center gap-3 p-4 rounded-xl border text-left cursor-pointer ${
                    orderType === 'pickup'
                      ? 'border-[#D62828] bg-[#FFF8ED]'
                      : 'border-neutral-200'
                  }`}
                >
                  <Store className="w-5 h-5 text-[#D62828] shrink-0" />
                  <div>
                    <p className="font-semibold text-sm text-[#171717]">Store Pickup</p>
                    <p className="text-xs text-neutral-500">
                      Ready in ~{activeBranch.estimatedPrepMinutes} mins · Free
                    </p>
                  </div>
                </button>
              )}

              {activeBranch?.supportsDelivery && (
                <button
                  type="button"
                  onClick={() => setOrderType('delivery')}
                  className={`flex items-center gap-3 p-4 rounded-xl border text-left cursor-pointer ${
                    orderType === 'delivery'
                      ? 'border-[#D62828] bg-[#FFF8ED]'
                      : 'border-neutral-200'
                  }`}
                >
                  <Truck className="w-5 h-5 text-[#D62828] shrink-0" />
                  <div>
                    <p className="font-semibold text-sm text-[#171717]">Delivery</p>
                    <p className="text-xs text-neutral-500">
                      Fee {formatMoney(activeBranch.deliveryFeeCents, currencySymbol)}
                    </p>
                  </div>
                </button>
              )}
            </div>

            {orderType === 'pickup' ? (
              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1">
                  Scheduled Pickup Time (Optional — leave blank for ASAP)
                </label>
                <input
                  type="datetime-local"
                  value={scheduledPickupAt}
                  onChange={(e) => setScheduledPickupAt(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-neutral-300 text-sm"
                />
              </div>
            ) : (
              <div className="space-y-3">
                {savedAddresses.length > 0 && (
                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold text-neutral-700">
                      Saved Addresses
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {savedAddresses.map((addr) => {
                        const formatted = `${addr.streetAddress}${addr.district ? `, ${addr.district}` : ''}, ${addr.city} ${addr.postalCode}`.trim();
                        return (
                          <button
                            key={addr.id}
                            type="button"
                            onClick={() => {
                              setDeliveryAddress(formatted);
                              if (addr.deliveryNotes) setDeliveryInstructions(addr.deliveryNotes);
                            }}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-neutral-300 text-xs font-medium hover:border-[#D62828] cursor-pointer"
                          >
                            <MapPin className="w-3.5 h-3.5 text-[#D62828]" />
                            {addr.label}: {addr.streetAddress}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-1">
                    Full Delivery Address
                  </label>
                  <input
                    type="text"
                    required
                    value={deliveryAddress}
                    onChange={(e) => setDeliveryAddress(e.target.value)}
                    placeholder="Street number, building/unit, district, city"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-neutral-300 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-1">
                    Delivery Instructions (Optional)
                  </label>
                  <input
                    type="text"
                    value={deliveryInstructions}
                    onChange={(e) => setDeliveryInstructions(e.target.value)}
                    placeholder="Gate code, drop-off spot, landmark..."
                    className="w-full px-3.5 py-2.5 rounded-xl border border-neutral-300 text-sm"
                  />
                </div>
              </div>
            )}
          </section>

          {/* 3. Customer Contact */}
          <section className="rounded-2xl border border-neutral-200 p-6 space-y-4">
            <h2 className="font-display text-lg font-bold text-[#171717]">
              3. Customer Contact Details
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1">Full Name</label>
                <input
                  type="text"
                  required
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-neutral-300 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1">
                  Contact Number
                </label>
                <input
                  type="tel"
                  required
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  placeholder="(555) 000-0000"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-neutral-300 text-sm"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-neutral-700 mb-1">
                  Email Address
                </label>
                <input
                  type="email"
                  required
                  value={customerEmail}
                  onChange={(e) => setCustomerEmail(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-neutral-300 text-sm"
                />
              </div>
            </div>
          </section>

          {/* 4. Payment Method */}
          <section className="rounded-2xl border border-neutral-200 p-6 space-y-4">
            <h2 className="font-display text-lg font-bold text-[#171717] flex items-center gap-2">
              <CreditCard className="w-5 h-5 text-[#D62828]" />
              <span>4. Payment Method</span>
            </h2>
            <div className="space-y-2.5">
              {availablePaymentMethods.map((m) => (
                <label
                  key={m.id}
                  className={`flex items-start gap-3 p-3.5 rounded-xl border cursor-pointer ${
                    paymentMethod === m.id
                      ? 'border-[#D62828] bg-[#FFF8ED]'
                      : 'border-neutral-200 hover:border-neutral-400'
                  }`}
                >
                  <input
                    type="radio"
                    name="paymentMethod"
                    value={m.id}
                    checked={paymentMethod === m.id}
                    onChange={() => setPaymentMethod(m.id)}
                    className="mt-1 accent-[#D62828]"
                  />
                  <div>
                    <p className="font-semibold text-sm text-[#171717]">{m.label}</p>
                    <p className="text-xs text-neutral-500 mt-0.5">{m.desc}</p>
                  </div>
                </label>
              ))}
            </div>
          </section>
        </div>

        {/* Right Order Summary */}
        <aside className="lg:col-span-5 lg:sticky lg:top-24 rounded-2xl border border-neutral-200 bg-neutral-50 p-6 space-y-5">
          <h2 className="font-display text-xl font-bold text-[#171717]">Order Summary</h2>

          <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
            {cart.items.map((item) => (
              <div key={item.id} className="flex justify-between gap-3 text-sm">
                <div className="min-w-0">
                  <p className="font-medium text-[#171717]">
                    <span className="font-mono font-bold mr-1.5">{item.quantity}×</span>
                    {item.displayName}
                  </p>
                  {item.selectedCustomizations.length > 0 && (
                    <p className="text-xs text-neutral-500 truncate">
                      {item.selectedCustomizations.map((c) => c.name).join(', ')}
                    </p>
                  )}
                </div>
                <span className="font-mono font-semibold shrink-0 tabular-nums">
                  {formatMoney(item.unitPriceCents * item.quantity, currencySymbol)}
                </span>
              </div>
            ))}
          </div>

          {/* Promo Code */}
          <div className="pt-3 border-t border-neutral-200">
            {cart.couponCode ? (
              <div className="flex items-center justify-between text-xs bg-[#FFF8ED] border border-amber-200 px-3 py-2 rounded-lg">
                <span className="font-semibold text-[#171717]">
                  Promo {cart.couponCode} applied (-{formatMoney(promoDiscount, currencySymbol)})
                </span>
                <button
                  type="button"
                  onClick={removeCoupon}
                  className="text-[#D62828] font-semibold cursor-pointer"
                >
                  Remove
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={promoCode}
                  onChange={(e) => setPromoCode(e.target.value)}
                  placeholder="Promo code"
                  className="flex-1 bg-white border border-neutral-300 rounded-lg px-3 py-2 text-xs"
                />
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await applyCoupon(promoCode);
                      setPromoCode('');
                    } catch (err: unknown) {
                      showToast(err instanceof Error ? err.message : 'Invalid code', 'error');
                    }
                  }}
                  className="px-3.5 py-2 rounded-lg bg-[#171717] text-white text-xs font-semibold cursor-pointer"
                >
                  Apply
                </button>
              </div>
            )}
          </div>

          {/* JUST Rewards Point Redemption */}
          {rewardsCatalog.length > 0 && (
            <div className="pt-3 border-t border-neutral-200 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-[#171717] flex items-center gap-1.5">
                  <Award className="w-4 h-4 text-[#D62828]" />
                  JUST Rewards Balance
                </span>
                <span className="font-mono font-bold tabular-nums">{pointsBalance} pts</span>
              </div>
              <select
                value={selectedRewardId}
                onChange={(e) => setSelectedRewardId(e.target.value)}
                className="w-full bg-white border border-neutral-300 rounded-lg px-3 py-2 text-xs"
              >
                <option value="">Do not redeem points on this order</option>
                {rewardsCatalog.map((r) => (
                  <option key={r.id} value={r.id} disabled={pointsBalance < r.pointsCost}>
                    {r.title} ({r.pointsCost} pts)
                    {pointsBalance < r.pointsCost ? ' — Need more points' : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Totals */}
          <div className="pt-3 border-t border-neutral-200 space-y-1.5 text-sm">
            <div className="flex justify-between text-neutral-600">
              <span>Subtotal</span>
              <span className="font-mono tabular-nums">{formatMoney(subtotal, currencySymbol)}</span>
            </div>
            {totalDiscount > 0 && (
              <div className="flex justify-between text-emerald-700 font-medium">
                <span>Discounts & Rewards</span>
                <span className="font-mono tabular-nums">
                  -{formatMoney(totalDiscount, currencySymbol)}
                </span>
              </div>
            )}
            <div className="flex justify-between text-neutral-600">
              <span>Delivery Fee</span>
              <span className="font-mono tabular-nums">
                {orderType === 'delivery' ? formatMoney(deliveryFee, currencySymbol) : 'Free (Pickup)'}
              </span>
            </div>
            <div className="flex justify-between text-lg font-bold text-[#171717] pt-2 border-t border-neutral-200">
              <span>Total Amount</span>
              <span className="font-mono text-[#D62828] tabular-nums">
                {formatMoney(grandTotal, currencySymbol)}
              </span>
            </div>
          </div>

          <button
            type="submit"
            disabled={placingOrder}
            className="w-full py-3.5 px-6 rounded-xl bg-[#D62828] hover:bg-[#B51E1E] text-white font-semibold text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>{placingOrder ? 'Placing Order...' : 'Place Order'}</span>
          </button>
        </aside>
      </form>
    </div>
  );
};
