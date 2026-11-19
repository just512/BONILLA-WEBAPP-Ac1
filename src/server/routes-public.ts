import crypto from 'node:crypto';
import { Router } from 'express';
import { and, asc, desc, eq, ilike, inArray, or } from 'drizzle-orm';
import { db } from '../db/index.ts';
import {
  branches,
  cartItems,
  carts,
  categories,
  coupons,
  newsletterSubscribers,
  productCustomizations,
  productOptions,
  products,
  profiles,
  reviews,
  roles,
  storeSettings,
  CartCustomizationItem,
  ComboSelectionPayload,
  loyaltyAccounts,
} from '../db/schema.ts';
import { ensureSeeded } from '../db/seed.ts';
import {
  AuthRequest,
  hashPassword,
  optionalAuth,
  signSessionToken,
  toSafeProfile,
  upsertFirebaseProfile,
  upsertGoogleProfile,
  verifyPassword,
} from './auth.ts';
import { adminAuth } from '../lib/firebase-admin.ts';

export const publicRouter = Router();

// Helper: load full product with options & customizations
async function getProductsWithOptions(productIds: number[]) {
  if (productIds.length === 0) return new Map<number, unknown[]>();
  const opts = await db
    .select()
    .from(productOptions)
    .where(inArray(productOptions.productId, productIds))
    .orderBy(asc(productOptions.sortOrder));
  const optIds = opts.map((o) => o.id);
  const custs =
    optIds.length > 0
      ? await db
          .select()
          .from(productCustomizations)
          .where(inArray(productCustomizations.optionId, optIds))
          .orderBy(asc(productCustomizations.sortOrder))
      : [];

  const custByOpt = new Map<number, typeof custs>();
  for (const c of custs) {
    const arr = custByOpt.get(c.optionId) ?? [];
    arr.push(c);
    custByOpt.set(c.optionId, arr);
  }

  const map = new Map<number, unknown[]>();
  for (const o of opts) {
    const arr = map.get(o.productId) ?? [];
    arr.push({
      ...o,
      customizations: custByOpt.get(o.id) ?? [],
    });
    map.set(o.productId, arr);
  }
  return map;
}

// Helper: calculate coupon discount
export async function evaluateCoupon(code: string | null | undefined, subtotalCents: number) {
  if (!code) return { valid: false, discountCents: 0, coupon: null, reason: '' };
  const cleanCode = code.trim().toUpperCase();
  const rows = await db.select().from(coupons).where(eq(coupons.code, cleanCode)).limit(1);
  if (rows.length === 0) {
    return { valid: false, discountCents: 0, coupon: null, reason: 'Promo code not found.' };
  }
  const cp = rows[0];
  if (!cp.isActive) {
    return { valid: false, discountCents: 0, coupon: null, reason: 'This promotion is no longer active.' };
  }
  const now = new Date();
  if (cp.startsAt && cp.startsAt > now) {
    return { valid: false, discountCents: 0, coupon: null, reason: 'This promotion has not started yet.' };
  }
  if (cp.expiresAt && cp.expiresAt < now) {
    return { valid: false, discountCents: 0, coupon: null, reason: 'This promo code has expired.' };
  }
  if (cp.usageLimit !== null && cp.usedCount >= cp.usageLimit) {
    return { valid: false, discountCents: 0, coupon: null, reason: 'Promo code usage limit reached.' };
  }
  if (subtotalCents < cp.minOrderCents) {
    return {
      valid: false,
      discountCents: 0,
      coupon: null,
      reason: `Minimum order of $${(cp.minOrderCents / 100).toFixed(2)} required for ${cp.code}.`,
    };
  }
  let discountCents = 0;
  if (cp.discountType === 'percentage') {
    discountCents = Math.round((subtotalCents * cp.discountValue) / 100);
    if (cp.maxDiscountCents !== null && discountCents > cp.maxDiscountCents) {
      discountCents = cp.maxDiscountCents;
    }
  } else {
    discountCents = Math.min(cp.discountValue, subtotalCents);
  }
  return { valid: true, discountCents, coupon: cp, reason: '' };
}

