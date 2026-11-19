import React, { useEffect, useState } from 'react';
import { Download, Trash2 } from 'lucide-react';
import { apiFetch, formatMoney } from '../../lib/api.ts';
import { useApp } from '../../context/AppContext.tsx';
import { Branch, Coupon, ReviewItem, StoreSettingsMap } from '../../types.ts';

type OperationsView =
  | 'inventory'
  | 'customers'
  | 'promotions'
  | 'branches'
  | 'reviews'
  | 'reports'
  | 'staff'
  | 'settings';

export const AdminOperationsTab: React.FC<{ view: OperationsView }> = ({ view }) => {
  const { currencySymbol, showToast, user } = useApp();
  const [loading, setLoading] = useState(true);

  // Inventory
  const [inventoryList, setInventoryList] = useState<
    Array<{
      id: number;
      sku: string;
      itemName: string;
      itemType: string;
      branchName: string;
      unit: string;
      quantityOnHand: number;
      reorderThreshold: number;
    }>
  >([]);
  const [invTx, setInvTx] = useState<
    Array<{ id: number; inventoryId: number; changeAmount: number; newQuantity: number; reason: string; createdAt: string }>
  >([]);

  // Branches
  const [branches, setBranches] = useState<Branch[]>([]);
  const [bName, setBName] = useState('');
  const [bAddr, setBAddr] = useState('');
  const [bCity, setBCity] = useState('');
  const [bPhone, setBPhone] = useState('');
  const [bHours, setBHours] = useState('10:00 AM – 10:00 PM');
  const [bDelivery, setBDelivery] = useState(true);
  const [bFee, setBFee] = useState('167.00');

  // Promotions
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [cCode, setCCode] = useState('');
  const [cTitle, setCTitle] = useState('');
  const [cType, setCType] = useState<'percentage' | 'fixed'>('percentage');
  const [cValue, setCValue] = useState('15');
  const [cMin, setCMin] = useState('840.00');

  // Customers, Reviews, Staff, Settings, Reports
  const [customers, setCustomers] = useState<
    Array<{
      id: number;
      fullName: string;
      email: string;
      phone: string;
      orderCount: number;
      totalSpentCents: number;
      pointsBalance: number;
    }>
  >([]);
  const [reviews, setReviews] = useState<ReviewItem[]>([]);
  const [staffList, setStaffList] = useState<
    Array<{ id: number; fullName: string; email: string; roleName: string; staffTitle: string; isActive: boolean }>
  >([]);
  const [sName, setSName] = useState('');
  const [sEmail, setSEmail] = useState('');
  const [sPassword, setSPassword] = useState('');
  const [sRole, setSRole] = useState<'staff' | 'admin'>('staff');
  const [sTitle, setSTitle] = useState('Grill Chef');

  const [storeSettings, setStoreSettings] = useState<StoreSettingsMap>({});
  const [ordersReport, setOrdersReport] = useState<
    Array<{ orderNumber: string; customerName: string; status: string; paymentStatus: string; totalCents: number; createdAt: string }>
  >([]);

  const loadView = async () => {
    setLoading(true);
    try {
      if (view === 'inventory') {
        const res = await apiFetch<{ inventory: typeof inventoryList; transactions: typeof invTx }>(
          '/api/admin/inventory'
        );
        setInventoryList(res.inventory);
        setInvTx(res.transactions);
      } else if (view === 'branches') {
        const res = await apiFetch<{ branches: Branch[] }>('/api/admin/branches');
        setBranches(res.branches);
      } else if (view === 'promotions') {
        const res = await apiFetch<{ coupons: Coupon[] }>('/api/admin/coupons');
        setCoupons(res.coupons);
      } else if (view === 'customers') {
        const res = await apiFetch<{ customers: typeof customers }>('/api/admin/customers');
        setCustomers(res.customers);
      } else if (view === 'reviews') {
        const res = await apiFetch<{ reviews: ReviewItem[] }>('/api/admin/reviews');
        setReviews(res.reviews);
      } else if (view === 'staff') {
        const res = await apiFetch<{ staff: typeof staffList }>('/api/admin/staff');
        setStaffList(res.staff);
      } else if (view === 'settings') {
        const res = await apiFetch<{ settings: StoreSettingsMap }>('/api/admin/settings');
        setStoreSettings(res.settings);
      } else if (view === 'reports') {
        const res = await apiFetch<{ orders: typeof ordersReport }>('/api/admin/orders');
        setOrdersReport(res.orders);
      }
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Unable to load section', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadView();
  }, [view]);

  if (loading) return <div className="h-72 rounded-2xl bg-neutral-100 dark:bg-neutral-800 animate-pulse" />;

  if (view === 'inventory') {
    const adjustStock = async (inventoryId: number, changeAmount: number) => {
      await apiFetch('/api/admin/inventory/adjust', {
        method: 'POST',
        body: JSON.stringify({
          inventoryId,
          changeAmount,
          reason: changeAmount > 0 ? 'Kitchen Restock' : 'Spoilage / Manual Adjustment',
        }),
      });
      showToast('Inventory updated.', 'success');
      loadView();
    };

    return (
      <div className="space-y-6">
        <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#1A1A1A] overflow-hidden transition-colors">
          <div className="px-5 py-4 border-b border-neutral-200 dark:border-neutral-800">
            <h2 className="font-display text-lg font-bold text-[#171717] dark:text-white">
              Stock & Ingredient Levels
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-neutral-50 dark:bg-neutral-900/60 text-xs text-neutral-500 dark:text-neutral-400 border-b border-neutral-200 dark:border-neutral-800">
                <tr>
                  <th className="px-4 py-3 font-semibold">SKU</th>
                  <th className="px-4 py-3 font-semibold">Item</th>
                  <th className="px-4 py-3 font-semibold">Type</th>
                  <th className="px-4 py-3 font-semibold">On Hand</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold text-right">Adjust</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                {inventoryList.map((inv) => {
                  const out = inv.quantityOnHand === 0;
                  const low = inv.quantityOnHand > 0 && inv.quantityOnHand <= inv.reorderThreshold;
                  return (
                    <tr key={inv.id} className="hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors">
                      <td className="px-4 py-3 font-mono text-xs text-neutral-500 dark:text-neutral-400">{inv.sku}</td>
                      <td className="px-4 py-3 font-semibold text-[#171717] dark:text-white">{inv.itemName}</td>
                      <td className="px-4 py-3 capitalize text-xs text-neutral-500 dark:text-neutral-400">{inv.itemType}</td>
                      <td className="px-4 py-3 font-mono font-bold text-[#171717] dark:text-neutral-100 tabular-nums">
                        {inv.quantityOnHand} {inv.unit}
                      </td>
                      <td className="px-4 py-3 text-xs font-semibold">
                        {out ? (
                          <span className="text-[#D62828] dark:text-red-400">Out of Stock</span>
                        ) : low ? (
                          <span className="text-amber-700 dark:text-amber-400">Low Stock (&le; {inv.reorderThreshold})</span>
                        ) : (
                          <span className="text-emerald-700 dark:text-emerald-400">Healthy</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right space-x-2">
                        <button
                          onClick={() => adjustStock(inv.id, -5)}
                          className="px-2.5 py-1 rounded border border-neutral-300 dark:border-neutral-700 text-xs font-mono text-[#171717] dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-neutral-800 cursor-pointer"
                        >
                          -5
                        </button>
                        <button
                          onClick={() => adjustStock(inv.id, 20)}
                          className="px-2.5 py-1 rounded bg-[#171717] dark:bg-neutral-800 hover:bg-neutral-800 dark:hover:bg-neutral-700 text-white text-xs font-mono cursor-pointer"
                        >
                          +20 Restock
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#1A1A1A] p-5 space-y-3 transition-colors">
          <h3 className="font-display text-base font-bold text-[#171717] dark:text-white">
            Inventory Transaction Ledger
          </h3>
          <div className="space-y-2 max-h-64 overflow-y-auto text-xs">
            {invTx.map((t) => (
              <div key={t.id} className="flex justify-between py-1.5 border-b border-neutral-100 dark:border-neutral-800 text-neutral-700 dark:text-neutral-300">
                <span>
                  Item #{t.inventoryId} · {t.reason}
                </span>
                <span className="font-mono font-bold tabular-nums text-[#171717] dark:text-white">
                  {t.changeAmount >= 0 ? `+${t.changeAmount}` : t.changeAmount} (Bal: {t.newQuantity})
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (view === 'branches') {
    const handleAddBranch = async (e: React.FormEvent) => {
      e.preventDefault();
      await apiFetch('/api/admin/branches', {
        method: 'POST',
        body: JSON.stringify({
          name: bName,
          address: bAddr,
          city: bCity,
          phone: bPhone,
          operatingHours: bHours,
          supportsDelivery: bDelivery,
          deliveryFeeCents: Math.round(Number(bFee) * 100),
        }),
      });
      setBName('');
      setBAddr('');
      setBCity('');
      setBPhone('');
      showToast('Branch added.', 'success');
      loadView();
    };

    return (
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 space-y-3">
          {branches.map((b) => (
            <div key={b.id} className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#1A1A1A] p-5 space-y-2 transition-colors">
              <div className="flex items-center justify-between">
                <h3 className="font-display font-bold text-base text-[#171717] dark:text-white">{b.name}</h3>
                <button
                  onClick={async () => {
                    await apiFetch(`/api/admin/branches/${b.id}`, {
                      method: 'PATCH',
                      body: JSON.stringify({ isActive: !b.isActive }),
                    });
                    loadView();
                  }}
                  className={`px-2.5 py-1 rounded text-xs font-semibold cursor-pointer ${
                    b.isActive
                      ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400'
                      : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400'
                  }`}
                >
                  {b.isActive ? 'Open' : 'Paused'}
                </button>
              </div>
              <p className="text-xs text-neutral-600 dark:text-neutral-300">
                {b.address}, {b.city} · {b.phone}
              </p>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">{b.operatingHours}</p>
              <div className="pt-2 flex items-center gap-3 text-xs">
                <button
                  onClick={async () => {
                    await apiFetch(`/api/admin/branches/${b.id}`, {
                      method: 'PATCH',
                      body: JSON.stringify({ supportsDelivery: !b.supportsDelivery }),
                    });
                    loadView();
                  }}
                  className="px-2.5 py-1 rounded border border-neutral-300 dark:border-neutral-700 font-medium text-[#171717] dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-neutral-800 cursor-pointer"
                >
                  Delivery: {b.supportsDelivery ? 'Enabled' : 'Pickup Only'}
                </button>
                <span className="font-mono text-neutral-600 dark:text-neutral-400 tabular-nums">
                  Fee: {formatMoney(b.deliveryFeeCents, currencySymbol)}
                </span>
              </div>
            </div>
          ))}
        </div>

        <form
          onSubmit={handleAddBranch}
          className="lg:col-span-5 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#1A1A1A] p-6 space-y-3 self-start transition-colors"
        >
          <h3 className="font-display text-lg font-bold text-[#171717] dark:text-white">Add Branch</h3>
          <input type="text" required value={bName} onChange={(e) => setBName(e.target.value)} placeholder="Branch Name" className="w-full px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-[#121212] text-sm text-[#171717] dark:text-neutral-100 placeholder:text-neutral-400 dark:placeholder:text-neutral-500" />
          <input type="text" required value={bAddr} onChange={(e) => setBAddr(e.target.value)} placeholder="Street Address" className="w-full px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-[#121212] text-sm text-[#171717] dark:text-neutral-100 placeholder:text-neutral-400 dark:placeholder:text-neutral-500" />
          <input type="text" required value={bCity} onChange={(e) => setBCity(e.target.value)} placeholder="City" className="w-full px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-[#121212] text-sm text-[#171717] dark:text-neutral-100 placeholder:text-neutral-400 dark:placeholder:text-neutral-500" />
          <input type="text" required value={bPhone} onChange={(e) => setBPhone(e.target.value)} placeholder="Phone Number" className="w-full px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-[#121212] text-sm text-[#171717] dark:text-neutral-100 placeholder:text-neutral-400 dark:placeholder:text-neutral-500" />
          <input type="text" value={bHours} onChange={(e) => setBHours(e.target.value)} placeholder="Operating Hours" className="w-full px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-[#121212] text-sm text-[#171717] dark:text-neutral-100 placeholder:text-neutral-400 dark:placeholder:text-neutral-500" />
          <div className="flex items-center justify-between text-xs text-neutral-700 dark:text-neutral-300">
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={bDelivery} onChange={(e) => setBDelivery(e.target.checked)} className="accent-[#D62828]" />
              Supports Delivery
            </label>
            <input type="number" step="0.01" value={bFee} onChange={(e) => setBFee(e.target.value)} className="w-24 px-2 py-1 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-[#121212] text-[#171717] dark:text-neutral-100 font-mono" />
          </div>
          <button type="submit" className="w-full py-2.5 rounded-lg bg-[#D62828] hover:bg-[#B51E1E] text-white text-xs font-semibold cursor-pointer">
            Create Branch
          </button>
        </form>
      </div>
    );
  }

  if (view === 'promotions') {
    const handleAddCoupon = async (e: React.FormEvent) => {
      e.preventDefault();
      await apiFetch('/api/admin/coupons', {
        method: 'POST',
        body: JSON.stringify({
          code: cCode,
          title: cTitle,
          discountType: cType,
          discountValue: cType === 'percentage' ? Number(cValue) : Math.round(Number(cValue) * 100),
          minOrderCents: Math.round(Number(cMin) * 100),
        }),
      });
      setCCode('');
      setCTitle('');
      showToast('Promotion created.', 'success');
      loadView();
    };

    return (
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 space-y-3">
          {coupons.map((cp) => (
            <div key={cp.id} className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#1A1A1A] p-4 flex items-center justify-between gap-4 transition-colors">
              <div>
                <p className="font-mono font-bold text-sm text-[#D62828] dark:text-[#FFC928]">{cp.code}</p>
                <p className="font-semibold text-sm text-[#171717] dark:text-white">{cp.title}</p>
                <p className="text-xs text-neutral-500 dark:text-neutral-400">
                  {cp.discountType === 'percentage'
                    ? `${cp.discountValue}% off`
                    : `${formatMoney(cp.discountValue, currencySymbol)} off`}{' '}
                  · Min {formatMoney(cp.minOrderCents, currencySymbol)} · Used {cp.usedCount} times
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={async () => {
                    await apiFetch(`/api/admin/coupons/${cp.id}`, {
                      method: 'PATCH',
                      body: JSON.stringify({ isActive: !cp.isActive }),
                    });
                    loadView();
                  }}
                  className={`px-3 py-1 rounded text-xs font-semibold cursor-pointer ${
                    cp.isActive
                      ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400'
                      : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400'
                  }`}
                >
                  {cp.isActive ? 'Active' : 'Paused'}
                </button>
                <button
                  onClick={async () => {
                    await apiFetch(`/api/admin/coupons/${cp.id}`, { method: 'DELETE' });
                    loadView();
                  }}
                  className="p-1.5 text-neutral-400 hover:text-[#D62828] cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>

        <form onSubmit={handleAddCoupon} className="lg:col-span-5 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#1A1A1A] p-6 space-y-3 self-start transition-colors">
          <h3 className="font-display text-lg font-bold text-[#171717] dark:text-white">Create Promo Code</h3>
          <input type="text" required value={cCode} onChange={(e) => setCCode(e.target.value)} placeholder="Code (e.g. BURGER20)" className="w-full px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-[#121212] font-mono text-sm uppercase text-[#171717] dark:text-neutral-100 placeholder:text-neutral-400 dark:placeholder:text-neutral-500" />
          <input type="text" required value={cTitle} onChange={(e) => setCTitle(e.target.value)} placeholder="Promo Title" className="w-full px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-[#121212] text-sm text-[#171717] dark:text-neutral-100 placeholder:text-neutral-400 dark:placeholder:text-neutral-500" />
          <div className="grid grid-cols-2 gap-2">
            <select value={cType} onChange={(e) => setCType(e.target.value as 'percentage' | 'fixed')} className="px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 text-sm bg-white dark:bg-[#121212] text-[#171717] dark:text-neutral-100">
              <option value="percentage">Percentage (%)</option>
              <option value="fixed">Fixed (₱)</option>
            </select>
            <input type="number" step="0.01" required value={cValue} onChange={(e) => setCValue(e.target.value)} placeholder="Value" className="px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-[#121212] font-mono text-sm text-[#171717] dark:text-neutral-100 placeholder:text-neutral-400 dark:placeholder:text-neutral-500" />
          </div>
          <input type="number" step="0.01" value={cMin} onChange={(e) => setCMin(e.target.value)} placeholder="Min Order (₱)" className="w-full px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-[#121212] font-mono text-sm text-[#171717] dark:text-neutral-100 placeholder:text-neutral-400 dark:placeholder:text-neutral-500" />
          <button type="submit" className="w-full py-2.5 rounded-lg bg-[#D62828] hover:bg-[#B51E1E] text-white text-xs font-semibold cursor-pointer">
            Launch Promotion
          </button>
        </form>
      </div>
    );
  }

  if (view === 'customers') {
    return (
      <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#1A1A1A] overflow-hidden transition-colors">
        <div className="px-5 py-4 border-b border-neutral-200 dark:border-neutral-800">
          <h2 className="font-display text-lg font-bold text-[#171717] dark:text-white">
            Customer Directory ({customers.length})
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-neutral-50 dark:bg-neutral-900/60 text-xs text-neutral-500 dark:text-neutral-400 border-b border-neutral-200 dark:border-neutral-800">
              <tr>
                <th className="px-4 py-3 font-semibold">Name</th>
                <th className="px-4 py-3 font-semibold">Email</th>
                <th className="px-4 py-3 font-semibold">Orders</th>
                <th className="px-4 py-3 font-semibold">Points</th>
                <th className="px-4 py-3 font-semibold text-right">Total Spent</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
              {customers.map((c) => (
                <tr key={c.id} className="hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors">
                  <td className="px-4 py-3 font-semibold text-[#171717] dark:text-white">{c.fullName}</td>
                  <td className="px-4 py-3 text-neutral-600 dark:text-neutral-300">{c.email}</td>
                  <td className="px-4 py-3 font-mono tabular-nums text-neutral-800 dark:text-neutral-200">{c.orderCount}</td>
                  <td className="px-4 py-3 font-mono tabular-nums text-neutral-800 dark:text-neutral-200">{c.pointsBalance} pts</td>
                  <td className="px-4 py-3 text-right font-mono font-semibold tabular-nums text-[#171717] dark:text-white">
                    {formatMoney(c.totalSpentCents, currencySymbol)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  if (view === 'reviews') {
    return (
      <div className="space-y-3">
        <h2 className="font-display text-xl font-bold text-[#171717] dark:text-white">Review Moderation</h2>
        {reviews.map((r) => (
          <div key={r.id} className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#1A1A1A] p-4 flex items-start justify-between gap-4 transition-colors">
            <div className="text-sm">
              <p className="font-bold text-[#171717] dark:text-white">
                {r.productName} · {r.rating}/5 ★
              </p>
              <p className="text-neutral-600 dark:text-neutral-300 mt-1">{r.comment}</p>
              <p className="text-xs text-neutral-400 dark:text-neutral-500 mt-1">
                By {r.authorName} · {r.isVerifiedPurchase ? 'Verified Order' : 'Guest'}
              </p>
            </div>
            <button
              onClick={async () => {
                await apiFetch(`/api/admin/reviews/${r.id}`, {
                  method: 'PATCH',
                  body: JSON.stringify({ status: r.status === 'published' ? 'hidden' : 'published' }),
                });
                loadView();
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold shrink-0 cursor-pointer ${
                r.status === 'published'
                  ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400'
                  : 'bg-red-50 dark:bg-red-950/40 text-[#D62828] dark:text-red-400'
              }`}
            >
              {r.status === 'published' ? 'Published' : 'Hidden'}
            </button>
          </div>
        ))}
      </div>
    );
  }

  if (view === 'staff') {
    if (user?.roleName !== 'admin') {
      return <p className="text-sm text-[#D62828] dark:text-red-400">Only Administrators can manage staff accounts.</p>;
    }
    const handleCreateStaff = async (e: React.FormEvent) => {
      e.preventDefault();
      try {
        await apiFetch('/api/admin/staff', {
          method: 'POST',
          body: JSON.stringify({
            fullName: sName,
            email: sEmail,
            password: sPassword,
            roleName: sRole,
            staffTitle: sTitle,
          }),
        });
        setSName('');
        setSEmail('');
        setSPassword('');
        showToast('Staff account created.', 'success');
        loadView();
      } catch (err: unknown) {
        showToast(err instanceof Error ? err.message : 'Failed to add staff', 'error');
      }
    };

    return (
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 space-y-3">
          {staffList.map((st) => (
            <div key={st.id} className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#1A1A1A] p-4 flex items-center justify-between transition-colors">
              <div>
                <p className="font-semibold text-sm text-[#171717] dark:text-white">{st.fullName}</p>
                <p className="text-xs text-neutral-500 dark:text-neutral-400">
                  {st.email} · {st.staffTitle} · <span className="uppercase font-bold text-[#D62828] dark:text-[#FFC928]">{st.roleName}</span>
                </p>
              </div>
              <button
                onClick={async () => {
                  await apiFetch(`/api/admin/staff/${st.id}`, {
                    method: 'PATCH',
                    body: JSON.stringify({ isActive: !st.isActive }),
                  });
                  loadView();
                }}
                className={`px-3 py-1 rounded text-xs font-semibold cursor-pointer ${
                  st.isActive
                    ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400'
                    : 'bg-red-50 dark:bg-red-950/40 text-[#D62828] dark:text-red-400'
                }`}
              >
                {st.isActive ? 'Active' : 'Disabled'}
              </button>
            </div>
          ))}
        </div>

        <form onSubmit={handleCreateStaff} className="lg:col-span-5 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#1A1A1A] p-6 space-y-3 self-start transition-colors">
          <h3 className="font-display text-lg font-bold text-[#171717] dark:text-white">Add Staff / Admin</h3>
          <input type="text" required value={sName} onChange={(e) => setSName(e.target.value)} placeholder="Full Name" className="w-full px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-[#121212] text-sm text-[#171717] dark:text-neutral-100 placeholder:text-neutral-400 dark:placeholder:text-neutral-500" />
          <input type="email" required value={sEmail} onChange={(e) => setSEmail(e.target.value)} placeholder="Staff Email" className="w-full px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-[#121212] text-sm text-[#171717] dark:text-neutral-100 placeholder:text-neutral-400 dark:placeholder:text-neutral-500" />
          <input type="password" required minLength={8} value={sPassword} onChange={(e) => setSPassword(e.target.value)} placeholder="Password (8+ chars)" className="w-full px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-[#121212] text-sm text-[#171717] dark:text-neutral-100 placeholder:text-neutral-400 dark:placeholder:text-neutral-500" />
          <input type="text" value={sTitle} onChange={(e) => setSTitle(e.target.value)} placeholder="Title (e.g. Shift Lead)" className="w-full px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-[#121212] text-sm text-[#171717] dark:text-neutral-100 placeholder:text-neutral-400 dark:placeholder:text-neutral-500" />
          <select value={sRole} onChange={(e) => setSRole(e.target.value as 'staff' | 'admin')} className="w-full px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 text-sm bg-white dark:bg-[#121212] text-[#171717] dark:text-neutral-100">
            <option value="staff">Staff (Orders & Kitchen)</option>
            <option value="admin">Administrator (Full Access)</option>
          </select>
          <button type="submit" className="w-full py-2.5 rounded-lg bg-[#D62828] hover:bg-[#B51E1E] text-white text-xs font-semibold cursor-pointer">
            Create Staff Account
          </button>
        </form>
      </div>
    );
  }

  if (view === 'reports') {
    const downloadCsv = () => {
      const header = 'OrderNumber,Customer,Status,PaymentStatus,Total,Date\n';
      const rows = ordersReport
        .map(
          (o) =>
            `"${o.orderNumber}","${o.customerName}","${o.status}","${o.paymentStatus}",${(
              o.totalCents / 100
            ).toFixed(2)},"${o.createdAt}"`
        )
        .join('\n');
      const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `just-burger-sales-report.csv`;
      a.click();
      URL.revokeObjectURL(url);
    };

    return (
      <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#1A1A1A] p-6 space-y-4 transition-colors">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h2 className="font-display text-xl font-bold text-[#171717] dark:text-white">
              Sales & Order Reports
            </h2>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              Export itemized order history and revenue figures as CSV.
            </p>
          </div>
          <button
            onClick={downloadCsv}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#171717] dark:bg-neutral-800 hover:bg-neutral-800 dark:hover:bg-neutral-700 text-white text-xs font-semibold cursor-pointer"
          >
            <Download className="w-4 h-4" />
            <span>Download CSV</span>
          </button>
        </div>

        <p className="text-sm text-neutral-600 dark:text-neutral-300">
          Total Recorded Orders: <strong className="font-mono text-[#171717] dark:text-white">{ordersReport.length}</strong> · Paid/Completed Revenue:{' '}
          <strong className="font-mono text-[#171717] dark:text-white">
            {formatMoney(
              ordersReport
                .filter((o) => o.status !== 'cancelled' && (o.paymentStatus === 'paid' || o.status === 'completed'))
                .reduce((s, o) => s + o.totalCents, 0),
              currencySymbol
            )}
          </strong>
        </p>
      </div>
    );
  }

  // Settings View
  const ann = storeSettings.announcement ?? { enabled: true, text: '', ctaLabel: 'Order Now' };
  const pay = storeSettings.payment_config ?? {
    cash_on_pickup: true,
    cash_on_delivery: true,
    gcash: true,
    card: true,
  };
  const loy = storeSettings.loyalty_rules ?? { pointsPerDollar: 10, minRedeemPoints: 200, rewardsCatalog: [] };

  const saveSetting = async (key: string, value: unknown) => {
    await apiFetch('/api/admin/settings', {
      method: 'PATCH',
      body: JSON.stringify({ key, value }),
    });
    showToast('Setting saved.', 'success');
  };

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#1A1A1A] p-6 space-y-4 transition-colors">
        <h3 className="font-display text-lg font-bold text-[#171717] dark:text-white">Announcement Bar</h3>
        <label className="inline-flex items-center gap-2 text-sm text-neutral-700 dark:text-neutral-300 cursor-pointer">
          <input
            type="checkbox"
            checked={Boolean(ann.enabled)}
            onChange={(e) =>
              setStoreSettings((s) => ({
                ...s,
                announcement: { ...ann, enabled: e.target.checked },
              }))
            }
            className="accent-[#D62828]"
          />
          Show top promotional banner
        </label>
        <input
          type="text"
          value={ann.text}
          onChange={(e) =>
            setStoreSettings((s) => ({ ...s, announcement: { ...ann, text: e.target.value } }))
          }
          className="w-full px-3.5 py-2.5 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-[#121212] text-sm text-[#171717] dark:text-neutral-100"
        />
        <button
          onClick={() => saveSetting('announcement', storeSettings.announcement)}
          className="px-4 py-2 rounded-lg bg-[#D62828] hover:bg-[#B51E1E] text-white text-xs font-semibold cursor-pointer"
        >
          Save Announcement
        </button>
      </div>

      <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#1A1A1A] p-6 space-y-4 transition-colors">
        <h3 className="font-display text-lg font-bold text-[#171717] dark:text-white">Payment Methods</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm text-neutral-700 dark:text-neutral-300">
          {(['cash_on_pickup', 'cash_on_delivery', 'gcash', 'card'] as const).map((k) => (
            <label key={k} className="inline-flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={Boolean(pay[k])}
                onChange={(e) =>
                  setStoreSettings((s) => ({
                    ...s,
                    payment_config: { ...pay, [k]: e.target.checked },
                  }))
                }
                className="accent-[#D62828]"
              />
              <span className="capitalize">{k.replace(/_/g, ' ')}</span>
            </label>
          ))}
        </div>
        <button
          onClick={() => saveSetting('payment_config', storeSettings.payment_config)}
          className="px-4 py-2 rounded-lg bg-[#171717] dark:bg-neutral-800 hover:bg-neutral-800 dark:hover:bg-neutral-700 text-white text-xs font-semibold cursor-pointer"
        >
          Save Payment Config
        </button>
      </div>

      <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#1A1A1A] p-6 space-y-4 transition-colors">
        <h3 className="font-display text-lg font-bold text-[#171717] dark:text-white">JUST Rewards Rule</h3>
        <div className="flex items-center gap-3">
          <label className="text-sm text-neutral-700 dark:text-neutral-300">Points Earned per ₱1 Spent:</label>
          <input
            type="number"
            value={loy.pointsPerDollar}
            onChange={(e) =>
              setStoreSettings((s) => ({
                ...s,
                loyalty_rules: { ...loy, pointsPerDollar: Number(e.target.value) },
              }))
            }
            className="w-24 px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-[#121212] text-[#171717] dark:text-neutral-100 font-mono text-sm"
          />
        </div>
        <button
          onClick={() => saveSetting('loyalty_rules', storeSettings.loyalty_rules)}
          className="px-4 py-2 rounded-lg bg-[#171717] dark:bg-neutral-800 hover:bg-neutral-800 dark:hover:bg-neutral-700 text-white text-xs font-semibold cursor-pointer"
        >
          Save Loyalty Rules
        </button>
      </div>
    </div>
  );
};
