import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import {
  browserLocalPersistence,
  browserSessionPersistence,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  setPersistence,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
} from 'firebase/auth';
import { auth, googleAuthProvider, mapFirebaseAuthError } from '../lib/firebase.ts';
import { apiFetch, getInMemoryAuthToken, setInMemoryAuthToken } from '../lib/api.ts';
import {
  Branch,
  CartState,
  NotificationItem,
  StoreSettingsMap,
  UserProfile,
} from '../types.ts';

interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info';
  text: string;
}

interface AppContextValue {
  route: string;
  navigate: (to: string) => void;
  user: UserProfile | null;
  authReady: boolean;
  pendingRedirect: string | null;
  setPendingRedirect: (url: string | null) => void;
  loginWithEmail: (email: string, password: string, rememberMe: boolean) => Promise<UserProfile>;
  registerAccount: (payload: {
    fullName: string;
    email: string;
    phone: string;
    password: string;
    confirmPassword: string;
  }) => Promise<{ user: UserProfile; verificationEmailSent: boolean }>;
  loginWithGoogle: () => Promise<UserProfile>;
  resendVerificationEmail: () => Promise<void>;
  syncEmailVerification: () => Promise<boolean>;
  sendPasswordReset: (email: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<UserProfile | null>;
  cart: CartState | null;
  isCartOpen: boolean;
  setCartOpen: (open: boolean) => void;
  refreshCart: () => Promise<void>;
  addToCart: (payload: {
    productId: number;
    quantity: number;
    customizationIds: number[];
    specialInstructions?: string;
  }) => Promise<void>;
  addComboToCart: (payload: {
    burgerId: number;
    burgerCustomizationIds: number[];
    sideId: number;
    drinkId: number;
    addonIds: number[];
    quantity: number;
    specialInstructions?: string;
  }) => Promise<void>;
  updateCartQty: (itemId: number, quantity: number) => Promise<void>;
  removeCartItem: (itemId: number) => Promise<void>;
  applyCoupon: (code: string) => Promise<void>;
  removeCoupon: () => Promise<void>;
  selectCartBranch: (branchId: number) => Promise<void>;
  settings: StoreSettingsMap;
  branches: Branch[];
  currencySymbol: string;
  notifications: NotificationItem[];
  unreadCount: number;
  refreshNotifications: () => Promise<void>;
  markNotificationRead: (id: number) => Promise<void>;
  markAllNotificationsRead: () => Promise<void>;
  realtimeTick: number;
  lastRealtimeEvent: { type: string; payload: unknown } | null;
  showToast: (text: string, type?: 'success' | 'error' | 'info') => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [route, setRoute] = useState<string>(() => window.location.pathname + window.location.search);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [pendingRedirect, setPendingRedirect] = useState<string | null>(null);
  const [cart, setCart] = useState<CartState | null>(null);
  const [isCartOpen, setCartOpen] = useState(false);
  const [settings, setSettings] = useState<StoreSettingsMap>({});
  const [branches, setBranches] = useState<Branch[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [realtimeTick, setRealtimeTick] = useState(0);
  const [lastRealtimeEvent, setLastRealtimeEvent] = useState<{ type: string; payload: unknown } | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const manualAuthFlowRef = useRef(false);

  const showToast = useCallback((text: string, type: 'success' | 'error' | 'info' = 'info') => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setToasts((prev) => [...prev, { id, type, text }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4200);
  }, []);

  const navigate = useCallback((to: string) => {
    if (to !== window.location.pathname + window.location.search) {
      window.history.pushState({}, '', to);
    }
    setRoute(to);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  useEffect(() => {
    const onPopState = () => {
      setRoute(window.location.pathname + window.location.search);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const refreshCart = useCallback(async () => {
    try {
      const data = await apiFetch<{ cart: CartState }>('/api/cart');
      setCart(data.cart);
    } catch (err) {
      console.error('Cart refresh error:', err);
    }
  }, []);

  const refreshNotifications = useCallback(async () => {
    try {
      const data = await apiFetch<{ notifications: NotificationItem[] }>('/api/account/notifications');
      setNotifications(data.notifications);
    } catch {
      setNotifications([]);
    }
  }, []);

  const refreshUser = useCallback(async (): Promise<UserProfile | null> => {
    try {
      const data = await apiFetch<{ user: UserProfile | null }>('/api/auth/me');
      setUser(data.user);
      if (data.user) {
        refreshNotifications();
      } else {
        setNotifications([]);
      }
      return data.user;
    } catch {
      setUser(null);
      return null;
    } finally {
      setAuthReady(true);
    }
  }, [refreshNotifications]);

  // Initial load & Firebase session restoration
  useEffect(() => {
    let mounted = true;
    refreshUser().then((loadedUser) => {
      if (!mounted) return;
      if (!loadedUser && auth.currentUser && !manualAuthFlowRef.current) {
        auth.currentUser
          .getIdToken()
          .then((idToken) =>
            apiFetch<{ token: string; user: UserProfile }>('/api/auth/firebase-sync', {
              method: 'POST',
              body: JSON.stringify({ idToken, rememberMe: true }),
            })
          )
          .then((data) => {
            if (!mounted) return;
            setInMemoryAuthToken(data.token);
            setUser(data.user);
            refreshCart();
            refreshNotifications();
          })
          .catch(() => {});
      }
    });

    const unsubAuth = onAuthStateChanged(auth, async (fbUser) => {
      if (!mounted || !fbUser || manualAuthFlowRef.current) return;
      if (!getInMemoryAuthToken()) {
        try {
          const idToken = await fbUser.getIdToken();
          const data = await apiFetch<{ token: string; user: UserProfile }>('/api/auth/firebase-sync', {
            method: 'POST',
            body: JSON.stringify({ idToken, rememberMe: true }),
          });
          if (!mounted) return;
          setInMemoryAuthToken(data.token);
          setUser(data.user);
          refreshNotifications();
        } catch {
          // Ignore background sync failures
        }
      }
    });

    refreshCart();
    apiFetch<{ settings: StoreSettingsMap; branches: Branch[] }>('/api/storefront')
      .then((res) => {
        if (!mounted) return;
        setSettings(res.settings || {});
        setBranches(res.branches || []);
      })
      .catch((err) => console.error('Initial config load error:', err));

    return () => {
      mounted = false;
      unsubAuth();
    };
  }, [refreshUser, refreshCart, refreshNotifications]);

  // WebSocket Real-Time Updates
  useEffect(() => {
    if (!authReady) return;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const token = getInMemoryAuthToken() || '';
    const wsUrl = `${protocol}//${window.location.host}/ws${token ? `?token=${encodeURIComponent(token)}` : ''}`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data) as { type: string; payload: unknown };
        if (
          msg.type === 'order:created' ||
          msg.type === 'order:updated' ||
          msg.type === 'notification:created'
        ) {
          setLastRealtimeEvent(msg);
          setRealtimeTick((n) => n + 1);
          if (user) refreshNotifications();
        }
      } catch {
        // Ignore parse failures
      }
    };

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [authReady, user?.id, refreshNotifications]);

  const loginWithEmail = async (email: string, password: string, rememberMe: boolean) => {
    const cleanEmail = email.trim().toLowerCase();
    manualAuthFlowRef.current = true;
    try {
      await setPersistence(auth, rememberMe ? browserLocalPersistence : browserSessionPersistence);
      const cred = await signInWithEmailAndPassword(auth, cleanEmail, password);
      const idToken = await cred.user.getIdToken();
      const data = await apiFetch<{ token: string; user: UserProfile }>('/api/auth/firebase-sync', {
        method: 'POST',
        body: JSON.stringify({ idToken, rememberMe }),
      });
      setInMemoryAuthToken(data.token);
      setUser(data.user);
      await Promise.all([refreshCart(), refreshNotifications()]);
      return data.user;
    } catch (fbErr: unknown) {
      const code =
        typeof fbErr === 'object' && fbErr !== null && 'code' in fbErr
          ? String((fbErr as { code?: unknown }).code)
          : '';
      // Fallback for DB-seeded/admin-created staff accounts that do not have a Firebase password credential
      if (
        code === 'auth/invalid-credential' ||
        code === 'auth/user-not-found' ||
        code === 'auth/wrong-password'
      ) {
        try {
          const data = await apiFetch<{ token: string; user: UserProfile }>('/api/auth/login', {
            method: 'POST',
            body: JSON.stringify({ email: cleanEmail, password, rememberMe }),
          });
          setInMemoryAuthToken(data.token);
          setUser(data.user);
          await Promise.all([refreshCart(), refreshNotifications()]);
          return data.user;
        } catch {
          throw new Error(mapFirebaseAuthError(fbErr));
        }
      }
      throw new Error(mapFirebaseAuthError(fbErr));
    } finally {
      manualAuthFlowRef.current = false;
    }
  };

  const registerAccount = async (payload: {
    fullName: string;
    email: string;
    phone: string;
    password: string;
    confirmPassword: string;
  }) => {
    const cleanName = payload.fullName.trim();
    const cleanEmail = payload.email.trim().toLowerCase();
    const cleanPhone = payload.phone.trim();

    if (cleanName.length < 2) {
      throw new Error('Full name must be at least 2 characters.');
    }
    if (cleanPhone.length < 7) {
      throw new Error('Please enter a valid contact number.');
    }
    if (payload.password.length < 8) {
      throw new Error('Password must be at least 8 characters long.');
    }
    if (payload.password !== payload.confirmPassword) {
      throw new Error('Passwords do not match.');
    }

    manualAuthFlowRef.current = true;
    try {
      await setPersistence(auth, browserLocalPersistence);
      const cred = await createUserWithEmailAndPassword(auth, cleanEmail, payload.password);
      await updateProfile(cred.user, { displayName: cleanName }).catch(() => {});

      let verificationEmailSent = false;
      try {
        await sendEmailVerification(cred.user);
        verificationEmailSent = true;
      } catch (verifyErr) {
        console.warn('Unable to dispatch Firebase verification email immediately:', verifyErr);
      }

      const idToken = await cred.user.getIdToken(true);
      const data = await apiFetch<{ token: string; user: UserProfile }>('/api/auth/firebase-sync', {
        method: 'POST',
        body: JSON.stringify({
          idToken,
          fullName: cleanName,
          phone: cleanPhone,
          rememberMe: true,
        }),
      });
      setInMemoryAuthToken(data.token);
      setUser(data.user);
      await Promise.all([refreshCart(), refreshNotifications()]);
      return { user: data.user, verificationEmailSent };
    } catch (err: unknown) {
      throw new Error(mapFirebaseAuthError(err));
    } finally {
      manualAuthFlowRef.current = false;
    }
  };

  const loginWithGoogle = async () => {
    manualAuthFlowRef.current = true;
    try {
      await setPersistence(auth, browserLocalPersistence);
      const cred = await signInWithPopup(auth, googleAuthProvider);
      const idToken = await cred.user.getIdToken();
      const data = await apiFetch<{ token: string; user: UserProfile }>('/api/auth/firebase-sync', {
        method: 'POST',
        body: JSON.stringify({ idToken, rememberMe: true }),
      });
      setInMemoryAuthToken(data.token);
      setUser(data.user);
      await Promise.all([refreshCart(), refreshNotifications()]);
      return data.user;
    } catch (err: unknown) {
      throw new Error(mapFirebaseAuthError(err));
    } finally {
      manualAuthFlowRef.current = false;
    }
  };

  const resendVerificationEmail = async () => {
    if (!auth.currentUser) {
      throw new Error('Please sign in again before requesting a verification email.');
    }
    try {
      await sendEmailVerification(auth.currentUser);
    } catch (err: unknown) {
      throw new Error(mapFirebaseAuthError(err));
    }
  };

  const syncEmailVerification = async (): Promise<boolean> => {
    if (!auth.currentUser) {
      throw new Error('No active Firebase session found. Please sign in again.');
    }
    await auth.currentUser.reload();
    const idToken = await auth.currentUser.getIdToken(true);
    const data = await apiFetch<{ token: string; user: UserProfile }>('/api/auth/firebase-sync', {
      method: 'POST',
      body: JSON.stringify({ idToken, rememberMe: true }),
    });
    setInMemoryAuthToken(data.token);
    setUser(data.user);
    return data.user.emailVerified;
  };

  const sendPasswordReset = async (email: string) => {
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) {
      throw new Error('Please enter your account email address.');
    }
    try {
      await sendPasswordResetEmail(auth, cleanEmail);
    } catch (err: unknown) {
      throw new Error(mapFirebaseAuthError(err));
    }
  };

  const logout = async () => {
    await apiFetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
    await signOut(auth).catch(() => {});
    setInMemoryAuthToken(null);
    setUser(null);
    setNotifications([]);
    await refreshCart();
    navigate('/');
    showToast('You have been signed out.', 'info');
  };

  const addToCart = async (payload: {
    productId: number;
    quantity: number;
    customizationIds: number[];
    specialInstructions?: string;
  }) => {
    const data = await apiFetch<{ cart: CartState; message: string }>('/api/cart/items', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    setCart(data.cart);
    setCartOpen(true);
    showToast(data.message || 'Added to cart', 'success');
  };

  const addComboToCart = async (payload: {
    burgerId: number;
    burgerCustomizationIds: number[];
    sideId: number;
    drinkId: number;
    addonIds: number[];
    quantity: number;
    specialInstructions?: string;
  }) => {
    const data = await apiFetch<{ cart: CartState; message: string }>('/api/cart/combo', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    setCart(data.cart);
    setCartOpen(true);
    showToast(data.message || 'Custom combo added to cart', 'success');
  };

  const updateCartQty = async (itemId: number, quantity: number) => {
    const data = await apiFetch<{ cart: CartState }>(`/api/cart/items/${itemId}`, {
      method: 'PATCH',
      body: JSON.stringify({ quantity }),
    });
    setCart(data.cart);
  };

  const removeCartItem = async (itemId: number) => {
    const data = await apiFetch<{ cart: CartState }>(`/api/cart/items/${itemId}`, {
      method: 'DELETE',
    });
    setCart(data.cart);
    showToast('Item removed from cart.', 'info');
  };

  const applyCoupon = async (code: string) => {
    const data = await apiFetch<{ cart: CartState; message: string }>('/api/cart/coupon', {
      method: 'POST',
      body: JSON.stringify({ code }),
    });
    setCart(data.cart);
    showToast(data.message, 'success');
  };

  const removeCoupon = async () => {
    const data = await apiFetch<{ cart: CartState }>('/api/cart/coupon', {
      method: 'DELETE',
    });
    setCart(data.cart);
    showToast('Promo code removed.', 'info');
  };

  const selectCartBranch = async (branchId: number) => {
    const data = await apiFetch<{ cart: CartState }>('/api/cart/branch', {
      method: 'PATCH',
      body: JSON.stringify({ branchId }),
    });
    setCart(data.cart);
  };

  const markNotificationRead = async (id: number) => {
    await apiFetch(`/api/account/notifications/${id}/read`, { method: 'PATCH' });
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)));
  };

  const markAllNotificationsRead = async () => {
    await apiFetch('/api/account/notifications/read-all', { method: 'POST' });
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
  };

  const unreadCount = notifications.filter((n) => !n.isRead).length;
  const currencySymbol = settings.business_info?.currencySymbol || '$';

  return (
    <AppContext.Provider
      value={{
        route,
        navigate,
        user,
        authReady,
        pendingRedirect,
        setPendingRedirect,
        loginWithEmail,
        registerAccount,
        loginWithGoogle,
        resendVerificationEmail,
        syncEmailVerification,
        sendPasswordReset,
        logout,
        refreshUser,
        cart,
        isCartOpen,
        setCartOpen,
        refreshCart,
        addToCart,
        addComboToCart,
        updateCartQty,
        removeCartItem,
        applyCoupon,
        removeCoupon,
        selectCartBranch,
        settings,
        branches,
        currencySymbol,
        notifications,
        unreadCount,
        refreshNotifications,
        markNotificationRead,
        markAllNotificationsRead,
        realtimeTick,
        lastRealtimeEvent,
        showToast,
      }}
    >
      {children}
      {/* Toast Stack */}
      <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none px-4 sm:px-0 no-print">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={`pointer-events-auto rounded-lg px-4 py-3 text-sm font-medium shadow-lg border transition-all duration-200 ${
              t.type === 'error'
                ? 'bg-[#171717] text-white border-[#D62828]'
                : t.type === 'success'
                  ? 'bg-[#171717] text-white border-[#FFC928]'
                  : 'bg-white text-[#171717] border-neutral-200'
            }`}
          >
            {t.text}
          </div>
        ))}
      </div>
    </AppContext.Provider>
  );
};

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}
