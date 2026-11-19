import crypto from 'node:crypto';
import { Router } from 'express';
import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '../db/index.ts';
import {
  addresses,
  branches,
  cartItems,
  carts,
  coupons,
  couponUsage,
  favoriteProducts,
  inventory,
  inventoryTransactions,
  loyaltyAccounts,
  loyaltyTransactions,
  notifications,
  orderItems,
  orders,
  orderStatusHistory,
  payments,
  products,
  profiles,
  reviews,
  storeSettings,
} from '../db/schema.ts';
import { AuthRequest, hashPassword, requireAuth, toSafeProfile, verifyPassword } from './auth.ts';
import { evaluateCoupon, getOrCreateCart } from './routes-public.ts';
import { realtimeHub } from './realtime.ts';

export const customerRouter = Router();

// ============================================
// CHECKOUT & PAYMENTS (Authenticated Customers)
// ============================================

customerRouter.post('/checkout', requireAuth, async (req: AuthRequest, res) => {
  try {
    const profile = req.userProfile!;
    const {
      branchId,
      orderType,
      customerName,
      customerPhone,
      customerEmail,
      deliveryAddress,
      deliveryInstructions,
      scheduledPickupAt,
      paymentMethod,
      couponCode,
      rewardId,
    } = req.body ?? {};

    if (orderType !== 'pickup' && orderType !== 'delivery') {
      return res.status(400).json({ error: 'Order type must be pickup or delivery.' });
    }
    if (!customerName || !customerPhone || !customerEmail) {
      return res.status(400).json({ error: 'Customer name, phone, and email are required.' });
    }

    const branchRows = await db
      .select()
      .from(branches)
      .where(and(eq(branches.id, Number(branchId)), eq(branches.isActive, true)))
      .limit(1);
    if (branchRows.length === 0) {
      return res.status(400).json({ error: 'Please select an active restaurant branch.' });
    }
    const branch = branchRows[0];

    if (orderType === 'pickup' && !branch.supportsPickup) {
      return res.status(400).json({ error: `${branch.name} does not support pickup.` });
    }
    if (orderType === 'delivery' && !branch.supportsDelivery) {
      return res.status(400).json({ error: `${branch.name} does not offer delivery.` });
    }
    if (orderType === 'delivery' && (!deliveryAddress || String(deliveryAddress).trim().length < 8)) {
      return res.status(400).json({ error: 'Please provide a complete delivery address.' });
    }

    // Validate payment configuration
    const paySettingRows = await db
      .select()
      .from(storeSettings)
      .where(eq(storeSettings.key, 'payment_config'))
      .limit(1);
    const payConfig = (paySettingRows[0]?.value ?? {
      cash_on_pickup: true,
      cash_on_delivery: true,
      gcash: true,
      card: true,
    }) as Record<string, boolean>;

    if (!payConfig[paymentMethod]) {
      return res.status(400).json({ error: 'Selected payment method is currently unavailable.' });
    }
    if (orderType === 'pickup' && paymentMethod === 'cash_on_delivery') {
      return res.status(400).json({ error: 'Cash on Delivery is only valid for delivery orders.' });
    }
    if (orderType === 'delivery' && paymentMethod === 'cash_on_pickup') {
      return res.status(400).json({ error: 'Cash on Pickup is only valid for pickup orders.' });
    }

    // Load cart
    const sessionHeader = String(req.headers['x-cart-session'] || '');
    const cartRow = await getOrCreateCart(sessionHeader, profile.id);
    const items = await db.select().from(cartItems).where(eq(cartItems.cartId, cartRow.id));
    if (items.length === 0) {
      return res.status(400).json({ error: 'Your shopping cart is empty.' });
    }

    // Recalculate server-side product pricing
    let subtotalCents = 0;
    const verifiedItems: Array<{
      item: typeof items[0];
      verifiedUnitPriceCents: number;
      lineTotalCents: number;
    }> = [];

    for (const item of items) {
      if (item.itemType === 'product' && item.productId) {
        const prodRows = await db.select().from(products).where(eq(products.id, item.productId)).limit(1);
        if (prodRows.length === 0 || !prodRows[0].isAvailable) {
          return res.status(400).json({ error: `${item.displayName} is no longer available.` });
        }
        const extras = (item.selectedCustomizations ?? []).reduce(
          (s, c) => s + Number(c.priceDeltaCents || 0),
          0
        );
        const unit = prodRows[0].priceCents + extras;
        subtotalCents += unit * item.quantity;
        verifiedItems.push({
          item,
          verifiedUnitPriceCents: unit,
          lineTotalCents: unit * item.quantity,
        });
      } else {
        // Combo item validated at add time; verify base components still active
        const unit = item.unitPriceCents;
        subtotalCents += unit * item.quantity;
        verifiedItems.push({
          item,
          verifiedUnitPriceCents: unit,
          lineTotalCents: unit * item.quantity,
        });
      }
    }

    if (subtotalCents < branch.minOrderCents) {
      return res.status(400).json({
        error: `Minimum order for ${branch.name} is $${(branch.minOrderCents / 100).toFixed(2)}.`,
      });
    }

    const codeToCheck = couponCode || cartRow.couponCode;
    const couponEval = await evaluateCoupon(codeToCheck, subtotalCents);
    let discountCents = couponEval.valid ? couponEval.discountCents : 0;

    // Optional loyalty reward redemption at checkout
    let pointsRedeemed = 0;
    if (rewardId) {
      const loyaltyRuleRow = await db
        .select()
        .from(storeSettings)
        .where(eq(storeSettings.key, 'loyalty_rules'))
        .limit(1);
      const catalog = ((loyaltyRuleRow[0]?.value as Record<string, unknown>)?.rewardsCatalog ?? []) as Array<{
        id: string;
        title: string;
        pointsCost: number;
        discountCents: number;
      }>;
      const chosenReward = catalog.find((r) => r.id === rewardId);
      if (chosenReward) {
        const laRows = await db
          .select()
          .from(loyaltyAccounts)
          .where(eq(loyaltyAccounts.profileId, profile.id))
          .limit(1);
        const balance = laRows[0]?.pointsBalance ?? 0;
        if (balance < chosenReward.pointsCost) {
          return res.status(400).json({ error: 'Insufficient JUST Rewards points for selected reward.' });
        }
        pointsRedeemed = chosenReward.pointsCost;
        discountCents = Math.min(subtotalCents, discountCents + chosenReward.discountCents);
      }
    }

    const deliveryFeeCents = orderType === 'delivery' ? branch.deliveryFeeCents : 0;
    const totalCents = Math.max(0, subtotalCents - discountCents + deliveryFeeCents);

    const orderNumber = `JB-${new Date().getFullYear().toString().slice(-2)}${String(
      Math.floor(100000 + Math.random() * 900000)
    )}`;

    const isOnlineGateway = paymentMethod === 'gcash' || paymentMethod === 'card';
    const initialPaymentStatus = isOnlineGateway ? 'pending_verification' : 'unpaid';

    const createdOrder = await db.transaction(async (tx) => {
      const [insertedOrder] = await tx
        .insert(orders)
        .values({
          orderNumber,
          profileId: profile.id,
          branchId: branch.id,
          orderType,
          status: 'pending',
          customerName: String(customerName).trim(),
          customerEmail: String(customerEmail).trim(),
          customerPhone: String(customerPhone).trim(),
          deliveryAddress: orderType === 'delivery' ? String(deliveryAddress).trim() : null,
          deliveryInstructions: deliveryInstructions ? String(deliveryInstructions).trim() : null,
          scheduledPickupAt: scheduledPickupAt ? new Date(scheduledPickupAt) : null,
          subtotalCents,
          discountCents,
          deliveryFeeCents,
          totalCents,
          couponCode: couponEval.valid ? couponEval.coupon!.code : null,
          paymentMethod,
          paymentStatus: initialPaymentStatus,
          pointsEarned: 0,
          pointsRedeemed,
        })
        .returning();

      for (const vi of verifiedItems) {
        await tx.insert(orderItems).values({
          orderId: insertedOrder.id,
          productId: vi.item.productId,
          itemType: vi.item.itemType,
          productNameSnapshot: vi.item.displayName,
          productImageSnapshot: vi.item.imageUrl,
          unitPriceCentsSnapshot: vi.verifiedUnitPriceCents,
          quantity: vi.item.quantity,
          customizationsSnapshot: vi.item.selectedCustomizations ?? [],
          comboSnapshot: vi.item.comboPayload ?? null,
          lineTotalCents: vi.lineTotalCents,
          specialInstructions: vi.item.specialInstructions || null,
        });

        // Deduct product inventory if tracked for this branch
        if (vi.item.productId) {
          const invRows = await tx
            .select()
            .from(inventory)
            .where(
              and(eq(inventory.branchId, branch.id), eq(inventory.productId, vi.item.productId))
            )
            .limit(1);
          if (invRows.length > 0) {
            const inv = invRows[0];
            const nextQty = Math.max(0, inv.quantityOnHand - vi.item.quantity);
            await tx
              .update(inventory)
              .set({ quantityOnHand: nextQty, updatedAt: new Date() })
              .where(eq(inventory.id, inv.id));
            await tx.insert(inventoryTransactions).values({
              inventoryId: inv.id,
              changeAmount: -vi.item.quantity,
              previousQuantity: inv.quantityOnHand,
              newQuantity: nextQty,
              reason: `Order ${orderNumber}`,
              referenceOrderId: insertedOrder.id,
              performedByProfileId: profile.id,
            });
            if (nextQty === 0) {
              await tx
                .update(products)
                .set({ isAvailable: false, updatedAt: new Date() })
                .where(eq(products.id, vi.item.productId));
            }
          }
        }
      }

      await tx.insert(payments).values({
        orderId: insertedOrder.id,
        method: paymentMethod,
        status: 'pending',
        amountCents: totalCents,
      });

      await tx.insert(orderStatusHistory).values({
        orderId: insertedOrder.id,
        previousStatus: null,
        newStatus: 'pending',
        changedByProfileId: profile.id,
        note: isOnlineGateway
          ? 'Order placed; awaiting online payment confirmation.'
          : 'Order placed; payment due upon pickup/delivery.',
      });

      if (couponEval.valid && couponEval.coupon) {
        await tx.insert(couponUsage).values({
          couponId: couponEval.coupon.id,
          orderId: insertedOrder.id,
          profileId: profile.id,
          discountAppliedCents: couponEval.discountCents,
        });
        await tx
          .update(coupons)
          .set({ usedCount: sql`${coupons.usedCount} + 1` })
          .where(eq(coupons.id, couponEval.coupon.id));
      }

      if (pointsRedeemed > 0) {
        const laRows = await tx
          .select()
          .from(loyaltyAccounts)
          .where(eq(loyaltyAccounts.profileId, profile.id))
          .limit(1);
        if (laRows[0]) {
          await tx
            .update(loyaltyAccounts)
            .set({
              pointsBalance: Math.max(0, laRows[0].pointsBalance - pointsRedeemed),
              updatedAt: new Date(),
            })
            .where(eq(loyaltyAccounts.id, laRows[0].id));
          await tx.insert(loyaltyTransactions).values({
            loyaltyAccountId: laRows[0].id,
            orderId: insertedOrder.id,
            pointsDelta: -pointsRedeemed,
            transactionType: 'redeem',
            description: `Redeemed at checkout on ${orderNumber}`,
          });
        }
      }

      await tx.insert(notifications).values({
        profileId: profile.id,
        orderId: insertedOrder.id,
        type: 'order_update',
        title: `Order ${orderNumber} Received`,
        message: isOnlineGateway
          ? 'Complete your payment verification step to send your order straight to the grill.'
          : `We received your ${orderType} order at ${branch.name}.`,
      });

      // Clear cart
      await tx.delete(cartItems).where(eq(cartItems.cartId, cartRow.id));
      await tx.update(carts).set({ couponCode: null, updatedAt: new Date() }).where(eq(carts.id, cartRow.id));

      return insertedOrder;
    });

    realtimeHub.broadcastToStaff('order:created', {
      orderId: createdOrder.id,
      orderNumber: createdOrder.orderNumber,
      status: createdOrder.status,
      branchId: createdOrder.branchId,
    });

    res.status(201).json({
      order: createdOrder,
      requiresPaymentVerification: isOnlineGateway,
    });
  } catch (error) {
    console.error('Checkout error:', error);
    res.status(500).json({ error: 'Unable to complete checkout. Please try again.' });
  }
});

