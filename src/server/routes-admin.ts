import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { Router } from 'express';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { db } from '../db/index.ts';
import {
  branches,
  categories,
  coupons,
  inventory,
  inventoryTransactions,
  loyaltyAccounts,
  loyaltyTransactions,
  notifications,
  orderItems,
  orders,
  orderStatusHistory,
  payments,
  productCustomizations,
  productOptions,
  products,
  profiles,
  reviews,
  roles,
  staffAccounts,
  storeSettings,
} from '../db/schema.ts';
import { AuthRequest, hashPassword, requireAdmin, requireStaffOrAdmin } from './auth.ts';
import { realtimeHub } from './realtime.ts';

export const adminRouter = Router();

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pending Confirmation',
  confirmed: 'Confirmed',
  preparing: 'Preparing on the Grill',
  ready_for_pickup: 'Ready for Pickup',
  out_for_delivery: 'Out for Delivery',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

// Helper: award loyalty points ONLY if order is completed AND paid and hasn't earned points yet
async function maybeAwardLoyaltyPoints(orderId: number) {
  const orderRows = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (orderRows.length === 0) return;
  const order = orderRows[0];
  if (order.status !== 'completed' || order.paymentStatus !== 'paid' || order.pointsEarned > 0) {
    return;
  }

  const ruleRows = await db
    .select()
    .from(storeSettings)
    .where(eq(storeSettings.key, 'loyalty_rules'))
    .limit(1);
  const pointsPerDollar = Number(
    (ruleRows[0]?.value as Record<string, unknown>)?.pointsPerDollar ?? 10
  );
  const earned = Math.max(0, Math.floor((order.totalCents / 100) * pointsPerDollar));
  if (earned <= 0) return;

  await db.transaction(async (tx) => {
    const accRows = await tx
      .select()
      .from(loyaltyAccounts)
      .where(eq(loyaltyAccounts.profileId, order.profileId))
      .limit(1);

    let accountId: number;
    let newLifetime = earned;
    let newBalance = earned;

    if (accRows.length === 0) {
      const created = await tx
        .insert(loyaltyAccounts)
        .values({
          profileId: order.profileId,
          pointsBalance: earned,
          lifetimePoints: earned,
          tierName: earned >= 500 ? 'Gold Grill' : 'Flame Member',
        })
        .returning();
      accountId = created[0].id;
    } else {
      accountId = accRows[0].id;
      newBalance = accRows[0].pointsBalance + earned;
      newLifetime = accRows[0].lifetimePoints + earned;
      const tierName =
        newLifetime >= 2000
          ? 'Black Label VIP'
          : newLifetime >= 800
            ? 'Gold Grill'
            : 'Flame Member';
      await tx
        .update(loyaltyAccounts)
        .set({ pointsBalance: newBalance, lifetimePoints: newLifetime, tierName, updatedAt: new Date() })
        .where(eq(loyaltyAccounts.id, accountId));
    }

    await tx.insert(loyaltyTransactions).values({
      loyaltyAccountId: accountId,
      orderId: order.id,
      pointsDelta: earned,
      transactionType: 'earn',
      description: `Earned from completed paid order ${order.orderNumber}`,
    });

    await tx
      .update(orders)
      .set({ pointsEarned: earned, updatedAt: new Date() })
      .where(eq(orders.id, order.id));

    await tx.insert(notifications).values({
      profileId: order.profileId,
      orderId: order.id,
      type: 'loyalty',
      title: `+${earned} JUST Rewards Points Earned`,
      message: `Thanks for dining with JUST BURGER! Order ${order.orderNumber} added ${earned} points to your balance.`,
    });
  });
}

// ============================================
// OVERVIEW & REPORTS (Staff / Admin)
// ============================================