// Helper: resolve or create cart
export async function getOrCreateCart(sessionToken: string, profileId?: number | null) {
  let cartRows = profileId
    ? await db.select().from(carts).where(eq(carts.profileId, profileId)).limit(1)
    : [];

  if (cartRows.length === 0 && sessionToken) {
    cartRows = await db.select().from(carts).where(eq(carts.sessionToken, sessionToken)).limit(1);
    if (cartRows.length > 0 && profileId && !cartRows[0].profileId) {
      await db
        .update(carts)
        .set({ profileId, updatedAt: new Date() })
        .where(eq(carts.id, cartRows[0].id));
      cartRows[0].profileId = profileId;
    }
  }

  if (cartRows.length === 0) {
    const activeBranches = await db.select().from(branches).where(eq(branches.isActive, true)).limit(1);
    const defaultBranchId = activeBranches[0]?.id ?? null;
    const tokenToUse = sessionToken || crypto.randomUUID();
    const inserted = await db
      .insert(carts)
      .values({
        profileId: profileId ?? null,
        sessionToken: tokenToUse,
        branchId: defaultBranchId,
      })
      .returning();
    cartRows = inserted;
  }
  return cartRows[0];
}

export async function serializeCart(cartRow: typeof carts.$inferSelect) {
  const items = await db
    .select()
    .from(cartItems)
    .where(eq(cartItems.cartId, cartRow.id))
    .orderBy(asc(cartItems.id));

  const subtotalCents = items.reduce((acc, item) => acc + item.unitPriceCents * item.quantity, 0);
  const branchRows = cartRow.branchId
    ? await db.select().from(branches).where(eq(branches.id, cartRow.branchId)).limit(1)
    : [];
  const branch = branchRows[0] ?? null;

  const couponEval = await evaluateCoupon(cartRow.couponCode, subtotalCents);
  const discountCents = couponEval.valid ? couponEval.discountCents : 0;

  return {
    id: cartRow.id,
    sessionToken: cartRow.sessionToken,
    branchId: cartRow.branchId,
    branch,
    couponCode: couponEval.valid ? cartRow.couponCode : null,
    couponTitle: couponEval.coupon?.title ?? null,
    items,
    itemCount: items.reduce((sum, i) => sum + i.quantity, 0),
    subtotalCents,
    discountCents,
    deliveryFeeCents: branch?.supportsDelivery ? branch.deliveryFeeCents : 0,
  };
}

// ============================================
// AUTHENTICATION ENDPOINTS
// ============================================

publicRouter.post('/auth/register', async (req, res) => {
  try {
    await ensureSeeded();
    const { fullName, email, phone, password, confirmPassword } = req.body ?? {};
    if (!fullName || typeof fullName !== 'string' || fullName.trim().length < 2) {
      return res.status(400).json({ error: 'Full name must be at least 2 characters.' });
    }
    const cleanEmail = String(email || '').toLowerCase().trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      return res.status(400).json({ error: 'Please enter a valid email address.' });
    }
    if (!phone || String(phone).trim().length < 7) {
      return res.status(400).json({ error: 'Please enter a valid contact number.' });
    }
    if (!password || String(password).length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters long.' });
    }
    if (password !== confirmPassword) {
      return res.status(400).json({ error: 'Passwords do not match.' });
    }

    const existing = await db.select().from(profiles).where(eq(profiles.email, cleanEmail)).limit(1);
    if (existing.length > 0) {
      return res.status(409).json({ error: 'An account with this email address already exists.' });
    }

    const roleRows = await db.select().from(roles).where(eq(roles.name, 'customer')).limit(1);
    const verificationToken = crypto.randomBytes(20).toString('hex');
    const inserted = await db
      .insert(profiles)
      .values({
        uid: `local-${crypto.randomUUID()}`,
        email: cleanEmail,
        fullName: fullName.trim(),
        phone: String(phone).trim(),
        passwordHash: hashPassword(String(password)),
        roleId: roleRows[0]?.id ?? null,
        roleName: 'customer',
        emailVerified: false,
        verificationToken,
      })
      .returning();

    const user = inserted[0];
    await db
      .insert(loyaltyAccounts)
      .values({ profileId: user.id, pointsBalance: 0, lifetimePoints: 0, tierName: 'Flame Member' })
      .onConflictDoNothing();

    const token = signSessionToken(
      { uid: user.uid, profileId: user.id, email: user.email, roleName: user.roleName },
      true
    );

    res.cookie('jb_session', token, {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 14 * 24 * 60 * 60 * 1000,
    });

    res.status(201).json({
      token,
      user: toSafeProfile(user),
      verificationToken,
      message: 'Account created! Please verify your email address.',
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ error: 'Unable to create account right now.' });
  }
});