// Explicit Payment Verification Gateway Simulation / Reference Verification
customerRouter.post('/payments/:orderId/verify', requireAuth, async (req: AuthRequest, res) => {
  try {
    const orderId = Number(req.params.orderId);
    const { referenceCode } = req.body ?? {};
    if (!referenceCode || String(referenceCode).trim().length < 6) {
      return res
        .status(400)
        .json({ error: 'Please enter a valid 6+ character payment reference number from your gateway.' });
    }

    const orderRows = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
    if (orderRows.length === 0) return res.status(404).json({ error: 'Order not found.' });
    const order = orderRows[0];

    if (
      order.profileId !== req.userProfile!.id &&
      req.userProfile!.roleName !== 'admin' &&
      req.userProfile!.roleName !== 'staff'
    ) {
      return res.status(403).json({ error: 'Unauthorized to verify payment for this order.' });
    }

    await db.transaction(async (tx) => {
      await tx
        .update(payments)
        .set({
          status: 'verified',
          providerReference: String(referenceCode).trim().toUpperCase(),
          verifiedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(payments.orderId, order.id));

      await tx
        .update(orders)
        .set({ paymentStatus: 'paid', updatedAt: new Date() })
        .where(eq(orders.id, order.id));

      await tx.insert(notifications).values({
        profileId: order.profileId,
        orderId: order.id,
        type: 'order_update',
        title: `Payment Verified · ${order.orderNumber}`,
        message: `Reference ${String(referenceCode).trim().toUpperCase()} verified. Our kitchen is reviewing your order.`,
      });
    });

    realtimeHub.broadcastToStaff('order:updated', { orderId: order.id, paymentStatus: 'paid' });
    realtimeHub.sendToProfile(order.profileId, 'order:updated', {
      orderNumber: order.orderNumber,
      paymentStatus: 'paid',
    });

    res.json({ success: true, paymentStatus: 'paid', orderNumber: order.orderNumber });
  } catch (error) {
    console.error('Payment verification error:', error);
    res.status(500).json({ error: 'Payment verification failed.' });
  }
});

// ============================================
// CUSTOMER ORDERS & TRACKING
// ============================================

customerRouter.get('/orders/my', requireAuth, async (req: AuthRequest, res) => {
  try {
    const myOrders = await db
      .select()
      .from(orders)
      .where(eq(orders.profileId, req.userProfile!.id))
      .orderBy(desc(orders.createdAt));

    const branchList = await db.select().from(branches);
    const branchMap = new Map(branchList.map((b) => [b.id, b]));

    const enriched = await Promise.all(
      myOrders.map(async (ord) => {
        const items = await db.select().from(orderItems).where(eq(orderItems.orderId, ord.id));
        const history = await db
          .select()
          .from(orderStatusHistory)
          .where(eq(orderStatusHistory.orderId, ord.id))
          .orderBy(desc(orderStatusHistory.createdAt));
        return {
          ...ord,
          branch: branchMap.get(ord.branchId) ?? null,
          items,
          history,
        };
      })
    );

    res.json({ orders: enriched });
  } catch (error) {
    console.error('My orders fetch failed:', error);
    res.status(500).json({ error: 'Unable to load your orders.' });
  }
});

customerRouter.get('/orders/:orderNumber', requireAuth, async (req: AuthRequest, res) => {
  try {
    const orderNumber = String(req.params.orderNumber || '').trim().toUpperCase();
    const rows = await db.select().from(orders).where(eq(orders.orderNumber, orderNumber)).limit(1);
    if (rows.length === 0) return res.status(404).json({ error: 'Order not found.' });
    const ord = rows[0];

    if (
      ord.profileId !== req.userProfile!.id &&
      req.userProfile!.roleName !== 'staff' &&
      req.userProfile!.roleName !== 'admin'
    ) {
      return res.status(403).json({ error: 'You do not have access to this order.' });
    }

    const [items, history, branchRows, paymentRows] = await Promise.all([
      db.select().from(orderItems).where(eq(orderItems.orderId, ord.id)),
      db
        .select()
        .from(orderStatusHistory)
        .where(eq(orderStatusHistory.orderId, ord.id))
        .orderBy(desc(orderStatusHistory.createdAt)),
      db.select().from(branches).where(eq(branches.id, ord.branchId)).limit(1),
      db.select().from(payments).where(eq(payments.orderId, ord.id)).limit(1),
    ]);

    res.json({
      order: {
        ...ord,
        branch: branchRows[0] ?? null,
        items,
        history,
        payment: paymentRows[0] ?? null,
      },
    });
  } catch (error) {
    console.error('Order tracking fetch error:', error);
    res.status(500).json({ error: 'Unable to load order tracking details.' });
  }
});

customerRouter.post('/orders/:id/reorder', requireAuth, async (req: AuthRequest, res) => {
  try {
    const orderId = Number(req.params.id);
    const ordRows = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
    if (ordRows.length === 0 || ordRows[0].profileId !== req.userProfile!.id) {
      return res.status(404).json({ error: 'Order not found.' });
    }
    const items = await db.select().from(orderItems).where(eq(orderItems.orderId, orderId));
    const token = String(req.headers['x-cart-session'] || crypto.randomUUID());
    const cartRow = await getOrCreateCart(token, req.userProfile!.id);

    let addedCount = 0;
    for (const oi of items) {
      if (oi.productId) {
        const prodRows = await db.select().from(products).where(eq(products.id, oi.productId)).limit(1);
        if (prodRows.length > 0 && prodRows[0].isAvailable) {
          await db.insert(cartItems).values({
            cartId: cartRow.id,
            productId: oi.productId,
            itemType: oi.itemType,
            displayName: oi.productNameSnapshot,
            imageUrl: oi.productImageSnapshot,
            selectedCustomizations: oi.customizationsSnapshot ?? [],
            comboPayload: oi.comboSnapshot ?? null,
            quantity: oi.quantity,
            unitPriceCents: oi.unitPriceCentsSnapshot,
            specialInstructions: oi.specialInstructions ?? '',
          });
          addedCount++;
        }
      }
    }

    res.json({ addedCount, message: `${addedCount} item(s) added back to your cart.` });
  } catch (error) {
    console.error('Reorder failed:', error);
    res.status(500).json({ error: 'Failed to reorder items.' });
  }
});

// ============================================
// ACCOUNT: PROFILE, ADDRESSES, FAVORITES, LOYALTY, REVIEWS, NOTIFICATIONS
// ============================================

customerRouter.patch('/account/profile', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { fullName, phone } = req.body ?? {};
    if (!fullName || String(fullName).trim().length < 2) {
      return res.status(400).json({ error: 'Full name is required.' });
    }
    const updated = await db
      .update(profiles)
      .set({
        fullName: String(fullName).trim(),
        phone: String(phone || '').trim(),
        updatedAt: new Date(),
      })
      .where(eq(profiles.id, req.userProfile!.id))
      .returning();
    res.json({ user: toSafeProfile(updated[0]) });
  } catch (error) {
    console.error('Profile update failed:', error);
    res.status(500).json({ error: 'Unable to update profile.' });
  }
});