adminRouter.get('/admin/overview', requireStaffOrAdmin, async (_req: AuthRequest, res) => {
  try {
    const [allOrders, allCustomers, allProducts, allInventory, allBranches] = await Promise.all([
      db.select().from(orders).orderBy(desc(orders.createdAt)),
      db.select().from(profiles).where(eq(profiles.roleName, 'customer')),
      db.select().from(products),
      db.select().from(inventory),
      db.select().from(branches),
    ]);

    const branchMap = new Map(allBranches.map((b) => [b.id, b.name]));
    const paidOrActiveOrders = allOrders.filter((o) => o.status !== 'cancelled');
    const totalRevenueCents = paidOrActiveOrders
      .filter((o) => o.paymentStatus === 'paid' || o.status === 'completed')
      .reduce((sum, o) => sum + o.totalCents, 0);

    const pendingOrdersCount = allOrders.filter((o) =>
      ['pending', 'confirmed', 'preparing', 'ready_for_pickup', 'out_for_delivery'].includes(o.status)
    ).length;
    const completedOrdersCount = allOrders.filter((o) => o.status === 'completed').length;
    const lowStockItems = allInventory.filter((i) => i.quantityOnHand <= i.reorderThreshold);

    // Revenue by day (last 7 days)
    const dailyMap = new Map<string, { date: string; revenueCents: number; orders: number }>();
    for (let d = 6; d >= 0; d--) {
      const dt = new Date();
      dt.setDate(dt.getDate() - d);
      const key = dt.toISOString().slice(0, 10);
      dailyMap.set(key, { date: key, revenueCents: 0, orders: 0 });
    }
    for (const o of paidOrActiveOrders) {
      const key = new Date(o.createdAt).toISOString().slice(0, 10);
      if (dailyMap.has(key)) {
        const entry = dailyMap.get(key)!;
        entry.revenueCents += o.totalCents;
        entry.orders += 1;
      }
    }

    // Popular products from order_items
    const popularRows = await db
      .select({
        productName: orderItems.productNameSnapshot,
        unitsSold: sql<number>`SUM(${orderItems.quantity})::int`,
        revenueCents: sql<number>`SUM(${orderItems.lineTotalCents})::int`,
      })
      .from(orderItems)
      .groupBy(orderItems.productNameSnapshot)
      .orderBy(desc(sql`SUM(${orderItems.quantity})`))
      .limit(6);

    const statusBreakdown: Record<string, number> = {};
    for (const o of allOrders) {
      statusBreakdown[o.status] = (statusBreakdown[o.status] ?? 0) + 1;
    }

    res.json({
      kpis: {
        totalRevenueCents,
        totalOrders: allOrders.length,
        pendingOrders: pendingOrdersCount,
        completedOrders: completedOrdersCount,
        totalCustomers: allCustomers.length,
        totalProducts: allProducts.length,
        lowStockProducts: lowStockItems.length,
      },
      revenueSeries: Array.from(dailyMap.values()),
      popularProducts: popularRows,
      statusBreakdown,
      lowStockItems,
      recentOrders: allOrders.slice(0, 10).map((o) => ({
        ...o,
        branchName: branchMap.get(o.branchId) ?? 'Branch',
      })),
    });
  } catch (error) {
    console.error('Admin overview failed:', error);
    res.status(500).json({ error: 'Unable to load dashboard analytics.' });
  }
});

// ============================================
// ORDERS & KITCHEN DISPLAY (Staff / Admin)
// ============================================

adminRouter.get('/admin/orders', requireStaffOrAdmin, async (req: AuthRequest, res) => {
  try {
    const { status, search } = req.query;
    const allOrders = await db.select().from(orders).orderBy(desc(orders.createdAt));
    const allBranches = await db.select().from(branches);
    const branchMap = new Map(allBranches.map((b) => [b.id, b]));

    const filtered = allOrders.filter((o) => {
      if (status && status !== 'all' && o.status !== status) return false;
      if (search && typeof search === 'string' && search.trim()) {
        const q = search.trim().toLowerCase();
        return (
          o.orderNumber.toLowerCase().includes(q) ||
          o.customerName.toLowerCase().includes(q) ||
          o.customerEmail.toLowerCase().includes(q) ||
          o.customerPhone.toLowerCase().includes(q)
        );
      }
      return true;
    });

    const enriched = await Promise.all(
      filtered.map(async (ord) => {
        const [items, history, paymentRows] = await Promise.all([
          db.select().from(orderItems).where(eq(orderItems.orderId, ord.id)),
          db
            .select()
            .from(orderStatusHistory)
            .where(eq(orderStatusHistory.orderId, ord.id))
            .orderBy(desc(orderStatusHistory.createdAt)),
          db.select().from(payments).where(eq(payments.orderId, ord.id)).limit(1),
        ]);
        return {
          ...ord,
          branch: branchMap.get(ord.branchId) ?? null,
          items,
          history,
          payment: paymentRows[0] ?? null,
        };
      })
    );

    res.json({ orders: enriched });
  } catch (error) {
    console.error('Admin orders fetch failed:', error);
    res.status(500).json({ error: 'Failed to load orders.' });
  }
});

adminRouter.get('/kitchen/orders', requireStaffOrAdmin, async (_req: AuthRequest, res) => {
  try {
    const recent = await db.select().from(orders).orderBy(asc(orders.createdAt));
    const active = recent.filter((o) => o.status !== 'cancelled').slice(-60);
    const allBranches = await db.select().from(branches);
    const branchMap = new Map(allBranches.map((b) => [b.id, b.name]));

    const withItems = await Promise.all(
      active.map(async (ord) => {
        const items = await db.select().from(orderItems).where(eq(orderItems.orderId, ord.id));
        return {
          ...ord,
          branchName: branchMap.get(ord.branchId) ?? 'Kitchen',
          items,
        };
      })
    );

    res.json({
      columns: {
        newOrders: withItems.filter((o) => o.status === 'pending' || o.status === 'confirmed'),
        preparing: withItems.filter((o) => o.status === 'preparing'),
        ready: withItems.filter(
          (o) => o.status === 'ready_for_pickup' || o.status === 'out_for_delivery'
        ),
        completed: withItems.filter((o) => o.status === 'completed').slice(-12).reverse(),
      },
    });
  } catch (error) {
    console.error('Kitchen orders fetch failed:', error);
    res.status(500).json({ error: 'Unable to load kitchen display queue.' });
  }
});