publicRouter.post('/auth/login', async (req, res) => {
  try {
    await ensureSeeded();
    const { email, password, rememberMe } = req.body ?? {};
    const cleanEmail = String(email || '').toLowerCase().trim();
    if (!cleanEmail || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const rows = await db.select().from(profiles).where(eq(profiles.email, cleanEmail)).limit(1);
    const user = rows[0];
    if (!user || !user.passwordHash) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }
    if (!user.isActive) {
      return res.status(403).json({ error: 'This account has been deactivated. Contact support.' });
    }
    if (!verifyPassword(String(password), user.passwordHash)) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const token = signSessionToken(
      { uid: user.uid, profileId: user.id, email: user.email, roleName: user.roleName },
      Boolean(rememberMe)
    );

    res.cookie('jb_session', token, {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: (rememberMe ? 14 : 1) * 24 * 60 * 60 * 1000,
    });

    res.json({ token, user: toSafeProfile(user) });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed. Please try again.' });
  }
});

publicRouter.post('/auth/firebase-sync', async (req, res) => {
  try {
    await ensureSeeded();
    const { idToken, fullName, phone, rememberMe = true } = req.body ?? {};
    if (!idToken || typeof idToken !== 'string') {
      return res.status(400).json({ error: 'Missing Firebase ID token.' });
    }
    const decoded = await adminAuth.verifyIdToken(idToken);
    const email = decoded.email || `${decoded.uid}@firebase.local`;
    const resolvedName =
      typeof fullName === 'string' && fullName.trim()
        ? fullName.trim()
        : decoded.name || email.split('@')[0];
    const profile = await upsertFirebaseProfile({
      uid: decoded.uid,
      email,
      fullName: resolvedName,
      phone: typeof phone === 'string' ? phone : undefined,
      avatarUrl: decoded.picture,
      emailVerified: Boolean(decoded.email_verified),
    });
    if (!profile.isActive) {
      return res.status(403).json({ error: 'This account has been deactivated. Contact support.' });
    }

    const token = signSessionToken(
      { uid: profile.uid, profileId: profile.id, email: profile.email, roleName: profile.roleName },
      Boolean(rememberMe)
    );

    res.cookie('jb_session', token, {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: (rememberMe ? 14 : 1) * 24 * 60 * 60 * 1000,
    });

    res.json({ token, user: profile });
  } catch (error) {
    console.error('Firebase auth sync failed:', error);
    res.status(401).json({ error: 'Authentication token could not be verified.' });
  }
});

publicRouter.post('/auth/google', async (req, res) => {
  try {
    await ensureSeeded();
    const { idToken } = req.body ?? {};
    if (!idToken || typeof idToken !== 'string') {
      return res.status(400).json({ error: 'Missing Google ID token.' });
    }
    const decoded = await adminAuth.verifyIdToken(idToken);
    const email = decoded.email || `${decoded.uid}@firebase.local`;
    const fullName = decoded.name || email.split('@')[0];
    const profile = await upsertGoogleProfile(decoded.uid, email, fullName, decoded.picture);
    if (!profile.isActive) {
      return res.status(403).json({ error: 'This account has been deactivated.' });
    }

    const token = signSessionToken(
      { uid: profile.uid, profileId: profile.id, email: profile.email, roleName: profile.roleName },
      true
    );

    res.cookie('jb_session', token, {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 14 * 24 * 60 * 60 * 1000,
    });

    res.json({ token, user: profile });
  } catch (error) {
    console.error('Google auth verification failed:', error);
    res.status(401).json({ error: 'Google authentication could not be verified.' });
  }
});

publicRouter.post('/auth/verify-email', async (req, res) => {
  try {
    const { token } = req.body ?? {};
    if (!token) return res.status(400).json({ error: 'Verification token is required.' });
    const rows = await db
      .select()
      .from(profiles)
      .where(eq(profiles.verificationToken, String(token)))
      .limit(1);
    if (rows.length === 0) {
      return res.status(400).json({ error: 'Invalid or already used verification token.' });
    }
    const updated = await db
      .update(profiles)
      .set({ emailVerified: true, verificationToken: null, updatedAt: new Date() })
      .where(eq(profiles.id, rows[0].id))
      .returning();
    res.json({ user: toSafeProfile(updated[0]), message: 'Email verified successfully.' });
  } catch (error) {
    console.error('Verify email error:', error);
    res.status(500).json({ error: 'Failed to verify email.' });
  }
});

