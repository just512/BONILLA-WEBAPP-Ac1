import React, { useEffect, useState } from 'react';
import {
  Award,
  Bell,
  Heart,
  LogOut,
  MapPin,
  Package,
  RefreshCw,
  Trash2,
  User,
} from 'lucide-react';
import { EmailAuthProvider, reauthenticateWithCredential, updatePassword } from 'firebase/auth';
import { auth, mapFirebaseAuthError } from '../lib/firebase.ts';
import { useApp } from '../context/AppContext.tsx';
import { apiFetch, formatMoney } from '../lib/api.ts';
import { Address, Order, Product } from '../types.ts';
import { ProductCard } from '../components/ProductCard.tsx';

type TabId = 'profile' | 'orders' | 'addresses' | 'favorites' | 'rewards' | 'notifications';

interface LoyaltyState {
  account: { pointsBalance: number; lifetimePoints: number; tierName: string };
  transactions: Array<{
    id: number;
    pointsDelta: number;
    transactionType: string;
    description: string;
    createdAt: string;
  }>;
  rules: {
    pointsPerDollar?: number;
    rewardsCatalog?: Array<{ id: string; title: string; pointsCost: number; discountCents: number }>;
  };
}

export const CustomerAccountPage: React.FC = () => {
  const {
    user,
    authReady,
    route,
    navigate,
    logout,
    refreshUser,
    resendVerificationEmail,
    syncEmailVerification,
    refreshCart,
    setCartOpen,
    currencySymbol,
    notifications,
    markNotificationRead,
    markAllNotificationsRead,
    showToast,
  } = useApp();

  const initialTab = (new URLSearchParams(route.split('?')[1] || '').get('tab') as TabId) || 'profile';
  const [tab, setTab] = useState<TabId>(initialTab);

  // Profile Form
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);

  // Password Form
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Orders, Addresses, Favorites, Rewards
  const [orders, setOrders] = useState<Order[]>([]);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [favorites, setFavorites] = useState<Product[]>([]);
  const [loyalty, setLoyalty] = useState<LoyaltyState | null>(null);

  // New Address Form
  const [addrLabel, setAddrLabel] = useState('Home');
  const [addrRecipient, setAddrRecipient] = useState('');
  const [addrPhone, setAddrPhone] = useState('');
  const [addrStreet, setAddrStreet] = useState('');
  const [addrCity, setAddrCity] = useState('');
  const [addrNotes, setAddrNotes] = useState('');

  useEffect(() => {
    if (authReady && !user) {
      navigate('/auth/signin');
    }
  }, [authReady, user, navigate]);

  useEffect(() => {
    const t = new URLSearchParams(route.split('?')[1] || '').get('tab') as TabId | null;
    if (t) setTab(t);
  }, [route]);

  useEffect(() => {
    if (!user) return;
    setFullName(user.fullName);
    setPhone(user.phone || '');
    setAddrRecipient(user.fullName);
    setAddrPhone(user.phone || '');

    apiFetch<{ orders: Order[] }>('/api/orders/my').then((r) => setOrders(r.orders)).catch(() => {});
    apiFetch<{ addresses: Address[] }>('/api/account/addresses')
      .then((r) => setAddresses(r.addresses))
      .catch(() => {});
    apiFetch<{ favorites: Product[] }>('/api/account/favorites')
      .then((r) => setFavorites(r.favorites))
      .catch(() => {});
    apiFetch<LoyaltyState>('/api/account/loyalty').then(setLoyalty).catch(() => {});
  }, [user]);

  if (!user) return null;

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    try {
      await apiFetch('/api/account/profile', {
        method: 'PATCH',
        body: JSON.stringify({ fullName, phone }),
      });
      await refreshUser();
      showToast('Profile updated.', 'success');
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Update failed', 'error');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 8) {
      showToast('New password must be at least 8 characters.', 'error');
      return;
    }
    if (newPassword !== confirmPassword) {
      showToast('Passwords do not match.', 'error');
      return;
    }
    try {
      const fbUser = auth.currentUser;
      const hasPasswordProvider = fbUser?.providerData.some((p) => p.providerId === 'password');
      if (fbUser && hasPasswordProvider) {
        if (!currentPassword) {
          showToast('Please enter your current password.', 'error');
          return;
        }
        const credential = EmailAuthProvider.credential(user.email, currentPassword);
        await reauthenticateWithCredential(fbUser, credential);
        await updatePassword(fbUser, newPassword);
      } else {
        await apiFetch('/api/account/change-password', {
          method: 'POST',
          body: JSON.stringify({ currentPassword, newPassword, confirmPassword }),
        });
      }
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      showToast('Password updated successfully.', 'success');
    } catch (err: unknown) {
      showToast(mapFirebaseAuthError(err), 'error');
    }
  };

  const handleAddAddress = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await apiFetch<{ address: Address }>('/api/account/addresses', {
        method: 'POST',
        body: JSON.stringify({
          label: addrLabel,
          recipientName: addrRecipient,
          phone: addrPhone,
          streetAddress: addrStreet,
          city: addrCity,
          deliveryNotes: addrNotes,
          isDefault: addresses.length === 0,
        }),
      });
      setAddresses((prev) => [res.address, ...prev]);
      setAddrStreet('');
      setAddrCity('');
      setAddrNotes('');
      showToast('Address saved.', 'success');
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Unable to save address', 'error');
    }
  };

  const handleDeleteAddress = async (id: number) => {
    await apiFetch(`/api/account/addresses/${id}`, { method: 'DELETE' });
    setAddresses((prev) => prev.filter((a) => a.id !== id));
    showToast('Address removed.', 'info');
  };

  const handleReorder = async (orderId: number) => {
    try {
      const res = await apiFetch<{ message: string }>(`/api/orders/${orderId}/reorder`, {
        method: 'POST',
      });
      await refreshCart();
      setCartOpen(true);
      showToast(res.message, 'success');
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Reorder failed', 'error');
    }
  };

  const handleRedeemReward = async (rewardId: string) => {
    try {
      const res = await apiFetch<{ voucherCode: string; message: string }>(
        '/api/account/loyalty/redeem',
        {
          method: 'POST',
          body: JSON.stringify({ rewardId }),
        }
      );
      showToast(res.message, 'success');
      const updated = await apiFetch<LoyaltyState>('/api/account/loyalty');
      setLoyalty(updated);
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Redemption failed', 'error');
    }
  };

  const tabs: Array<{ id: TabId; label: string; icon: React.ComponentType<{ className?: string }> }> = [
    { id: 'profile', label: 'Profile', icon: User },
    { id: 'orders', label: 'My Orders', icon: Package },
    { id: 'addresses', label: 'Saved Addresses', icon: MapPin },
    { id: 'favorites', label: 'Favorites', icon: Heart },
    { id: 'rewards', label: 'JUST Rewards', icon: Award },
    { id: 'notifications', label: 'Notifications', icon: Bell },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10 min-h-[75vh]">
      <div className="flex flex-wrap items-center justify-between gap-4 pb-6 border-b border-neutral-200 mb-8">
        <div>
          <h1 className="font-display text-3xl font-extrabold text-[#171717]">
            Hello, {user.fullName}
          </h1>
          <p className="text-sm text-neutral-500 mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
            <span>
              {user.email} · {user.roleName.toUpperCase()} ·{' '}
              {user.emailVerified ? 'Verified Account' : 'Email Unverified'}
            </span>
            {!user.emailVerified && auth.currentUser && (
              <>
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await resendVerificationEmail();
                      showToast('Verification email sent!', 'success');
                    } catch (err: unknown) {
                      showToast(err instanceof Error ? err.message : 'Unable to send email', 'error');
                    }
                  }}
                  className="text-xs font-semibold text-[#D62828] hover:underline cursor-pointer"
                >
                  Send Verification Email
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    const verified = await syncEmailVerification().catch(() => false);
                    showToast(
                      verified ? 'Email verified!' : 'Still unverified — check your inbox link.',
                      verified ? 'success' : 'info'
                    );
                  }}
                  className="text-xs font-semibold text-neutral-700 hover:underline cursor-pointer"
                >
                  Check Status
                </button>
              </>
            )}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {(user.roleName === 'admin' || user.roleName === 'staff') && (
            <button
              onClick={() => navigate('/admin')}
              className="px-4 py-2 rounded-xl bg-[#171717] text-[#FFC928] text-xs font-semibold cursor-pointer"
            >
              Open Operations Dashboard
            </button>
          )}
          <button
            onClick={logout}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-neutral-300 text-xs font-semibold text-neutral-700 hover:text-[#D62828] cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign Out</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Sidebar Tabs */}
        <aside className="lg:col-span-3 space-y-1">
          {tabs.map((t) => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-left transition-colors cursor-pointer ${
                  active
                    ? 'bg-[#D62828] text-white font-semibold'
                    : 'text-neutral-700 hover:bg-neutral-100'
                }`}
              >
                <t.icon className="w-4 h-4 shrink-0" />
                <span>{t.label}</span>
              </button>
            );
          })}
        </aside>

        {/* Tab Content */}
        <main className="lg:col-span-9">
          {tab === 'profile' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <form
                onSubmit={handleSaveProfile}
                className="rounded-2xl border border-neutral-200 p-6 space-y-4"
              >
                <h2 className="font-display text-lg font-bold text-[#171717]">
                  Personal Information
                </h2>
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-1">
                    Full Name
                  </label>
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-neutral-300 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-1">
                    Contact Number
                  </label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-neutral-300 text-sm"
                  />
                </div>
                <button
                  type="submit"
                  disabled={savingProfile}
                  className="px-5 py-2.5 rounded-xl bg-[#D62828] text-white text-xs font-semibold cursor-pointer"
                >
                  {savingProfile ? 'Saving...' : 'Save Changes'}
                </button>
              </form>

              <form
                onSubmit={handleChangePassword}
                className="rounded-2xl border border-neutral-200 p-6 space-y-4"
              >
                <h2 className="font-display text-lg font-bold text-[#171717]">
                  Change Password
                </h2>
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Current password (if set)"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-neutral-300 text-sm"
                />
                <input
                  type="password"
                  required
                  minLength={8}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="New password (min 8 chars)"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-neutral-300 text-sm"
                />
                <input
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm new password"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-neutral-300 text-sm"
                />
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-[#171717] text-white text-xs font-semibold cursor-pointer"
                >
                  Update Password
                </button>
              </form>
            </div>
          )}

          {tab === 'orders' && (
            <div className="space-y-4">
              <h2 className="font-display text-xl font-bold text-[#171717]">
                Order History ({orders.length})
              </h2>
              {orders.length === 0 ? (
                <div className="rounded-2xl border border-neutral-200 p-10 text-center">
                  <p className="text-sm text-neutral-500 mb-4">You haven&apos;t placed an order yet.</p>
                  <button
                    onClick={() => navigate('/menu')}
                    className="px-5 py-2.5 rounded-xl bg-[#D62828] text-white text-xs font-semibold cursor-pointer"
                  >
                    Order Your First Burger
                  </button>
                </div>
              ) : (
                orders.map((o) => (
                  <div
                    key={o.id}
                    className="rounded-2xl border border-neutral-200 p-5 bg-white space-y-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="font-mono font-bold text-base text-[#171717]">
                          {o.orderNumber}
                        </p>
                        <p className="text-xs text-neutral-500">
                          {new Date(o.createdAt).toLocaleString()} · {o.branch?.name || 'Branch'} ·{' '}
                          <span className="capitalize font-semibold text-[#D62828]">
                            {o.status.replace(/_/g, ' ')}
                          </span>
                        </p>
                      </div>
                      <span className="font-mono text-base font-bold tabular-nums">
                        {formatMoney(o.totalCents, currencySymbol)}
                      </span>
                    </div>

                    <div className="text-xs text-neutral-600">
                      {(o.items ?? []).map((i) => `${i.quantity}× ${i.productNameSnapshot}`).join(', ')}
                    </div>

                    <div className="pt-3 border-t border-neutral-100 flex items-center gap-3">
                      <button
                        onClick={() => navigate(`/track/${o.orderNumber}`)}
                        className="px-3.5 py-2 rounded-lg border border-neutral-300 text-xs font-semibold hover:bg-neutral-50 cursor-pointer"
                      >
                        Track Order
                      </button>
                      <button
                        onClick={() => handleReorder(o.id)}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#171717] text-white text-xs font-semibold hover:bg-neutral-800 cursor-pointer"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        <span>Reorder</span>
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {tab === 'addresses' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-3">
                <h2 className="font-display text-xl font-bold text-[#171717]">Saved Addresses</h2>
                {addresses.length === 0 ? (
                  <p className="text-sm text-neutral-500">No saved delivery addresses yet.</p>
                ) : (
                  addresses.map((a) => (
                    <div
                      key={a.id}
                      className="rounded-xl border border-neutral-200 p-4 flex items-start justify-between gap-3"
                    >
                      <div className="text-sm">
                        <p className="font-bold text-[#171717]">
                          {a.label} {a.isDefault ? '· Default' : ''}
                        </p>
                        <p className="text-neutral-700 mt-0.5">{a.streetAddress}</p>
                        <p className="text-xs text-neutral-500">
                          {a.city} · {a.phone}
                        </p>
                      </div>
                      <button
                        onClick={() => handleDeleteAddress(a.id)}
                        className="p-1.5 text-neutral-400 hover:text-[#D62828] cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))
                )}
              </div>

              <form
                onSubmit={handleAddAddress}
                className="rounded-2xl border border-neutral-200 p-6 space-y-3"
              >
                <h3 className="font-display text-lg font-bold text-[#171717]">Add New Address</h3>
                <input
                  type="text"
                  required
                  value={addrLabel}
                  onChange={(e) => setAddrLabel(e.target.value)}
                  placeholder="Label (Home, Office)"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-neutral-300 text-sm"
                />
                <input
                  type="text"
                  required
                  value={addrRecipient}
                  onChange={(e) => setAddrRecipient(e.target.value)}
                  placeholder="Recipient Name"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-neutral-300 text-sm"
                />
                <input
                  type="tel"
                  required
                  value={addrPhone}
                  onChange={(e) => setAddrPhone(e.target.value)}
                  placeholder="Phone Number"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-neutral-300 text-sm"
                />
                <input
                  type="text"
                  required
                  value={addrStreet}
                  onChange={(e) => setAddrStreet(e.target.value)}
                  placeholder="Street Address, Unit/Building"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-neutral-300 text-sm"
                />
                <input
                  type="text"
                  required
                  value={addrCity}
                  onChange={(e) => setAddrCity(e.target.value)}
                  placeholder="City"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-neutral-300 text-sm"
                />
                <input
                  type="text"
                  value={addrNotes}
                  onChange={(e) => setAddrNotes(e.target.value)}
                  placeholder="Delivery Notes (Optional)"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-neutral-300 text-sm"
                />
                <button
                  type="submit"
                  className="w-full py-2.5 rounded-xl bg-[#D62828] text-white text-xs font-semibold cursor-pointer"
                >
                  Save Address
                </button>
              </form>
            </div>
          )}

          {tab === 'favorites' && (
            <div className="space-y-4">
              <h2 className="font-display text-xl font-bold text-[#171717]">
                Favorite Products ({favorites.length})
              </h2>
              {favorites.length === 0 ? (
                <p className="text-sm text-neutral-500">
                  Tap the heart icon on any burger on the menu to save it here.
                </p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {favorites.map((p) => (
                    <ProductCard
                      key={p.id}
                      product={p}
                      isFavorited={true}
                      onFavoriteToggle={(id, next) => {
                        if (!next) setFavorites((prev) => prev.filter((item) => item.id !== id));
                      }}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === 'rewards' && (
            <div className="space-y-6">
              <div className="rounded-2xl bg-[#171717] text-white p-6 flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold text-[#FFC928] uppercase tracking-wider">
                    JUST Rewards · {loyalty?.account.tierName || 'Flame Member'}
                  </p>
                  <p className="font-mono text-4xl font-extrabold mt-1 tabular-nums">
                    {loyalty?.account.pointsBalance ?? 0}{' '}
                    <span className="text-base font-sans font-normal text-neutral-400">pts</span>
                  </p>
                  <p className="text-xs text-neutral-400 mt-1">
                    Earn {loyalty?.rules.pointsPerDollar ?? 10} pts per {currencySymbol}1 spent on paid,
                    completed orders.
                  </p>
                </div>
              </div>

              <div>
                <h3 className="font-display text-lg font-bold text-[#171717] mb-3">
                  Redeem Available Offers
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {(loyalty?.rules.rewardsCatalog ?? []).map((r) => {
                    const canRedeem = (loyalty?.account.pointsBalance ?? 0) >= r.pointsCost;
                    return (
                      <div
                        key={r.id}
                        className="rounded-xl border border-neutral-200 p-4 flex flex-col justify-between gap-3 bg-[#FFF8ED]"
                      >
                        <div>
                          <p className="font-mono text-xs font-bold text-[#D62828] tabular-nums">
                            {r.pointsCost} pts
                          </p>
                          <p className="font-display font-bold text-base text-[#171717] mt-1">
                            {r.title}
                          </p>
                        </div>
                        <button
                          disabled={!canRedeem}
                          onClick={() => handleRedeemReward(r.id)}
                          className="w-full py-2 rounded-lg bg-[#171717] disabled:bg-neutral-300 text-white text-xs font-semibold cursor-pointer"
                        >
                          {canRedeem ? 'Redeem Voucher' : 'Need More Points'}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div>
                <h3 className="font-display text-lg font-bold text-[#171717] mb-3">
                  Points History
                </h3>
                {(loyalty?.transactions.length ?? 0) === 0 ? (
                  <p className="text-sm text-neutral-500">No rewards transactions yet.</p>
                ) : (
                  <div className="border border-neutral-200 rounded-xl divide-y divide-neutral-100">
                    {loyalty?.transactions.map((tx) => (
                      <div key={tx.id} className="p-3.5 flex items-center justify-between text-sm">
                        <div>
                          <p className="font-medium text-[#171717]">{tx.description}</p>
                          <p className="text-xs text-neutral-400">
                            {new Date(tx.createdAt).toLocaleString()}
                          </p>
                        </div>
                        <span
                          className={`font-mono font-bold tabular-nums ${
                            tx.pointsDelta >= 0 ? 'text-emerald-700' : 'text-[#D62828]'
                          }`}
                        >
                          {tx.pointsDelta >= 0 ? `+${tx.pointsDelta}` : tx.pointsDelta} pts
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {tab === 'notifications' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-xl font-bold text-[#171717]">
                  Notifications ({notifications.length})
                </h2>
                {notifications.some((n) => !n.isRead) && (
                  <button
                    onClick={markAllNotificationsRead}
                    className="text-xs font-semibold text-[#D62828] hover:underline cursor-pointer"
                  >
                    Mark All Read
                  </button>
                )}
              </div>

              {notifications.length === 0 ? (
                <p className="text-sm text-neutral-500">You&apos;re all caught up.</p>
              ) : (
                <div className="space-y-2.5">
                  {notifications.map((n) => (
                    <div
                      key={n.id}
                      onClick={() => {
                        if (!n.isRead) markNotificationRead(n.id);
                      }}
                      className={`p-4 rounded-xl border cursor-pointer transition-colors ${
                        n.isRead
                          ? 'bg-white border-neutral-200 text-neutral-600'
                          : 'bg-[#FFF8ED] border-[#FFC928] text-[#171717]'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-semibold text-sm">{n.title}</p>
                        <span className="text-xs text-neutral-400">
                          {new Date(n.createdAt).toLocaleString()}
                        </span>
                      </div>
                      <p className="text-xs mt-1">{n.message}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
};