adminRouter.patch('/admin/orders/:id/status', requireStaffOrAdmin, async (req: AuthRequest, res) => {
  try {
    const orderId = Number(req.params.id);
    const { status, note, rejectionReason } = req.body ?? {};
    const validStatuses = [
      'pending',
      'confirmed',
      'preparing',
      'ready_for_pickup',
      'out_for_delivery',
      'completed',
      'cancelled',
    ];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid order status.' });
    }

    const rows = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
    if (rows.length === 0) return res.status(404).json({ error: 'Order not found.' });
    const current = rows[0];

    await db.transaction(async (tx) => {
      await tx
        .update(orders)
        .set({
          status,
          rejectionReason: status === 'cancelled' ? String(rejectionReason || note || 'Cancelled by restaurant') : current.rejectionReason,
          updatedAt: new Date(),
        })
        .where(eq(orders.id, orderId));

      await tx.insert(orderStatusHistory).values({
        orderId,
        previousStatus: current.status,
        newStatus: status,
        changedByProfileId: req.userProfile!.id,
        note: note ? String(note) : `Status changed to ${STATUS_LABELS[status] || status}`,
      });

      await tx.insert(notifications).values({
        profileId: current.profileId,
        orderId,
        type: 'order_update',
        title: `Order ${current.orderNumber}: ${STATUS_LABELS[status] || status}`,
        message:
          status === 'cancelled' && rejectionReason
            ? `Your order was cancelled: ${rejectionReason}`
            : `Your order status is now "${STATUS_LABELS[status] || status}".`,
      });
    });

    if (status === 'completed') {
      await maybeAwardLoyaltyPoints(orderId);
    }

    realtimeHub.broadcastToStaff('order:updated', { orderId, status });
    realtimeHub.sendToProfile(current.profileId, 'order:updated', {
      orderNumber: current.orderNumber,
      status,
    });
    realtimeHub.sendToProfile(current.profileId, 'notification:created', {
      orderNumber: current.orderNumber,
      status,
    });

    const updated = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
    res.json({ order: updated[0] });
  } catch (error) {
    console.error('Update order status failed:', error);
    res.status(500).json({ error: 'Failed to update order status.' });
  }
});

adminRouter.patch('/admin/orders/:id/payment', requireStaffOrAdmin, async (req: AuthRequest, res) => {
  try {
    const orderId = Number(req.params.id);
    const { paymentStatus, providerReference } = req.body ?? {};
    if (!['unpaid', 'pending_verification', 'paid', 'failed', 'refunded'].includes(paymentStatus)) {
      return res.status(400).json({ error: 'Invalid payment status.' });
    }
    const rows = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
    if (rows.length === 0) return res.status(404).json({ error: 'Order not found.' });

    await db.transaction(async (tx) => {
      await tx
        .update(orders)
        .set({ paymentStatus, updatedAt: new Date() })
        .where(eq(orders.id, orderId));

      await tx
        .update(payments)
        .set({
          status: paymentStatus === 'paid' ? 'verified' : paymentStatus === 'refunded' ? 'refunded' : 'pending',
          providerReference: providerReference ? String(providerReference) : undefined,
          verifiedAt: paymentStatus === 'paid' ? new Date() : null,
          updatedAt: new Date(),
        })
        .where(eq(payments.orderId, orderId));
    });

    if (paymentStatus === 'paid') {
      await maybeAwardLoyaltyPoints(orderId);
    }

    realtimeHub.broadcastToStaff('order:updated', { orderId, paymentStatus });
    res.json({ success: true, paymentStatus });
  } catch (error) {
    console.error('Update payment status failed:', error);
    res.status(500).json({ error: 'Failed to update payment status.' });
  }
});

// ============================================
// PRODUCT & CATEGORY MANAGEMENT (Admin)
// ============================================

adminRouter.post('/admin/upload', requireAdmin, async (req: AuthRequest, res) => {
  try {
    const { dataUrl, filename } = req.body ?? {};
    if (!dataUrl || typeof dataUrl !== 'string') {
      return res.status(400).json({ error: 'Image payload required.' });
    }
    const match = dataUrl.match(/^data:(image\/(jpeg|jpg|png|webp));base64,(.+)$/i);
    if (!match) {
      return res.status(400).json({ error: 'Only JPEG, PNG, and WebP images are permitted.' });
    }
    const ext = match[2].toLowerCase() === 'jpeg' ? 'jpg' : match[2].toLowerCase();
    const buf = Buffer.from(match[3], 'base64');
    if (buf.length > 2 * 1024 * 1024) {
      return res.status(400).json({ error: 'Image exceeds maximum 2MB upload size.' });
    }

    const uploadsDir = path.resolve(process.cwd(), 'public', 'uploads');
    fs.mkdirSync(uploadsDir, { recursive: true });
    const safeName = `${Date.now()}_${crypto.randomBytes(4).toString('hex')}_${String(filename || 'img').replace(/[^a-z0-9]/gi, '_').slice(0, 20)}.${ext}`;
    fs.writeFileSync(path.join(uploadsDir, safeName), buf);

    res.status(201).json({ imageUrl: `/uploads/${safeName}` });
  } catch (error) {
    console.error('Image upload error:', error);
    res.status(500).json({ error: 'Failed to process image upload.' });
  }
});

