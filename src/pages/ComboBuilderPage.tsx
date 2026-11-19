import React, { useEffect, useMemo, useState } from 'react';
import { Check, Minus, Plus, ShoppingBag } from 'lucide-react';
import { useApp } from '../context/AppContext.tsx';
import { apiFetch, formatMoney } from '../lib/api.ts';
import { Product } from '../types.ts';
import { ProductImage } from '../components/ProductImage.tsx';

interface ComboOptionsResponse {
  burgers: Product[];
  sides: Product[];
  drinks: Product[];
  addons: Product[];
  comboDiscountPercent: number;
}

export const ComboBuilderPage: React.FC = () => {
  const { addComboToCart, currencySymbol, showToast } = useApp();
  const [data, setData] = useState<ComboOptionsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const [burgerId, setBurgerId] = useState<number | null>(null);
  const [burgerCustomIds, setBurgerCustomIds] = useState<Set<number>>(new Set());
  const [sideId, setSideId] = useState<number | null>(null);
  const [drinkId, setDrinkId] = useState<number | null>(null);
  const [addonIds, setAddonIds] = useState<Set<number>>(new Set());
  const [quantity, setQuantity] = useState(1);
  const [instructions, setInstructions] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    apiFetch<ComboOptionsResponse>('/api/combo-options')
      .then((res) => {
        setData(res);
        if (res.burgers[0]) setBurgerId(res.burgers[0].id);
        if (res.sides[0]) setSideId(res.sides[0].id);
        if (res.drinks[0]) setDrinkId(res.drinks[0].id);
      })
      .catch(() => showToast('Unable to load combo options.', 'error'))
      .finally(() => setLoading(false));
  }, [showToast]);

  const selectedBurger = useMemo(
    () => data?.burgers.find((b) => b.id === burgerId) ?? null,
    [data, burgerId]
  );
  const selectedSide = useMemo(
    () => data?.sides.find((s) => s.id === sideId) ?? null,
    [data, sideId]
  );
  const selectedDrink = useMemo(
    () => data?.drinks.find((d) => d.id === drinkId) ?? null,
    [data, drinkId]
  );

  const handleSelectBurger = (id: number) => {
    setBurgerId(id);
    setBurgerCustomIds(new Set());
  };

  const toggleBurgerCust = (custId: number, isAvailable: boolean) => {
    if (!isAvailable) return;
    setBurgerCustomIds((prev) => {
      const next = new Set(prev);
      if (next.has(custId)) next.delete(custId);
      else next.add(custId);
      return next;
    });
  };

  const toggleAddon = (id: number) => {
    setAddonIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const pricing = useMemo(() => {
    if (!selectedBurger || !selectedSide || !selectedDrink || !data) {
      return { raw: 0, savings: 0, unit: 0, total: 0 };
    }
    let extras = 0;
    for (const opt of selectedBurger.options ?? []) {
      for (const c of opt.customizations) {
        if (burgerCustomIds.has(c.id)) extras += c.priceDeltaCents;
      }
    }
    let addonsTotal = 0;
    for (const a of data.addons) {
      if (addonIds.has(a.id)) addonsTotal += a.priceCents;
    }
    const raw = selectedBurger.priceCents + extras + selectedSide.priceCents + selectedDrink.priceCents + addonsTotal;
    const savings = Math.round(raw * 0.1);
    const unit = raw - savings;
    return { raw, savings, unit, total: unit * quantity };
  }, [selectedBurger, selectedSide, selectedDrink, data, burgerCustomIds, addonIds, quantity]);

  const handleAddCombo = async () => {
    if (!burgerId || !sideId || !drinkId) {
      showToast('Please select a burger, side, and drink.', 'error');
      return;
    }
    setSubmitting(true);
    try {
      await addComboToCart({
        burgerId,
        burgerCustomizationIds: Array.from(burgerCustomIds),
        sideId,
        drinkId,
        addonIds: Array.from(addonIds),
        quantity,
        specialInstructions: instructions,
      });
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Unable to add combo', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12">
        <div className="h-[520px] rounded-2xl bg-neutral-100 dark:bg-neutral-800 animate-pulse" />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10">
      <div className="pb-6 border-b border-neutral-200 dark:border-neutral-800 mb-8">
        <p className="text-xs font-semibold uppercase tracking-widest text-[#D62828] dark:text-[#FFC928] mb-1">
          Save 10% Automatically
        </p>
        <h1 className="font-display text-3xl sm:text-4xl font-extrabold text-[#171717] dark:text-white">
          Build Your Own Combo
        </h1>
        <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-1">
          Pick one burger, one crispy side, one craft drink, and optional sweet or savory add-ons.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Configurator Steps */}
        <div className="lg:col-span-8 space-y-10">
          {/* Step 1: Burger */}
          <section className="space-y-4">
            <h2 className="font-display text-xl font-bold text-[#171717] dark:text-white">
              01. Choose Your Burger
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {data?.burgers.map((b) => {
                const active = b.id === burgerId;
                return (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => handleSelectBurger(b.id)}
                    className={`flex items-center gap-4 p-3.5 rounded-2xl border text-left transition-all cursor-pointer ${
                      active
                        ? 'border-[#D62828] bg-[#FFF8ED] dark:bg-[#231B16] shadow-sm'
                        : 'border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#1A1A1A] hover:border-neutral-400 dark:hover:border-neutral-600'
                    }`}
                  >
                    <ProductImage
                      src={b.imageUrl}
                      alt={b.name}
                      className="w-20 h-20 rounded-xl object-cover shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <h3 className="font-display font-bold text-sm text-[#171717] dark:text-white truncate">
                        {b.name}
                      </h3>
                      <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5 line-clamp-2">{b.description}</p>
                      <p className="font-mono text-xs font-bold text-[#D62828] dark:text-[#FFC928] mt-1.5 tabular-nums">
                        {formatMoney(b.priceCents, currencySymbol)}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Optional Burger Toppings */}
            {selectedBurger?.options && selectedBurger.options.length > 0 && (
              <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-[#141414] p-5 space-y-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-700 dark:text-neutral-300">
                  Customize {selectedBurger.name} (Optional)
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {selectedBurger.options.flatMap((opt) =>
                    opt.customizations.map((cust) => {
                      const checked = burgerCustomIds.has(cust.id);
                      return (
                        <button
                          key={cust.id}
                          type="button"
                          disabled={!cust.isAvailable}
                          onClick={() => toggleBurgerCust(cust.id, cust.isAvailable)}
                          className={`flex items-center justify-between px-3 py-2 rounded-lg border text-xs transition-colors ${
                            !cust.isAvailable
                              ? 'bg-neutral-100 dark:bg-neutral-900 text-neutral-400 dark:text-neutral-600 border-neutral-200 dark:border-neutral-800 cursor-not-allowed'
                              : checked
                                ? 'bg-white dark:bg-[#231B16] border-[#D62828] text-[#171717] dark:text-white font-semibold cursor-pointer'
                                : 'bg-white dark:bg-[#1A1A1A] border-neutral-200 dark:border-neutral-800 text-neutral-700 dark:text-neutral-300 hover:border-neutral-400 dark:hover:border-neutral-600 cursor-pointer'
                          }`}
                        >
                          <span className="truncate">{cust.name}</span>
                          <span className="font-mono shrink-0 ml-2 tabular-nums">
                            {!cust.isAvailable
                              ? 'N/A'
                              : cust.priceDeltaCents > 0
                                ? `+${formatMoney(cust.priceDeltaCents, currencySymbol)}`
                                : `${currencySymbol}0.00`}
                          </span>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </section>

          {/* Step 2: Side Dish */}
          <section className="space-y-4">
            <h2 className="font-display text-xl font-bold text-[#171717] dark:text-white">
              02. Choose Your Side Dish
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {data?.sides.map((s) => {
                const active = s.id === sideId;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setSideId(s.id)}
                    className={`flex items-center gap-4 p-3.5 rounded-2xl border text-left transition-all cursor-pointer ${
                      active
                        ? 'border-[#D62828] bg-[#FFF8ED] dark:bg-[#231B16]'
                        : 'border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#1A1A1A] hover:border-neutral-400 dark:hover:border-neutral-600'
                    }`}
                  >
                    <ProductImage
                      src={s.imageUrl}
                      alt={s.name}
                      className="w-16 h-16 rounded-xl object-cover shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <h3 className="font-display font-bold text-sm text-[#171717] dark:text-white">{s.name}</h3>
                      <p className="font-mono text-xs font-bold text-[#D62828] dark:text-[#FFC928] mt-1 tabular-nums">
                        {formatMoney(s.priceCents, currencySymbol)}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Step 3: Drink */}
          <section className="space-y-4">
            <h2 className="font-display text-xl font-bold text-[#171717] dark:text-white">
              03. Choose Your Drink
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {data?.drinks.map((d) => {
                const active = d.id === drinkId;
                return (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => setDrinkId(d.id)}
                    className={`flex items-center gap-4 p-3.5 rounded-2xl border text-left transition-all cursor-pointer ${
                      active
                        ? 'border-[#D62828] bg-[#FFF8ED] dark:bg-[#231B16]'
                        : 'border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#1A1A1A] hover:border-neutral-400 dark:hover:border-neutral-600'
                    }`}
                  >
                    <ProductImage
                      src={d.imageUrl}
                      alt={d.name}
                      className="w-16 h-16 rounded-xl object-cover shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <h3 className="font-display font-bold text-sm text-[#171717] dark:text-white">{d.name}</h3>
                      <p className="font-mono text-xs font-bold text-[#D62828] dark:text-[#FFC928] mt-1 tabular-nums">
                        {formatMoney(d.priceCents, currencySymbol)}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Step 4: Optional Add-ons */}
          {data && data.addons.length > 0 && (
            <section className="space-y-4">
              <h2 className="font-display text-xl font-bold text-[#171717] dark:text-white">
                04. Optional Add-Ons
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {data.addons.map((a) => {
                  const checked = addonIds.has(a.id);
                  return (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => toggleAddon(a.id)}
                      className={`flex items-center justify-between p-3.5 rounded-xl border text-left cursor-pointer ${
                        checked
                          ? 'border-[#D62828] bg-[#FFF8ED] dark:bg-[#231B16]'
                          : 'border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#1A1A1A] hover:border-neutral-400 dark:hover:border-neutral-600'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span
                          className={`w-4 h-4 rounded flex items-center justify-center border shrink-0 ${
                            checked ? 'bg-[#D62828] border-[#D62828] text-white' : 'border-neutral-300 dark:border-neutral-600'
                          }`}
                        >
                          {checked && <Check className="w-3 h-3" />}
                        </span>
                        <span className="text-sm font-medium text-[#171717] dark:text-neutral-100 truncate">{a.name}</span>
                      </div>
                      <span className="font-mono text-xs font-bold text-[#171717] dark:text-[#FFC928] ml-2 tabular-nums">
                        +{formatMoney(a.priceCents, currencySymbol)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          )}
        </div>

        {/* Right Sticky Live Summary */}
        <aside className="lg:col-span-4 lg:sticky lg:top-24 rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-[#171717] text-white p-6 space-y-5 shadow-xl">
          <div>
            <p className="text-xs font-semibold text-[#FFC928] uppercase tracking-wider">
              Live Combo Summary
            </p>
            <h2 className="font-display text-2xl font-bold mt-1">Your Custom Meal</h2>
          </div>

          <div className="space-y-3 text-sm border-y border-neutral-800 py-4">
            <div className="flex justify-between gap-2">
              <span className="text-neutral-400">Burger</span>
              <span className="font-medium text-right">{selectedBurger?.name || '—'}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-neutral-400">Side Dish</span>
              <span className="font-medium text-right">{selectedSide?.name || '—'}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-neutral-400">Drink</span>
              <span className="font-medium text-right">{selectedDrink?.name || '—'}</span>
            </div>
            {addonIds.size > 0 && (
              <div className="flex justify-between gap-2">
                <span className="text-neutral-400">Add-Ons</span>
                <span className="font-medium text-right">{addonIds.size} selected</span>
              </div>
            )}
            {burgerCustomIds.size > 0 && (
              <div className="flex justify-between gap-2">
                <span className="text-neutral-400">Burger Extras</span>
                <span className="font-medium text-right">{burgerCustomIds.size} selected</span>
              </div>
            )}
          </div>

          <div className="space-y-1.5 text-sm">
            <div className="flex justify-between text-neutral-400">
              <span>Individual Value</span>
              <span className="font-mono line-through tabular-nums">
                {formatMoney(pricing.raw * quantity, currencySymbol)}
              </span>
            </div>
            <div className="flex justify-between text-[#FFC928]">
              <span>10% Combo Savings</span>
              <span className="font-mono tabular-nums">
                -{formatMoney(pricing.savings * quantity, currencySymbol)}
              </span>
            </div>
            <div className="flex justify-between text-lg font-bold pt-2">
              <span>Combo Total</span>
              <span className="font-mono text-[#FFC928] tabular-nums">
                {formatMoney(pricing.total, currencySymbol)}
              </span>
            </div>
          </div>

          <input
            type="text"
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            placeholder="Special combo notes (optional)..."
            className="w-full px-3 py-2.5 rounded-lg bg-neutral-900 border border-neutral-700 text-xs text-white placeholder:text-neutral-500"
          />

          <div className="flex items-center gap-3">
            <div className="inline-flex items-center border border-neutral-700 rounded-xl px-1.5 py-1">
              <button
                type="button"
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                className="p-2 text-neutral-300 hover:text-white cursor-pointer"
              >
                <Minus className="w-4 h-4" />
              </button>
              <span className="px-2.5 font-mono text-sm font-bold tabular-nums">{quantity}</span>
              <button
                type="button"
                onClick={() => setQuantity((q) => Math.min(20, q + 1))}
                className="p-2 text-neutral-300 hover:text-white cursor-pointer"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>

            <button
              type="button"
              disabled={submitting || !burgerId || !sideId || !drinkId}
              onClick={handleAddCombo}
              className="flex-1 py-3 px-4 rounded-xl bg-[#D62828] hover:bg-[#B51E1E] text-white text-sm font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <ShoppingBag className="w-4 h-4" />
              <span>{submitting ? 'Adding...' : 'Add Combo to Bag'}</span>
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
};