customerRouter.post('/account/change-password', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { currentPassword, newPassword, confirmPassword } = req.body ?? {};
    if (!newPassword || String(newPassword).length < 8) {
      return res.status(400).json({ error: 'New password must be at least 8 characters.' });
    }
    if (newPassword !== confirmPassword) {
      return res.status(400).json({ error: 'Passwords do not match.' });
    }
    const rows = await db
      .select()
      .from(profiles)
      .where(eq(profiles.id, req.userProfile!.id))
      .limit(1);
    const user = rows[0];
    if (user.passwordHash) {
      if (!currentPassword || !verifyPassword(String(currentPassword), user.passwordHash)) {
        return res.status(400).json({ error: 'Current password is incorrect.' });
      }
    }
    await db
      .update(profiles)
      .set({ passwordHash: hashPassword(String(newPassword)), updatedAt: new Date() })
      .where(eq(profiles.id, user.id));
    res.json({ message: 'Password changed successfully.' });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ error: 'Failed to update password.' });
  }
});

customerRouter.get('/account/addresses', requireAuth, async (req: AuthRequest, res) => {
  try {
    const list = await db
      .select()
      .from(addresses)
      .where(eq(addresses.profileId, req.userProfile!.id))
      .orderBy(desc(addresses.isDefault), desc(addresses.createdAt));
    res.json({ addresses: list });
  } catch (error) {
    console.error('Addresses load error:', error);
    res.status(500).json({ error: 'Failed to fetch saved addresses.' });
  }
});