adminRouter.get('/admin/products', requireStaffOrAdmin, async (_req, res) => {
  try {
    const [allProducts, allCats, allOpts, allCusts] = await Promise.all([
      db.select().from(products).orderBy(asc(products.id)),
      db.select().from(categories).orderBy(asc(categories.sortOrder)),
      db.select().from(productOptions).orderBy(asc(productOptions.sortOrder)),
      db.select().from(productCustomizations).orderBy(asc(productCustomizations.sortOrder)),
    ]);
    const custByOpt = new Map<number, typeof allCusts>();
    for (const c of allCusts) {
      const arr = custByOpt.get(c.optionId) ?? [];
      arr.push(c);
      custByOpt.set(c.optionId, arr);
    }
    const optsByProd = new Map<number, unknown[]>();
    for (const o of allOpts) {
      const arr = optsByProd.get(o.productId) ?? [];
      arr.push({ ...o, customizations: custByOpt.get(o.id) ?? [] });
      optsByProd.set(o.productId, arr);
    }
    res.json({
      products: allProducts.map((p) => ({ ...p, options: optsByProd.get(p.id) ?? [] })),
      categories: allCats,
    });
  } catch (error) {
    console.error('Admin products error:', error);
    res.status(500).json({ error: 'Failed to load products.' });
  }
});

adminRouter.post('/admin/products', requireAdmin, async (req, res) => {
  try {
    const {
      name,
      categoryId,
      description,
      ingredients,
      priceCents,
      imageUrl,
      calories,
      isFeatured,
      isBestSeller,
      isNewArrival,
      isSignature,
      isAvailable,
      isComboEligible,
      comboRole,
    } = req.body ?? {};
    if (!name || !description || !Number.isInteger(Number(priceCents)) || Number(priceCents) < 0) {
      return res.status(400).json({ error: 'Valid name, description, and price are required.' });
    }
    const slug = `${String(name)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')}-${Date.now().toString().slice(-4)}`;

    const inserted = await db
      .insert(products)
      .values({
        name: String(name).trim(),
        slug,
        categoryId: categoryId ? Number(categoryId) : null,
        description: String(description).trim(),
        ingredients: String(ingredients || '').trim(),
        priceCents: Number(priceCents),
        imageUrl: imageUrl || '/src/assets/images/classic_smash_burger_1795056342466.jpg',
        calories: Number(calories || 650),
        isFeatured: Boolean(isFeatured),
        isBestSeller: Boolean(isBestSeller),
        isNewArrival: Boolean(isNewArrival),
        isSignature: Boolean(isSignature),
        isAvailable: isAvailable !== false,
        isComboEligible: Boolean(isComboEligible),
        comboRole: comboRole || null,
      })
      .returning();

    res.status(201).json({ product: inserted[0] });
  } catch (error) {
    console.error('Create product failed:', error);
    res.status(500).json({ error: 'Failed to create product.' });
  }
});

adminRouter.patch('/admin/products/:id', requireAdmin, async (req, res) => {
  try {
    const productId = Number(req.params.id);
    const body = req.body ?? {};
    const updateData: Record<string, unknown> = { updatedAt: new Date() };
    const allowedFields = [
      'name',
      'categoryId',
      'description',
      'ingredients',
      'priceCents',
      'imageUrl',
      'calories',
      'isFeatured',
      'isBestSeller',
      'isNewArrival',
      'isSignature',
      'isAvailable',
      'isComboEligible',
      'comboRole',
    ];
    for (const f of allowedFields) {
      if (body[f] !== undefined) updateData[f] = body[f];
    }
    const updated = await db
      .update(products)
      .set(updateData)
      .where(eq(products.id, productId))
      .returning();
    if (updated.length === 0) return res.status(404).json({ error: 'Product not found.' });
    res.json({ product: updated[0] });
  } catch (error) {
    console.error('Update product failed:', error);
    res.status(500).json({ error: 'Failed to update product.' });
  }
});

adminRouter.delete('/admin/products/:id', requireAdmin, async (req, res) => {
  try {
    await db.delete(products).where(eq(products.id, Number(req.params.id)));
    res.json({ success: true });
  } catch (error) {
    console.error('Delete product failed:', error);
    res.status(500).json({ error: 'Failed to delete product.' });
  }
});