publicRouter.post('/auth/forgot-password', async (req, res) => {
  try {
    const cleanEmail = String(req.body?.email || '').toLowerCase().trim();
    if (!cleanEmail) return res.status(400).json({ error: 'Email address is required.' });
    const rows = await db.select().from(profiles).where(eq(profiles.email, cleanEmail)).limit(1);
    if (rows.length === 0) {
      return res.json({
        message: 'If an account matches that email, a password reset code has been generated.',
      });
    }
    const resetToken = crypto.randomBytes(12).toString('hex').toUpperCase();
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
    await db
      .update(profiles)
      .set({ resetToken, resetTokenExpiresAt: expiresAt, updatedAt: new Date() })
      .where(eq(profiles.id, rows[0].id));
    res.json({
      message: 'Password reset token generated. Enter the token below to set a new password.',
      resetTokenPreview: resetToken,
    });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ error: 'Unable to initiate password reset.' });
  }
});

publicRouter.post('/auth/reset-password', async (req, res) => {
  try {
    const { token, newPassword, confirmPassword } = req.body ?? {};
    if (!token || !newPassword || String(newPassword).length < 8) {
      return res.status(400).json({ error: 'Valid reset token and 8+ character password required.' });
    }
    if (newPassword !== confirmPassword) {
      return res.status(400).json({ error: 'Passwords do not match.' });
    }
    const rows = await db
      .select()
      .from(profiles)
      .where(eq(profiles.resetToken, String(token).trim().toUpperCase()))
      .limit(1);
    if (
      rows.length === 0 ||
      !rows[0].resetTokenExpiresAt ||
      rows[0].resetTokenExpiresAt < new Date()
    ) {
      return res.status(400).json({ error: 'Reset token is invalid or expired.' });
    }
    await db
      .update(profiles)
      .set({
        passwordHash: hashPassword(String(newPassword)),
        resetToken: null,
        resetTokenExpiresAt: null,
        updatedAt: new Date(),
      })
      .where(eq(profiles.id, rows[0].id));
    res.json({ message: 'Password updated successfully. You may now sign in.' });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ error: 'Failed to reset password.' });
  }
});

publicRouter.post('/auth/logout', (_req, res) => {
  res.clearCookie('jb_session');
  res.json({ success: true });
});

publicRouter.get('/auth/me', optionalAuth, (req: AuthRequest, res) => {
  res.json({ user: req.userProfile ?? null });
});

// ============================================
// STOREFRONT & MENU ENDPOINTS
// ============================================

publicRouter.get('/storefront', async (_req, res) => {
  try {
    await ensureSeeded();
    const [allSettings, allCategories, allProducts, activeBranches, activeCoupons, topReviews] =
      await Promise.all([
        db.select().from(storeSettings),
        db.select().from(categories).where(eq(categories.isActive, true)).orderBy(asc(categories.sortOrder)),
        db.select().from(products).where(eq(products.isAvailable, true)).orderBy(asc(products.id)),
        db.select().from(branches).where(eq(branches.isActive, true)).orderBy(asc(branches.id)),
        db.select().from(coupons).where(eq(coupons.isActive, true)).orderBy(asc(coupons.id)),
        db
          .select({
            id: reviews.id,
            rating: reviews.rating,
            title: reviews.title,
            comment: reviews.comment,
            isVerifiedPurchase: reviews.isVerifiedPurchase,
            createdAt: reviews.createdAt,
            authorName: profiles.fullName,
            productName: products.name,
            productId: products.id,
          })
          .from(reviews)
          .innerJoin(profiles, eq(reviews.profileId, profiles.id))
          .innerJoin(products, eq(reviews.productId, products.id))
          .where(eq(reviews.status, 'published'))
          .orderBy(desc(reviews.createdAt))
          .limit(6),
      ]);

    const settingsMap: Record<string, unknown> = {};
    for (const s of allSettings) {
      settingsMap[s.key] = s.value;
    }

    res.json({
      settings: settingsMap,
      categories: allCategories,
      bestSellers: allProducts.filter((p) => p.isBestSeller).slice(0, 6),
      signatureCollection: allProducts.filter((p) => p.isSignature).slice(0, 4),
      featuredProducts: allProducts.filter((p) => p.isFeatured).slice(0, 6),
      branches: activeBranches,
      promotions: activeCoupons,
      reviews: topReviews,
    });
  } catch (error) {
    console.error('Storefront load failed:', error);
    res.status(500).json({ error: 'Unable to load storefront data.' });
  }
});

publicRouter.get('/branches', async (_req, res) => {
  try {
    await ensureSeeded();
    const list = await db
      .select()
      .from(branches)
      .where(eq(branches.isActive, true))
      .orderBy(asc(branches.id));
    res.json({ branches: list });
  } catch (error) {
    console.error('Branches fetch failed:', error);
    res.status(500).json({ error: 'Unable to fetch branches.' });
  }
});