customerRouter.post('/account/addresses', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { label, recipientName, phone, streetAddress, district, city, postalCode, deliveryNotes, isDefault } =
      req.body ?? {};
    if (!recipientName || !phone || !streetAddress || !city) {
      return res.status(400).json({ error: 'Recipient, phone, street address, and city are required.' });
    }
    if (isDefault) {
      await db
        .update(addresses)
        .set({ isDefault: false })
        .where(eq(addresses.profileId, req.userProfile!.id));
    }
    const inserted = await db
      .insert(addresses)
      .values({
        profileId: req.userProfile!.id,
        label: String(label || 'Home'),
        recipientName: String(recipientName).trim(),
        phone: String(phone).trim(),
        streetAddress: String(streetAddress).trim(),
        district: String(district || '').trim(),
        city: String(city).trim(),
        postalCode: String(postalCode || '').trim(),
        deliveryNotes: String(deliveryNotes || '').trim(),
        isDefault: Boolean(isDefault),
      })
      .returning();
    res.status(201).json({ address: inserted[0] });
  } catch (error) {
    console.error('Create address error:', error);
    res.status(500).json({ error: 'Failed to save address.' });
  }
});

customerRouter.delete('/account/addresses/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    await db
      .delete(addresses)
      .where(and(eq(addresses.id, Number(req.params.id)), eq(addresses.profileId, req.userProfile!.id)));
    res.json({ success: true });
  } catch (error) {
    console.error('Delete address error:', error);
    res.status(500).json({ error: 'Failed to delete address.' });
  }
});