adminRouter.post('/admin/products/:id/options', requireAdmin, async (req, res) => {
  try {
    const productId = Number(req.params.id);
    const { groupName, customizationName, priceDeltaCents = 0, isAvailable = true } = req.body ?? {};
    if (!groupName || !customizationName) {
      return res.status(400).json({ error: 'Option group name and customization name are required.' });
    }
    let optRows = await db
      .select()
      .from(productOptions)
      .where(and(eq(productOptions.productId, productId), eq(productOptions.groupName, String(groupName))))
      .limit(1);
    if (optRows.length === 0) {
      optRows = await db
        .insert(productOptions)
        .values({ productId, groupName: String(groupName), selectionType: 'multiple' })
        .returning();
    }
    const createdCust = await db
      .insert(productCustomizations)
      .values({
        optionId: optRows[0].id,
        name: String(customizationName).trim(),
        priceDeltaCents: Number(priceDeltaCents),
        isAvailable: Boolean(isAvailable),
      })
      .returning();
    res.status(201).json({ customization: createdCust[0] });
  } catch (error) {
    console.error('Add option error:', error);
    res.status(500).json({ error: 'Failed to add product customization.' });
  }
});

adminRouter.patch('/admin/customizations/:id', requireAdmin, async (req, res) => {
  try {
    const { isAvailable, priceDeltaCents, name } = req.body ?? {};
    const update: Record<string, unknown> = { updatedAt: new Date() };
    if (isAvailable !== undefined) update.isAvailable = Boolean(isAvailable);
    if (priceDeltaCents !== undefined) update.priceDeltaCents = Number(priceDeltaCents);
    if (name !== undefined) update.name = String(name);
    const updated = await db
      .update(productCustomizations)
      .set(update)
      .where(eq(productCustomizations.id, Number(req.params.id)))
      .returning();
    res.json({ customization: updated[0] });
  } catch (error) {
    console.error('Update customization error:', error);
    res.status(500).json({ error: 'Failed to update customization.' });
  }
});

adminRouter.delete('/admin/customizations/:id', requireAdmin, async (req, res) => {
  try {
    await db.delete(productCustomizations).where(eq(productCustomizations.id, Number(req.params.id)));
    res.json({ success: true });
  } catch (error) {
    console.error('Delete customization error:', error);
    res.status(500).json({ error: 'Failed to remove customization.' });
  }
});

// Categories CRUD
adminRouter.get('/admin/categories', requireStaffOrAdmin, async (_req, res) => {
  try {
    const list = await db.select().from(categories).orderBy(asc(categories.sortOrder));
    res.json({ categories: list });
  } catch (error) {
    console.error('Admin categories failed:', error);
    res.status(500).json({ error: 'Failed to load categories.' });
  }
});

adminRouter.post('/admin/categories', requireAdmin, async (req, res) => {
  try {
    const { name, description, imageUrl, sortOrder = 10, isActive = true } = req.body ?? {};
    if (!name) return res.status(400).json({ error: 'Category name is required.' });
    const slug = String(name)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    const inserted = await db
      .insert(categories)
      .values({
        name: String(name).trim(),
        slug: `${slug}-${Date.now().toString().slice(-3)}`,
        description: String(description || ''),
        imageUrl: imageUrl || '/src/assets/images/classic_smash_burger_1795056342466.jpg',
        sortOrder: Number(sortOrder),
        isActive: Boolean(isActive),
      })
      .returning();
    res.status(201).json({ category: inserted[0] });
  } catch (error) {
    console.error('Create category error:', error);
    res.status(500).json({ error: 'Failed to create category.' });
  }
});

adminRouter.patch('/admin/categories/:id', requireAdmin, async (req, res) => {
  try {
    const { name, description, imageUrl, sortOrder, isActive } = req.body ?? {};
    const update: Record<string, unknown> = { updatedAt: new Date() };
    if (name !== undefined) update.name = String(name);
    if (description !== undefined) update.description = String(description);
    if (imageUrl !== undefined) update.imageUrl = String(imageUrl);
    if (sortOrder !== undefined) update.sortOrder = Number(sortOrder);
    if (isActive !== undefined) update.isActive = Boolean(isActive);
    const updated = await db
      .update(categories)
      .set(update)
      .where(eq(categories.id, Number(req.params.id)))
      .returning();
    res.json({ category: updated[0] });
  } catch (error) {
    console.error('Update category error:', error);
    res.status(500).json({ error: 'Failed to update category.' });
  }
});

adminRouter.delete('/admin/categories/:id', requireAdmin, async (req, res) => {
  try {
    await db.delete(categories).where(eq(categories.id, Number(req.params.id)));
    res.json({ success: true });
  } catch (error) {
    console.error('Delete category error:', error);
    res.status(500).json({ error: 'Failed to delete category.' });
  }
});

// ============================================
// INVENTORY MANAGEMENT (Staff / Admin)
// ============================================