publicRouter.get('/products', async (req, res) => {
  try {
    await ensureSeeded();
    const { search, category, sort, filter, availableOnly } = req.query;

    const allCats = await db
      .select()
      .from(categories)
      .where(eq(categories.isActive, true))
      .orderBy(asc(categories.sortOrder));
    const catBySlug = new Map(allCats.map((c) => [c.slug, c.id]));

    const conditions = [];
    if (category && typeof category === 'string' && category !== 'all') {
      const catId = catBySlug.get(category);
      if (catId) conditions.push(eq(products.categoryId, catId));
    }
    if (search && typeof search === 'string' && search.trim()) {
      const q = `%${search.trim()}%`;
      conditions.push(or(ilike(products.name, q), ilike(products.description, q), ilike(products.ingredients, q)));
    }
    if (filter === 'best-sellers') conditions.push(eq(products.isBestSeller, true));
    if (filter === 'new-arrivals') conditions.push(eq(products.isNewArrival, true));
    if (filter === 'featured') conditions.push(eq(products.isFeatured, true));
    if (filter === 'signature') conditions.push(eq(products.isSignature, true));
    if (availableOnly === 'true') conditions.push(eq(products.isAvailable, true));

    let orderClause = desc(products.isBestSeller);
    if (sort === 'price_asc') orderClause = asc(products.priceCents);
    else if (sort === 'price_desc') orderClause = desc(products.priceCents);
    else if (sort === 'newest') orderClause = desc(products.createdAt);
    else if (sort === 'rating') orderClause = desc(products.ratingAvg);

    const rows =
      conditions.length > 0
        ? await db.select().from(products).where(and(...conditions)).orderBy(orderClause, asc(products.id))
        : await db.select().from(products).orderBy(orderClause, asc(products.id));

    const catById = new Map(allCats.map((c) => [c.id, c]));
    const enriched = rows.map((p) => ({
      ...p,
      categoryName: p.categoryId ? catById.get(p.categoryId)?.name ?? 'Menu' : 'Menu',
      categorySlug: p.categoryId ? catById.get(p.categoryId)?.slug ?? 'menu' : 'menu',
    }));

    res.json({ products: enriched, categories: allCats });
  } catch (error) {
    console.error('Products fetch failed:', error);
    res.status(500).json({ error: 'Unable to load menu items.' });
  }
});

publicRouter.get('/products/:id', async (req, res) => {
  try {
    await ensureSeeded();
    const productId = Number(req.params.id);
    if (!Number.isInteger(productId) || productId <= 0) {
      return res.status(400).json({ error: 'Invalid product identifier.' });
    }
    const rows = await db.select().from(products).where(eq(products.id, productId)).limit(1);
    if (rows.length === 0) return res.status(404).json({ error: 'Product not found.' });
    const product = rows[0];

    const [catRows, optsMap, productReviews] = await Promise.all([
      product.categoryId
        ? db.select().from(categories).where(eq(categories.id, product.categoryId)).limit(1)
        : Promise.resolve([]),
      getProductsWithOptions([product.id]),
      db
        .select({
          id: reviews.id,
          rating: reviews.rating,
          title: reviews.title,
          comment: reviews.comment,
          isVerifiedPurchase: reviews.isVerifiedPurchase,
          createdAt: reviews.createdAt,
          authorName: profiles.fullName,
        })
        .from(reviews)
        .innerJoin(profiles, eq(reviews.profileId, profiles.id))
        .where(and(eq(reviews.productId, product.id), eq(reviews.status, 'published')))
        .orderBy(desc(reviews.createdAt)),
    ]);

    res.json({
      product: {
        ...product,
        categoryName: catRows[0]?.name ?? 'Menu',
        categorySlug: catRows[0]?.slug ?? 'menu',
        options: optsMap.get(product.id) ?? [],
      },
      reviews: productReviews,
    });
  } catch (error) {
    console.error('Product detail fetch failed:', error);
    res.status(500).json({ error: 'Unable to load product details.' });
  }
});

publicRouter.get('/combo-options', async (_req, res) => {
  try {
    await ensureSeeded();
    const eligible = await db
      .select()
      .from(products)
      .where(and(eq(products.isComboEligible, true), eq(products.isAvailable, true)))
      .orderBy(asc(products.id));

    const burgers = eligible.filter((p) => p.comboRole === 'burger');
    const sides = eligible.filter((p) => p.comboRole === 'side');
    const drinks = eligible.filter((p) => p.comboRole === 'drink');
    const addons = eligible.filter((p) => p.comboRole === 'addon' || p.comboRole === 'side');

    const optsMap = await getProductsWithOptions(burgers.map((b) => b.id));

    res.json({
      burgers: burgers.map((b) => ({ ...b, options: optsMap.get(b.id) ?? [] })),
      sides,
      drinks,
      addons,
      comboDiscountPercent: 10,
    });
  } catch (error) {
    console.error('Combo options fetch failed:', error);
    res.status(500).json({ error: 'Unable to load combo builder options.' });
  }
});