customerRouter.get('/account/favorites', requireAuth, async (req: AuthRequest, res) => {
  try {
    const rows = await db
      .select({
        favoriteId: favoriteProducts.id,
        product: products,
      })
      .from(favoriteProducts)
      .innerJoin(products, eq(favoriteProducts.productId, products.id))
      .where(eq(favoriteProducts.profileId, req.userProfile!.id));
    res.json({ favorites: rows.map((r) => r.product) });
  } catch (error) {
    console.error('Favorites load error:', error);
    res.status(500).json({ error: 'Failed to load favorites.' });
  }
});

customerRouter.post('/account/favorites/:productId', requireAuth, async (req: AuthRequest, res) => {
  try {
    const productId = Number(req.params.productId);
    const existing = await db
      .select()
      .from(favoriteProducts)
      .where(and(eq(favoriteProducts.profileId, req.userProfile!.id), eq(favoriteProducts.productId, productId)))
      .limit(1);
    if (existing.length > 0) {
      await db.delete(favoriteProducts).where(eq(favoriteProducts.id, existing[0].id));
      return res.json({ favorited: false });
    }
    await db.insert(favoriteProducts).values({ profileId: req.userProfile!.id, productId });
    res.json({ favorited: true });
  } catch (error) {
    console.error('Toggle favorite error:', error);
    res.status(500).json({ error: 'Failed to update favorite.' });
  }
});