adminRouter.get('/admin/inventory', requireStaffOrAdmin, async (_req, res) => {
  try {
    const [items, txs, branchList] = await Promise.all([
      db.select().from(inventory).orderBy(asc(inventory.quantityOnHand)),
      db.select().from(inventoryTransactions).orderBy(desc(inventoryTransactions.createdAt)).limit(40),
      db.select().from(branches),
    ]);
    const branchMap = new Map(branchList.map((b) => [b.id, b.name]));
    res.json({
      inventory: items.map((i) => ({ ...i, branchName: branchMap.get(i.branchId) ?? 'Branch' })),
      transactions: txs,
    });
  } catch (error) {
    console.error('Inventory load failed:', error);
    res.status(500).json({ error: 'Failed to load inventory.' });
  }
});

adminRouter.post('/admin/inventory/adjust', requireStaffOrAdmin, async (req: AuthRequest, res) => {
  try {
    const { inventoryId, changeAmount, reason } = req.body ?? {};
    const delta = Number(changeAmount);
    if (!Number.isInteger(delta) || delta === 0) {
      return res.status(400).json({ error: 'Non-zero integer stock adjustment required.' });
    }
    const rows = await db
      .select()
      .from(inventory)
      .where(eq(inventory.id, Number(inventoryId)))
      .limit(1);
    if (rows.length === 0) return res.status(404).json({ error: 'Inventory record not found.' });
    const inv = rows[0];
    const nextQty = Math.max(0, inv.quantityOnHand + delta);

    await db.transaction(async (tx) => {
      await tx
        .update(inventory)
        .set({ quantityOnHand: nextQty, updatedAt: new Date() })
        .where(eq(inventory.id, inv.id));

      await tx.insert(inventoryTransactions).values({
        inventoryId: inv.id,
        changeAmount: delta,
        previousQuantity: inv.quantityOnHand,
        newQuantity: nextQty,
        reason: String(reason || (delta > 0 ? 'Manual Restock' : 'Manual Adjustment')),
        performedByProfileId: req.userProfile!.id,
      });

      if (inv.productId) {
        await tx
          .update(products)
          .set({ isAvailable: nextQty > 0, updatedAt: new Date() })
          .where(eq(products.id, inv.productId));
      }
    });

    res.json({ success: true, newQuantity: nextQty });
  } catch (error) {
    console.error('Inventory adjust failed:', error);
    res.status(500).json({ error: 'Failed to adjust inventory.' });
  }
});

// ============================================
// BRANCHES, COUPONS, CUSTOMERS, REVIEWS, STAFF, SETTINGS
// ============================================

adminRouter.get('/admin/branches', requireStaffOrAdmin, async (_req, res) => {
  try {
    const list = await db.select().from(branches).orderBy(asc(branches.id));
    res.json({ branches: list });
  } catch (error) {
    console.error('Admin branches failed:', error);
    res.status(500).json({ error: 'Failed to fetch branches.' });
  }
});

adminRouter.post('/admin/branches', requireAdmin, async (req, res) => {
  try {
    const {
      name,
      address,
      city,
      phone,
      operatingHours,
      supportsPickup = true,
      supportsDelivery = true,
      deliveryFeeCents = 299,
      minOrderCents = 1000,
    } = req.body ?? {};
    if (!name || !address || !city || !phone) {
      return res.status(400).json({ error: 'Branch name, address, city, and phone are required.' });
    }
    const slug = `${String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now().toString().slice(-3)}`;
    const inserted = await db
      .insert(branches)
      .values({
        name: String(name),
        slug,
        address: String(address),
        city: String(city),
        phone: String(phone),
        operatingHours: String(operatingHours || '10:00 AM – 10:00 PM'),
        supportsPickup: Boolean(supportsPickup),
        supportsDelivery: Boolean(supportsDelivery),
        deliveryFeeCents: Number(deliveryFeeCents),
        minOrderCents: Number(minOrderCents),
        isActive: true,
      })
      .returning();
    res.status(201).json({ branch: inserted[0] });
  } catch (error) {
    console.error('Create branch error:', error);
    res.status(500).json({ error: 'Failed to create branch.' });
  }
});

adminRouter.patch('/admin/branches/:id', requireAdmin, async (req, res) => {
  try {
    const body = req.body ?? {};
    const update: Record<string, unknown> = { updatedAt: new Date() };
    for (const k of [
      'name',
      'address',
      'city',
      'phone',
      'operatingHours',
      'supportsPickup',
      'supportsDelivery',
      'deliveryFeeCents',
      'minOrderCents',
      'isActive',
    ]) {
      if (body[k] !== undefined) update[k] = body[k];
    }
    const updated = await db
      .update(branches)
      .set(update)
      .where(eq(branches.id, Number(req.params.id)))
      .returning();
    res.json({ branch: updated[0] });
  } catch (error) {
    console.error('Update branch error:', error);
    res.status(500).json({ error: 'Failed to update branch.' });
  }
});

adminRouter.get('/admin/coupons', requireStaffOrAdmin, async (_req, res) => {
  try {
    const list = await db.select().from(coupons).orderBy(desc(coupons.createdAt));
    res.json({ coupons: list });
  } catch (error) {
    console.error('Fetch coupons error:', error);
    res.status(500).json({ error: 'Failed to fetch promotions.' });
  }
});