publicRouter.post('/newsletter', async (req, res) => {
  try {
    const cleanEmail = String(req.body?.email || '').toLowerCase().trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      return res.status(400).json({ error: 'Please provide a valid email address.' });
    }
    await db.insert(newsletterSubscribers).values({ email: cleanEmail }).onConflictDoNothing();
    res.json({ message: 'Subscribed to JUST BURGER drops and member offers.' });
  } catch (error) {
    console.error('Newsletter subscribe error:', error);
    res.status(500).json({ error: 'Unable to subscribe right now.' });
  }
});

// ============================================
// CART ENDPOINTS
// ============================================

function getCartSessionToken(req: AuthRequest): string {
  const headerToken = req.headers['x-cart-session'];
  if (typeof headerToken === 'string' && headerToken.trim()) {
    return headerToken.trim();
  }
  return `guest-${crypto.randomUUID()}`;
}

publicRouter.get('/cart', optionalAuth, async (req: AuthRequest, res) => {
  try {
    await ensureSeeded();
    const token = getCartSessionToken(req);
    const cartRow = await getOrCreateCart(token, req.userProfile?.id ?? null);
    const serialized = await serializeCart(cartRow);
    res.json({ cart: serialized });
  } catch (error) {
    console.error('Cart fetch error:', error);
    res.status(500).json({ error: 'Unable to load cart.' });
  }
});

publicRouter.post('/cart/items', optionalAuth, async (req: AuthRequest, res) => {
  try {
    await ensureSeeded();
    const { productId, quantity = 1, customizationIds = [], specialInstructions = '' } = req.body ?? {};
    const qty = Number(quantity);
    if (!Number.isInteger(qty) || qty < 1 || qty > 50) {
      return res.status(400).json({ error: 'Quantity must be between 1 and 50.' });
    }
    const prodId = Number(productId);
    const prodRows = await db.select().from(products).where(eq(products.id, prodId)).limit(1);
    if (prodRows.length === 0) return res.status(404).json({ error: 'Product not found.' });
    const product = prodRows[0];
    if (!product.isAvailable) {
      return res.status(400).json({ error: `${product.name} is currently unavailable.` });
    }

    // Validate customizations on server
    const selectedCustomizations: CartCustomizationItem[] = [];
    if (Array.isArray(customizationIds) && customizationIds.length > 0) {
      const numericIds = customizationIds.map(Number).filter((n) => Number.isInteger(n) && n > 0);
      if (numericIds.length > 0) {
        const custRows = await db
          .select({
            id: productCustomizations.id,
            name: productCustomizations.name,
            priceDeltaCents: productCustomizations.priceDeltaCents,
            isAvailable: productCustomizations.isAvailable,
            optionGroup: productOptions.groupName,
            optionProductId: productOptions.productId,
          })
          .from(productCustomizations)
          .innerJoin(productOptions, eq(productCustomizations.optionId, productOptions.id))
          .where(inArray(productCustomizations.id, numericIds));

        for (const c of custRows) {
          if (c.optionProductId !== product.id) {
            return res.status(400).json({ error: 'Invalid customization selected for this product.' });
          }
          if (!c.isAvailable) {
            return res.status(400).json({ error: `Customization "${c.name}" is currently unavailable.` });
          }
          selectedCustomizations.push({
            customizationId: c.id,
            optionGroup: c.optionGroup,
            name: c.name,
            priceDeltaCents: c.priceDeltaCents,
          });
        }
      }
    }

    const extrasCents = selectedCustomizations.reduce((s, c) => s + c.priceDeltaCents, 0);
    const unitPriceCents = product.priceCents + extrasCents;

    const token = getCartSessionToken(req);
    const cartRow = await getOrCreateCart(token, req.userProfile?.id ?? null);

    await db.insert(cartItems).values({
      cartId: cartRow.id,
      productId: product.id,
      itemType: 'product',
      displayName: product.name,
      imageUrl: product.imageUrl,
      selectedCustomizations,
      comboPayload: null,
      quantity: qty,
      unitPriceCents,
      specialInstructions: String(specialInstructions || '').slice(0, 250),
    });

    const serialized = await serializeCart(cartRow);
    res.status(201).json({ cart: serialized, message: `Added ${product.name} to cart.` });
  } catch (error) {
    console.error('Add to cart failed:', error);
    res.status(500).json({ error: 'Failed to add item to cart.' });
  }
});