customerRouter.get('/account/loyalty', requireAuth, async (req: AuthRequest, res) => {
  try {
    let accRows = await db
      .select()
      .from(loyaltyAccounts)
      .where(eq(loyaltyAccounts.profileId, req.userProfile!.id))
      .limit(1);
    if (accRows.length === 0) {
      accRows = await db
        .insert(loyaltyAccounts)
        .values({ profileId: req.userProfile!.id, pointsBalance: 0, lifetimePoints: 0 })
        .returning();
    }
    const [txs, ruleSetting] = await Promise.all([
      db
        .select()
        .from(loyaltyTransactions)
        .where(eq(loyaltyTransactions.loyaltyAccountId, accRows[0].id))
        .orderBy(desc(loyaltyTransactions.createdAt))
        .limit(30),
      db.select().from(storeSettings).where(eq(storeSettings.key, 'loyalty_rules')).limit(1),
    ]);
    res.json({
      account: accRows[0],
      transactions: txs,
      rules: ruleSetting[0]?.value ?? {},
    });
  } catch (error) {
    console.error('Loyalty load error:', error);
    res.status(500).json({ error: 'Failed to fetch JUST Rewards.' });
  }
});

customerRouter.post('/account/loyalty/redeem', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { rewardId } = req.body ?? {};
    const ruleSetting = await db
      .select()
      .from(storeSettings)
      .where(eq(storeSettings.key, 'loyalty_rules'))
      .limit(1);
    const catalog = ((ruleSetting[0]?.value as Record<string, unknown>)?.rewardsCatalog ?? []) as Array<{
      id: string;
      title: string;
      pointsCost: number;
      discountCents: number;
    }>;
    const reward = catalog.find((r) => r.id === rewardId);
    if (!reward) return res.status(404).json({ error: 'Selected reward not found.' });

    const accRows = await db
      .select()
      .from(loyaltyAccounts)
      .where(eq(loyaltyAccounts.profileId, req.userProfile!.id))
      .limit(1);
    if (accRows.length === 0 || accRows[0].pointsBalance < reward.pointsCost) {
      return res.status(400).json({ error: 'Not enough JUST Rewards points.' });
    }

    const voucherCode = `REW-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

    await db.transaction(async (tx) => {
      await tx
        .update(loyaltyAccounts)
        .set({
          pointsBalance: accRows[0].pointsBalance - reward.pointsCost,
          updatedAt: new Date(),
        })
        .where(eq(loyaltyAccounts.id, accRows[0].id));

      await tx.insert(loyaltyTransactions).values({
        loyaltyAccountId: accRows[0].id,
        pointsDelta: -reward.pointsCost,
        transactionType: 'redeem',
        description: `Redeemed "${reward.title}" -> Code ${voucherCode}`,
      });

      await tx.insert(coupons).values({
        code: voucherCode,
        title: reward.title,
        description: `JUST Rewards Member Voucher (${reward.pointsCost} pts)`,
        discountType: 'fixed',
        discountValue: reward.discountCents,
        minOrderCents: 0,
        usageLimit: 1,
        isActive: true,
      });

      await tx.insert(notifications).values({
        profileId: req.userProfile!.id,
        type: 'loyalty',
        title: 'Reward Redeemed!',
        message: `Use promo code ${voucherCode} at checkout for ${reward.title}.`,
      });
    });

    res.json({
      voucherCode,
      reward,
      message: `Redeemed! Your personal promo code is ${voucherCode}.`,
    });
  } catch (error) {
    console.error('Loyalty redeem error:', error);
    res.status(500).json({ error: 'Failed to redeem reward.' });
  }
});

customerRouter.get('/account/notifications', requireAuth, async (req: AuthRequest, res) => {
  try {
    const list = await db
      .select()
      .from(notifications)
      .where(eq(notifications.profileId, req.userProfile!.id))
      .orderBy(desc(notifications.createdAt))
      .limit(40);
    res.json({ notifications: list });
  } catch (error) {
    console.error('Notifications load error:', error);
    res.status(500).json({ error: 'Failed to load notifications.' });
  }
});

customerRouter.patch('/account/notifications/:id/read', requireAuth, async (req: AuthRequest, res) => {
  try {
    await db
      .update(notifications)
      .set({ isRead: true })
      .where(and(eq(notifications.id, Number(req.params.id)), eq(notifications.profileId, req.userProfile!.id)));
    res.json({ success: true });
  } catch (error) {
    console.error('Notification mark read error:', error);
    res.status(500).json({ error: 'Failed to mark notification read.' });
  }
});

customerRouter.post('/account/notifications/read-all', requireAuth, async (req: AuthRequest, res) => {
  try {
    await db
      .update(notifications)
      .set({ isRead: true })
      .where(eq(notifications.profileId, req.userProfile!.id));
    res.json({ success: true });
  } catch (error) {
    console.error('Notifications read-all error:', error);
    res.status(500).json({ error: 'Failed to mark notifications read.' });
  }
});

customerRouter.post('/reviews', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { productId, rating, title, comment } = req.body ?? {};
    const prodId = Number(productId);
    const numRating = Number(rating);
    if (!Number.isInteger(prodId) || !Number.isInteger(numRating) || numRating < 1 || numRating > 5) {
      return res.status(400).json({ error: 'Rating must be between 1 and 5 stars.' });
    }
    if (!comment || String(comment).trim().length < 6) {
      return res.status(400).json({ error: 'Please write at least a brief review comment.' });
    }

    // Verify customer has a completed order containing this product
    const completedOrderItems = await db
      .select({ orderId: orders.id })
      .from(orderItems)
      .innerJoin(orders, eq(orderItems.orderId, orders.id))
      .where(
        and(
          eq(orders.profileId, req.userProfile!.id),
          eq(orders.status, 'completed'),
          eq(orderItems.productId, prodId)
        )
      )
      .limit(1);

    if (completedOrderItems.length === 0) {
      return res.status(403).json({
        error: 'Only customers with a completed order for this item can submit a verified review.',
      });
    }

    const inserted = await db
      .insert(reviews)
      .values({
        productId: prodId,
        profileId: req.userProfile!.id,
        orderId: completedOrderItems[0].orderId,
        rating: numRating,
        title: String(title || '').trim(),
        comment: String(comment).trim(),
        isVerifiedPurchase: true,
        status: 'published',
      })
      .returning();

    // Recompute average rating on product
    const allProdReviews = await db
      .select({ rating: reviews.rating })
      .from(reviews)
      .where(and(eq(reviews.productId, prodId), eq(reviews.status, 'published')));
    const count = allProdReviews.length;
    const avg = count > 0 ? allProdReviews.reduce((s, r) => s + r.rating, 0) / count : 0;
    await db
      .update(products)
      .set({ ratingAvg: avg.toFixed(2), reviewCount: count, updatedAt: new Date() })
      .where(eq(products.id, prodId));

    res.status(201).json({ review: inserted[0] });
  } catch (error) {
    console.error('Submit review error:', error);
    res.status(500).json({ error: 'Failed to submit review.' });
  }
});