adminRouter.post('/admin/coupons', requireAdmin, async (req, res) => {
  try {
    const { code, title, description, discountType, discountValue, minOrderCents = 0, usageLimit, expiresAt } =
      req.body ?? {};
    if (!code || !title || !discountType || !discountValue) {
      return res.status(400).json({ error: 'Code, title, discount type, and value are required.' });
    }
    const inserted = await db
      .insert(coupons)
      .values({
        code: String(code).trim().toUpperCase(),
        title: String(title).trim(),
        description: String(description || ''),
        discountType: String(discountType),
        discountValue: Number(discountValue),
        minOrderCents: Number(minOrderCents),
        usageLimit: usageLimit ? Number(usageLimit) : null,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
        isActive: true,
      })
      .returning();
    res.status(201).json({ coupon: inserted[0] });
  } catch (error) {
    console.error('Create coupon error:', error);
    res.status(500).json({ error: 'Failed to create promotion.' });
  }
});

adminRouter.patch('/admin/coupons/:id', requireAdmin, async (req, res) => {
  try {
    const { isActive } = req.body ?? {};
    const updated = await db
      .update(coupons)
      .set({ isActive: Boolean(isActive), updatedAt: new Date() })
      .where(eq(coupons.id, Number(req.params.id)))
      .returning();
    res.json({ coupon: updated[0] });
  } catch (error) {
    console.error('Update coupon error:', error);
    res.status(500).json({ error: 'Failed to update promotion.' });
  }
});

adminRouter.delete('/admin/coupons/:id', requireAdmin, async (req, res) => {
  try {
    await db.delete(coupons).where(eq(coupons.id, Number(req.params.id)));
    res.json({ success: true });
  } catch (error) {
    console.error('Delete coupon error:', error);
    res.status(500).json({ error: 'Failed to delete promotion.' });
  }
});

adminRouter.get('/admin/customers', requireStaffOrAdmin, async (_req, res) => {
  try {
    const custProfiles = await db
      .select()
      .from(profiles)
      .where(eq(profiles.roleName, 'customer'))
      .orderBy(desc(profiles.createdAt));

    const allOrders = await db.select().from(orders);
    const loyaltyRows = await db.select().from(loyaltyAccounts);
    const loyaltyMap = new Map(loyaltyRows.map((l) => [l.profileId, l.pointsBalance]));

    const enriched = custProfiles.map((c) => {
      const custOrders = allOrders.filter((o) => o.profileId === c.id && o.status !== 'cancelled');
      return {
        id: c.id,
        fullName: c.fullName,
        email: c.email,
        phone: c.phone,
        emailVerified: c.emailVerified,
        isActive: c.isActive,
        orderCount: custOrders.length,
        totalSpentCents: custOrders.reduce((s, o) => s + o.totalCents, 0),
        pointsBalance: loyaltyMap.get(c.id) ?? 0,
        createdAt: c.createdAt,
      };
    });
    res.json({ customers: enriched });
  } catch (error) {
    console.error('Admin customers error:', error);
    res.status(500).json({ error: 'Failed to fetch customer directory.' });
  }
});

adminRouter.get('/admin/reviews', requireStaffOrAdmin, async (_req, res) => {
  try {
    const rows = await db
      .select({
        id: reviews.id,
        rating: reviews.rating,
        title: reviews.title,
        comment: reviews.comment,
        status: reviews.status,
        isVerifiedPurchase: reviews.isVerifiedPurchase,
        createdAt: reviews.createdAt,
        authorName: profiles.fullName,
        authorEmail: profiles.email,
        productName: products.name,
        productId: products.id,
      })
      .from(reviews)
      .innerJoin(profiles, eq(reviews.profileId, profiles.id))
      .innerJoin(products, eq(reviews.productId, products.id))
      .orderBy(desc(reviews.createdAt));
    res.json({ reviews: rows });
  } catch (error) {
    console.error('Admin reviews error:', error);
    res.status(500).json({ error: 'Failed to load reviews.' });
  }
});

adminRouter.patch('/admin/reviews/:id', requireAdmin, async (req, res) => {
  try {
    const { status } = req.body ?? {};
    if (status !== 'published' && status !== 'hidden') {
      return res.status(400).json({ error: 'Invalid review moderation status.' });
    }
    const updated = await db
      .update(reviews)
      .set({ status, updatedAt: new Date() })
      .where(eq(reviews.id, Number(req.params.id)))
      .returning();

    if (updated[0]) {
      const prodId = updated[0].productId;
      const pubReviews = await db
        .select({ rating: reviews.rating })
        .from(reviews)
        .where(and(eq(reviews.productId, prodId), eq(reviews.status, 'published')));
      const avg =
        pubReviews.length > 0
          ? pubReviews.reduce((s, r) => s + r.rating, 0) / pubReviews.length
          : 0;
      await db
        .update(products)
        .set({ ratingAvg: avg.toFixed(2), reviewCount: pubReviews.length })
        .where(eq(products.id, prodId));
    }

    res.json({ review: updated[0] });
  } catch (error) {
    console.error('Moderate review error:', error);
    res.status(500).json({ error: 'Failed to moderate review.' });
  }
});