publicRouter.post('/cart/combo', optionalAuth, async (req: AuthRequest, res) => {
  try {
    await ensureSeeded();
    const {
      burgerId,
      burgerCustomizationIds = [],
      sideId,
      drinkId,
      addonIds = [],
      quantity = 1,
      specialInstructions = '',
    } = req.body ?? {};

    const qty = Number(quantity);
    if (!Number.isInteger(qty) || qty < 1 || qty > 20) {
      return res.status(400).json({ error: 'Invalid combo quantity.' });
    }

    const [burgerRows, sideRows, drinkRows] = await Promise.all([
      db.select().from(products).where(eq(products.id, Number(burgerId))).limit(1),
      db.select().from(products).where(eq(products.id, Number(sideId))).limit(1),
      db.select().from(products).where(eq(products.id, Number(drinkId))).limit(1),
    ]);

    const burger = burgerRows[0];
    const side = sideRows[0];
    const drink = drinkRows[0];

    if (!burger || !side || !drink) {
      return res.status(400).json({ error: 'Please choose a burger, side, and drink.' });
    }
    if (!burger.isAvailable || !side.isAvailable || !drink.isAvailable) {
      return res.status(400).json({ error: 'One or more selected combo items are unavailable.' });
    }

    const burgerCustomizations: CartCustomizationItem[] = [];
    if (Array.isArray(burgerCustomizationIds) && burgerCustomizationIds.length > 0) {
      const custIds = burgerCustomizationIds.map(Number).filter((n) => Number.isInteger(n) && n > 0);
      if (custIds.length > 0) {
        const custRows = await db
          .select({
            id: productCustomizations.id,
            name: productCustomizations.name,
            priceDeltaCents: productCustomizations.priceDeltaCents,
            isAvailable: productCustomizations.isAvailable,
            optionGroup: productOptions.groupName,
            optionProductId: productOptions.productId,
          })
          .from(productCustomizations)
          .innerJoin(productOptions, eq(productCustomizations.optionId, productOptions.id))
          .where(inArray(productCustomizations.id, custIds));
        for (const c of custRows) {
          if (c.optionProductId !== burger.id || !c.isAvailable) {
            return res.status(400).json({ error: `Unavailable customization: ${c.name}` });
          }
          burgerCustomizations.push({
            customizationId: c.id,
            optionGroup: c.optionGroup,
            name: c.name,
            priceDeltaCents: c.priceDeltaCents,
          });
        }
      }
    }

    const cleanAddonIds = Array.isArray(addonIds)
      ? addonIds.map(Number).filter((n) => Number.isInteger(n) && n > 0)
      : [];
    const addonProducts =
      cleanAddonIds.length > 0
        ? await db.select().from(products).where(inArray(products.id, cleanAddonIds))
        : [];
    for (const a of addonProducts) {
      if (!a.isAvailable) {
        return res.status(400).json({ error: `Add-on ${a.name} is unavailable.` });
      }
    }

    const burgerExtras = burgerCustomizations.reduce((s, c) => s + c.priceDeltaCents, 0);
    const addonsTotal = addonProducts.reduce((s, a) => s + a.priceCents, 0);
    const rawComboTotal = burger.priceCents + burgerExtras + side.priceCents + drink.priceCents + addonsTotal;
    const comboDiscountCents = Math.round(rawComboTotal * 0.1); // 10% custom combo bundle savings
    const unitPriceCents = rawComboTotal - comboDiscountCents;

    const comboPayload: ComboSelectionPayload = {
      burgerId: burger.id,
      burgerName: burger.name,
      burgerCustomizations,
      sideId: side.id,
      sideName: side.name,
      drinkId: drink.id,
      drinkName: drink.name,
      addonIds: addonProducts.map((a) => a.id),
      addonNames: addonProducts.map((a) => a.name),
      comboDiscountCents,
    };

    const token = getCartSessionToken(req);
    const cartRow = await getOrCreateCart(token, req.userProfile?.id ?? null);

    await db.insert(cartItems).values({
      cartId: cartRow.id,
      productId: burger.id,
      itemType: 'combo',
      displayName: `Custom Combo: ${burger.name}`,
      imageUrl: '/src/assets/images/burger_combo_meal_1795056342216.jpg',
      selectedCustomizations: burgerCustomizations,
      comboPayload,
      quantity: qty,
      unitPriceCents,
      specialInstructions: String(specialInstructions || '').slice(0, 250),
    });

    const serialized = await serializeCart(cartRow);
    res.status(201).json({ cart: serialized, message: 'Custom combo added to cart!' });
  } catch (error) {
    console.error('Add combo error:', error);
    res.status(500).json({ error: 'Unable to add custom combo.' });
  }
});

