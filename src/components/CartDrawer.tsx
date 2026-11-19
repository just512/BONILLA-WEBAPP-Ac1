import React, { useState } from 'react';
import { ArrowRight, Minus, Plus, ShoppingBag, Tag, Trash2, X } from 'lucide-react';
import { useApp } from '../context/AppContext.tsx';
import { formatMoney } from '../lib/api.ts';
import { ProductImage } from './ProductImage.tsx';

export const CartDrawer: React.FC = () => {
  const {
    cart,
    isCartOpen,
    setCartOpen,
    updateCartQty,
    removeCartItem,
    applyCoupon,
    removeCoupon,
    branches,
    selectCartBranch,
    currencySymbol,
    user,
    navigate,
    setPendingRedirect,
    showToast,
  } = useApp();

  const [promoInput, setPromoInput] = useState('');
  const [promoLoading, setPromoLoading] = useState(false);

  if (!isCartOpen) return null;

  const items = cart?.items ?? [];
  const subtotal = cart?.subtotalCents ?? 0;
  const discount = cart?.discountCents ?? 0;
  const deliveryFee = cart?.deliveryFeeCents ?? 0;
  const estimatedTotal = Math.max(0, subtotal - discount);

  const handleApplyPromo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!promoInput.trim()) return;
    setPromoLoading(true);
    try {
      await applyCoupon(promoInput.trim());
      setPromoInput('');
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Invalid promo code', 'error');
    } finally {
      setPromoLoading(false);
    }
  };

  const handleCheckout = () => {
    setCartOpen(false);
    if (!user) {
      setPendingRedirect('/checkout');
      showToast('Please sign in or create an account to complete your order.', 'info');
      navigate('/auth/signin');
      return;
    }
    navigate('/checkout');
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end no-print" role="dialog" aria-modal="true" aria-label="Shopping Cart">
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-[2px] transition-opacity"
        onClick={() => setCartOpen(false)}
      />

      <aside className="relative w-full max-w-md bg-white h-full flex flex-col shadow-2xl border-l border-neutral-200 z-10">
        {/* Drawer Header */}
        <div className="px-6 py-4 border-b border-neutral-200 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <ShoppingBag className="w-5 h-5 text-[#D62828]" />
            <h2 className="font-display text-lg font-bold text-[#171717]">
              Your Bag ({cart?.itemCount ?? 0})
            </h2>
          </div>
          <button
            onClick={() => setCartOpen(false)}
            aria-label="Close cart"
            className="p-2 text-neutral-500 hover:text-[#171717] rounded-lg hover:bg-neutral-100 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Branch Context Selector */}
        {branches.length > 0 && (
          <div className="px-6 py-3 bg-[#FFF8ED] border-b border-amber-100 flex items-center justify-between gap-3">
            <span className="text-xs font-semibold text-neutral-700 whitespace-nowrap">Kitchen Branch</span>
            <select
              value={cart?.branchId ?? branches[0]?.id ?? ''}
              onChange={(e) => selectCartBranch(Number(e.target.value))}
              className="text-xs font-medium bg-white border border-neutral-300 rounded-md px-2.5 py-1.5 text-[#171717] max-w-[230px] truncate"
            >
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Cart Items List */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {items.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center py-12">
              <div className="w-14 h-14 rounded-2xl bg-[#FFF8ED] flex items-center justify-center mb-4">
                <ShoppingBag className="w-7 h-7 text-[#D62828]" />
              </div>
              <h3 className="font-display text-lg font-bold text-[#171717] mb-1">
                Your bag is empty
              </h3>
              <p className="text-sm text-neutral-500 max-w-xs mb-6">
                Build a custom smash burger or pick one of our house favorites to get started.
              </p>
              <button
                onClick={() => {
                  setCartOpen(false);
                  navigate('/menu');
                }}
                className="px-5 py-2.5 rounded-lg bg-[#D62828] hover:bg-[#B51E1E] text-white text-sm font-semibold transition-colors cursor-pointer"
              >
                Explore Menu
              </button>
            </div>
          ) : (
            items.map((item) => (
              <div
                key={item.id}
                className="flex gap-3.5 pb-4 border-b border-neutral-100 last:border-b-0"
              >
                <ProductImage
                  src={item.imageUrl}
                  alt={item.displayName}
                  className="w-20 h-20 rounded-xl object-cover shrink-0 bg-neutral-100"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <h4 className="font-semibold text-sm text-[#171717] leading-snug">
                      {item.displayName}
                    </h4>
                    <button
                      onClick={() => removeCartItem(item.id)}
                      aria-label={`Remove ${item.displayName}`}
                      className="text-neutral-400 hover:text-[#D62828] p-1 cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  {item.comboPayload && (
                    <p className="text-xs text-neutral-600 mt-1">
                      Side: {item.comboPayload.sideName} · Drink: {item.comboPayload.drinkName}
                      {item.comboPayload.addonNames?.length > 0
                        ? ` · Add-ons: ${item.comboPayload.addonNames.join(', ')}`
                        : ''}
                    </p>
                  )}

                  {item.selectedCustomizations && item.selectedCustomizations.length > 0 && (
                    <p className="text-xs text-neutral-500 mt-1">
                      {item.selectedCustomizations.map((c) => c.name).join(' · ')}
                    </p>
                  )}

                  {item.specialInstructions && (
                    <p className="text-xs text-neutral-500 italic mt-1">
                      Note: {item.specialInstructions}
                    </p>
                  )}

                  <div className="mt-3 flex items-center justify-between">
                    <div className="inline-flex items-center border border-neutral-200 rounded-lg">
                      <button
                        onClick={() =>
                          item.quantity > 1
                            ? updateCartQty(item.id, item.quantity - 1)
                            : removeCartItem(item.id)
                        }
                        aria-label="Decrease quantity"
                        className="p-1.5 text-neutral-600 hover:text-[#171717] cursor-pointer"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <span className="px-2.5 text-xs font-mono font-semibold tabular-nums">
                        {item.quantity}
                      </span>
                      <button
                        onClick={() => updateCartQty(item.id, Math.min(50, item.quantity + 1))}
                        aria-label="Increase quantity"
                        className="p-1.5 text-neutral-600 hover:text-[#171717] cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <span className="font-mono text-sm font-semibold text-[#171717] tabular-nums">
                      {formatMoney(item.unitPriceCents * item.quantity, currencySymbol)}
                    </span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Cart Footer Summary */}
        {items.length > 0 && (
          <div className="border-t border-neutral-200 px-6 py-4 bg-neutral-50 space-y-4">
            {/* Promo Code Input */}
            {cart?.couponCode ? (
              <div className="flex items-center justify-between bg-[#FFF8ED] border border-amber-200 rounded-lg px-3 py-2 text-xs">
                <span className="font-semibold text-[#171717] flex items-center gap-1.5">
                  <Tag className="w-3.5 h-3.5 text-[#D62828]" />
                  {cart.couponCode} applied (-{formatMoney(discount, currencySymbol)})
                </span>
                <button
                  onClick={removeCoupon}
                  className="text-neutral-600 hover:text-[#D62828] font-medium cursor-pointer"
                >
                  Remove
                </button>
              </div>
            ) : (
              <form onSubmit={handleApplyPromo} className="flex gap-2">
                <input
                  type="text"
                  value={promoInput}
                  onChange={(e) => setPromoInput(e.target.value)}
                  placeholder="Promo code (e.g. JUST15)"
                  className="flex-1 bg-white border border-neutral-300 rounded-lg px-3 py-2 text-xs text-[#171717] focus:outline-none focus:border-[#D62828]"
                />
                <button
                  type="submit"
                  disabled={promoLoading}
                  className="px-3.5 py-2 rounded-lg bg-[#171717] text-white text-xs font-semibold hover:bg-neutral-800 disabled:opacity-50 cursor-pointer"
                >
                  Apply
                </button>
              </form>
            )}

            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between text-neutral-600">
                <span>Subtotal</span>
                <span className="font-mono tabular-nums">{formatMoney(subtotal, currencySymbol)}</span>
              </div>
              {discount > 0 && (
                <div className="flex justify-between text-emerald-700 font-medium">
                  <span>Promo Savings</span>
                  <span className="font-mono tabular-nums">-{formatMoney(discount, currencySymbol)}</span>
                </div>
              )}
              <div className="flex justify-between text-neutral-500 text-xs">
                <span>Delivery Fee (if delivery selected)</span>
                <span className="font-mono tabular-nums">
                  {cart?.branch?.supportsDelivery
                    ? formatMoney(deliveryFee, currencySymbol)
                    : 'Pickup Only'}
                </span>
              </div>
              <div className="flex justify-between pt-2 border-t border-neutral-200 font-bold text-[#171717] text-base">
                <span>Estimated Total</span>
                <span className="font-mono tabular-nums">
                  {formatMoney(estimatedTotal, currencySymbol)}
                </span>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <button
                onClick={handleCheckout}
                className="w-full py-3 px-4 rounded-xl bg-[#D62828] hover:bg-[#B51E1E] text-white font-semibold text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                <span>Proceed to Checkout</span>
                <ArrowRight className="w-4 h-4" />
              </button>
              <button
                onClick={() => {
                  setCartOpen(false);
                  navigate('/menu');
                }}
                className="w-full py-2 text-xs font-medium text-neutral-600 hover:text-[#171717] cursor-pointer"
              >
                Continue Shopping
              </button>
            </div>
          </div>
        )}
      </aside>
    </div>
  );
};