adminRouter.get('/admin/staff', requireAdmin, async (_req, res) => {
  try {
    const staffProfiles = await db
      .select()
      .from(profiles)
      .where(sql`${profiles.roleName} IN ('staff', 'admin')`)
      .orderBy(asc(profiles.id));
    const assignments = await db.select().from(staffAccounts);
    const assignMap = new Map(assignments.map((a) => [a.profileId, a]));

    res.json({
      staff: staffProfiles.map((p) => ({
        id: p.id,
        fullName: p.fullName,
        email: p.email,
        phone: p.phone,
        roleName: p.roleName,
        isActive: p.isActive,
        staffTitle: assignMap.get(p.id)?.staffTitle ?? (p.roleName === 'admin' ? 'Administrator' : 'Kitchen Staff'),
        branchId: assignMap.get(p.id)?.branchId ?? null,
      })),
    });
  } catch (error) {
    console.error('Fetch staff error:', error);
    res.status(500).json({ error: 'Failed to load staff accounts.' });
  }
});

adminRouter.post('/admin/staff', requireAdmin, async (req, res) => {
  try {
    const { fullName, email, phone, password, roleName = 'staff', branchId, staffTitle = 'Kitchen Staff' } =
      req.body ?? {};
    const cleanEmail = String(email || '').toLowerCase().trim();
    if (!fullName || !cleanEmail || !password || String(password).length < 8) {
      return res.status(400).json({ error: 'Name, email, and 8+ character password are required.' });
    }
    if (roleName !== 'staff' && roleName !== 'admin') {
      return res.status(400).json({ error: 'Role must be staff or admin.' });
    }
    const existing = await db.select().from(profiles).where(eq(profiles.email, cleanEmail)).limit(1);
    if (existing.length > 0) {
      return res.status(409).json({ error: 'An account with this email already exists.' });
    }
    const roleRows = await db.select().from(roles).where(eq(roles.name, roleName)).limit(1);

    const created = await db
      .insert(profiles)
      .values({
        uid: `staff-${crypto.randomUUID()}`,
        email: cleanEmail,
        fullName: String(fullName).trim(),
        phone: String(phone || '').trim(),
        passwordHash: hashPassword(String(password)),
        roleId: roleRows[0]?.id ?? null,
        roleName,
        emailVerified: true,
      })
      .returning();

    await db.insert(staffAccounts).values({
      profileId: created[0].id,
      branchId: branchId ? Number(branchId) : null,
      staffTitle: String(staffTitle),
      permissions: roleName === 'admin' ? ['*'] : ['orders:manage', 'kitchen:manage'],
    });

    res.status(201).json({
      staff: {
        id: created[0].id,
        fullName: created[0].fullName,
        email: created[0].email,
        roleName: created[0].roleName,
        staffTitle,
      },
    });
  } catch (error) {
    console.error('Create staff error:', error);
    res.status(500).json({ error: 'Failed to create staff account.' });
  }
});

adminRouter.patch('/admin/staff/:id', requireAdmin, async (req, res) => {
  try {
    const profileId = Number(req.params.id);
    const { isActive, roleName } = req.body ?? {};
    const update: Record<string, unknown> = { updatedAt: new Date() };
    if (isActive !== undefined) update.isActive = Boolean(isActive);
    if (roleName === 'staff' || roleName === 'admin') {
      update.roleName = roleName;
      const rRows = await db.select().from(roles).where(eq(roles.name, roleName)).limit(1);
      if (rRows[0]) update.roleId = rRows[0].id;
    }
    await db.update(profiles).set(update).where(eq(profiles.id, profileId));
    res.json({ success: true });
  } catch (error) {
    console.error('Update staff error:', error);
    res.status(500).json({ error: 'Failed to update staff member.' });
  }
});

adminRouter.get('/admin/settings', requireAdmin, async (_req, res) => {
  try {
    const rows = await db.select().from(storeSettings);
    const map: Record<string, unknown> = {};
    for (const r of rows) map[r.key] = r.value;
    res.json({ settings: map });
  } catch (error) {
    console.error('Settings fetch error:', error);
    res.status(500).json({ error: 'Failed to load settings.' });
  }
});

adminRouter.patch('/admin/settings', requireAdmin, async (req, res) => {
  try {
    const { key, value } = req.body ?? {};
    if (!key || typeof value !== 'object' || value === null) {
      return res.status(400).json({ error: 'Valid setting key and object value required.' });
    }
    await db
      .insert(storeSettings)
      .values({ key: String(key), value: value as Record<string, unknown>, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: storeSettings.key,
        set: { value: value as Record<string, unknown>, updatedAt: new Date() },
      });
    res.json({ success: true });
  } catch (error) {
    console.error('Settings update error:', error);
    res.status(500).json({ error: 'Failed to update settings.' });
  }
});