publicRouter.patch('/cart/items/:itemId', optionalAuth, async (req: AuthRequest, res) => {
  try {
    const itemId = Number(req.params.itemId);
    const qty = Number(req.body?.quantity);
    if (!Number.isInteger(itemId) || !Number.isInteger(qty) || qty < 1 || qty > 50) {
      return res.status(400).json({ error: 'Quantity must be between 1 and 50.' });
    }
    const token = getCartSessionToken(req);
    const cartRow = await getOrCreateCart(token, req.userProfile?.id ?? null);

    await db
      .update(cartItems)
      .set({ quantity: qty, updatedAt: new Date() })
      .where(and(eq(cartItems.id, itemId), eq(cartItems.cartId, cartRow.id)));

    const serialized = await serializeCart(cartRow);
    res.json({ cart: serialized });
  } catch (error) {
    console.error('Update cart item error:', error);
    res.status(500).json({ error: 'Failed to update cart item.' });
  }
});

publicRouter.delete('/cart/items/:itemId', optionalAuth, async (req: AuthRequest, res) => {
  try {
    const itemId = Number(req.params.itemId);
    const token = getCartSessionToken(req);
    const cartRow = await getOrCreateCart(token, req.userProfile?.id ?? null);

    await db
      .delete(cartItems)
      .where(and(eq(cartItems.id, itemId), eq(cartItems.cartId, cartRow.id)));

    const serialized = await serializeCart(cartRow);
    res.json({ cart: serialized });
  } catch (error) {
    console.error('Delete cart item error:', error);
    res.status(500).json({ error: 'Failed to remove cart item.' });
  }
});

publicRouter.post('/cart/coupon', optionalAuth, async (req: AuthRequest, res) => {
  try {
    const code = String(req.body?.code || '').trim().toUpperCase();
    if (!code) return res.status(400).json({ error: 'Please enter a promo code.' });
    const token = getCartSessionToken(req);
    const cartRow = await getOrCreateCart(token, req.userProfile?.id ?? null);
    const current = await serializeCart(cartRow);

    const check = await evaluateCoupon(code, current.subtotalCents);
    if (!check.valid) {
      return res.status(400).json({ error: check.reason });
    }

    await db
      .update(carts)
      .set({ couponCode: code, updatedAt: new Date() })
      .where(eq(carts.id, cartRow.id));
    cartRow.couponCode = code;

    const serialized = await serializeCart(cartRow);
    res.json({ cart: serialized, message: `Promo code ${code} applied!` });
  } catch (error) {
    console.error('Apply coupon error:', error);
    res.status(500).json({ error: 'Unable to apply promo code.' });
  }
});

publicRouter.delete('/cart/coupon', optionalAuth, async (req: AuthRequest, res) => {
  try {
    const token = getCartSessionToken(req);
    const cartRow = await getOrCreateCart(token, req.userProfile?.id ?? null);
    await db.update(carts).set({ couponCode: null, updatedAt: new Date() }).where(eq(carts.id, cartRow.id));
    cartRow.couponCode = null;
    const serialized = await serializeCart(cartRow);
    res.json({ cart: serialized });
  } catch (error) {
    console.error('Remove coupon error:', error);
    res.status(500).json({ error: 'Failed to remove promo code.' });
  }
});

publicRouter.patch('/cart/branch', optionalAuth, async (req: AuthRequest, res) => {
  try {
    const branchId = Number(req.body?.branchId);
    const branchRows = await db
      .select()
      .from(branches)
      .where(and(eq(branches.id, branchId), eq(branches.isActive, true)))
      .limit(1);
    if (branchRows.length === 0) {
      return res.status(404).json({ error: 'Selected branch is unavailable.' });
    }
    const token = getCartSessionToken(req);
    const cartRow = await getOrCreateCart(token, req.userProfile?.id ?? null);
    await db.update(carts).set({ branchId, updatedAt: new Date() }).where(eq(carts.id, cartRow.id));
    cartRow.branchId = branchId;
    const serialized = await serializeCart(cartRow);
    res.json({ cart: serialized });
  } catch (error) {
    console.error('Cart branch update error:', error);
    res.status(500).json({ error: 'Failed to update branch.' });
  }
});
