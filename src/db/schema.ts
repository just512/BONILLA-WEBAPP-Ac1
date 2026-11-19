import { relations } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

export const roles = pgTable('roles', {
  id: serial('id').primaryKey(),
  name: text('name').notNull().unique(),
  description: text('description').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const profiles = pgTable(
  'profiles',
  {
    id: serial('id').primaryKey(),
    uid: text('uid').notNull().unique(),
    email: text('email').notNull().unique(),
    fullName: text('full_name').notNull(),
    phone: text('phone').default('').notNull(),
    passwordHash: text('password_hash'),
    roleId: integer('role_id').references(() => roles.id),
    roleName: text('role_name').default('customer').notNull(),
    emailVerified: boolean('email_verified').default(false).notNull(),
    verificationToken: text('verification_token'),
    resetToken: text('reset_token'),
    resetTokenExpiresAt: timestamp('reset_token_expires_at'),
    avatarUrl: text('avatar_url'),
    isActive: boolean('is_active').default(true).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('profiles_role_name_idx').on(table.roleName),
    index('profiles_email_idx').on(table.email),
  ]
);

export const branches = pgTable('branches', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  address: text('address').notNull(),
  city: text('city').notNull(),
  phone: text('phone').notNull(),
  operatingHours: text('operating_hours').notNull(),
  supportsPickup: boolean('supports_pickup').default(true).notNull(),
  supportsDelivery: boolean('supports_delivery').default(true).notNull(),
  deliveryFeeCents: integer('delivery_fee_cents').default(399).notNull(),
  minOrderCents: integer('min_order_cents').default(1000).notNull(),
  estimatedPrepMinutes: integer('estimated_prep_minutes').default(15).notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const staffAccounts = pgTable('staff_accounts', {
  id: serial('id').primaryKey(),
  profileId: integer('profile_id')
    .references(() => profiles.id, { onDelete: 'cascade' })
    .notNull()
    .unique(),
  branchId: integer('branch_id').references(() => branches.id, { onDelete: 'set null' }),
  staffTitle: text('staff_title').default('Crew Member').notNull(),
  permissions: jsonb('permissions').$type<string[]>().default([]).notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const categories = pgTable('categories', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  description: text('description').default('').notNull(),
  imageUrl: text('image_url'),
  sortOrder: integer('sort_order').default(0).notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const products = pgTable(
  'products',
  {
    id: serial('id').primaryKey(),
    categoryId: integer('category_id')
      .references(() => categories.id, { onDelete: 'set null' }),
    name: text('name').notNull(),
    slug: text('slug').notNull().unique(),
    description: text('description').notNull(),
    ingredients: text('ingredients').default('').notNull(),
    priceCents: integer('price_cents').notNull(),
    imageUrl: text('image_url').notNull(),
    calories: integer('calories').default(650).notNull(),
    prepTimeMinutes: integer('prep_time_minutes').default(10).notNull(),
    isFeatured: boolean('is_featured').default(false).notNull(),
    isBestSeller: boolean('is_best_seller').default(false).notNull(),
    isNewArrival: boolean('is_new_arrival').default(false).notNull(),
    isSignature: boolean('is_signature').default(false).notNull(),
    isAvailable: boolean('is_available').default(true).notNull(),
    isComboEligible: boolean('is_combo_eligible').default(false).notNull(),
    comboRole: text('combo_role'), // 'burger' | 'side' | 'drink' | 'addon' | null
    ratingAvg: numeric('rating_avg', { precision: 3, scale: 2 }).default('0.00').notNull(),
    reviewCount: integer('review_count').default(0).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('products_category_id_idx').on(table.categoryId),
    index('products_available_idx').on(table.isAvailable),
  ]
);

export const productOptions = pgTable('product_options', {
  id: serial('id').primaryKey(),
  productId: integer('product_id')
    .references(() => products.id, { onDelete: 'cascade' })
    .notNull(),
  groupName: text('group_name').notNull(), // e.g., 'Extra Patty', 'Cheese', 'Sauces', 'Toppings'
  selectionType: text('selection_type').default('multiple').notNull(), // 'single' | 'multiple'
  isRequired: boolean('is_required').default(false).notNull(),
  maxSelections: integer('max_selections').default(5).notNull(),
  sortOrder: integer('sort_order').default(0).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const productCustomizations = pgTable('product_customizations', {
  id: serial('id').primaryKey(),
  optionId: integer('option_id')
    .references(() => productOptions.id, { onDelete: 'cascade' })
    .notNull(),
  name: text('name').notNull(),
  priceDeltaCents: integer('price_delta_cents').default(0).notNull(),
  isAvailable: boolean('is_available').default(true).notNull(),
  isDefault: boolean('is_default').default(false).notNull(),
  caloriesDelta: integer('calories_delta').default(0).notNull(),
  sortOrder: integer('sort_order').default(0).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const branchProducts = pgTable(
  'branch_products',
  {
    id: serial('id').primaryKey(),
    branchId: integer('branch_id')
      .references(() => branches.id, { onDelete: 'cascade' })
      .notNull(),
    productId: integer('product_id')
      .references(() => products.id, { onDelete: 'cascade' })
      .notNull(),
    isAvailable: boolean('is_available').default(true).notNull(),
    priceOverrideCents: integer('price_override_cents'),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [uniqueIndex('branch_product_unique_idx').on(table.branchId, table.productId)]
);

export const addresses = pgTable('addresses', {
  id: serial('id').primaryKey(),
  profileId: integer('profile_id')
    .references(() => profiles.id, { onDelete: 'cascade' })
    .notNull(),
  label: text('label').default('Home').notNull(),
  recipientName: text('recipient_name').notNull(),
  phone: text('phone').notNull(),
  streetAddress: text('street_address').notNull(),
  district: text('district').default('').notNull(),
  city: text('city').notNull(),
  postalCode: text('postal_code').default('').notNull(),
  deliveryNotes: text('delivery_notes').default('').notNull(),
  isDefault: boolean('is_default').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const carts = pgTable('carts', {
  id: serial('id').primaryKey(),
  profileId: integer('profile_id').references(() => profiles.id, { onDelete: 'cascade' }),
  sessionToken: text('session_token').notNull().unique(),
  branchId: integer('branch_id').references(() => branches.id, { onDelete: 'set null' }),
  couponCode: text('coupon_code'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export interface CartCustomizationItem {
  customizationId: number;
  optionGroup: string;
  name: string;
  priceDeltaCents: number;
}

export interface ComboSelectionPayload {
  burgerId: number;
  burgerName: string;
  burgerCustomizations: CartCustomizationItem[];
  sideId: number;
  sideName: string;
  drinkId: number;
  drinkName: string;
  addonIds: number[];
  addonNames: string[];
  comboDiscountCents: number;
}

export const cartItems = pgTable('cart_items', {
  id: serial('id').primaryKey(),
  cartId: integer('cart_id')
    .references(() => carts.id, { onDelete: 'cascade' })
    .notNull(),
  productId: integer('product_id').references(() => products.id, { onDelete: 'set null' }),
  itemType: text('item_type').default('product').notNull(), // 'product' | 'combo'
  displayName: text('display_name').notNull(),
  imageUrl: text('image_url').notNull(),
  selectedCustomizations: jsonb('selected_customizations')
    .$type<CartCustomizationItem[]>()
    .default([])
    .notNull(),
  comboPayload: jsonb('combo_payload').$type<ComboSelectionPayload | null>(),
  quantity: integer('quantity').default(1).notNull(),
  unitPriceCents: integer('unit_price_cents').notNull(),
  specialInstructions: text('special_instructions').default('').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const coupons = pgTable('coupons', {
  id: serial('id').primaryKey(),
  code: text('code').notNull().unique(),
  title: text('title').notNull(),
  description: text('description').default('').notNull(),
  discountType: text('discount_type').notNull(), // 'percentage' | 'fixed' | 'combo'
  discountValue: integer('discount_value').notNull(), // percentage (e.g. 15) or cents (e.g. 500)
  minOrderCents: integer('min_order_cents').default(0).notNull(),
  maxDiscountCents: integer('max_discount_cents'),
  usageLimit: integer('usage_limit'),
  usedCount: integer('used_count').default(0).notNull(),
  startsAt: timestamp('starts_at'),
  expiresAt: timestamp('expires_at'),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const orders = pgTable(
  'orders',
  {
    id: serial('id').primaryKey(),
    orderNumber: text('order_number').notNull().unique(),
    profileId: integer('profile_id')
      .references(() => profiles.id, { onDelete: 'restrict' })
      .notNull(),
    branchId: integer('branch_id')
      .references(() => branches.id, { onDelete: 'restrict' })
      .notNull(),
    orderType: text('order_type').notNull(), // 'pickup' | 'delivery'
    status: text('status').default('pending').notNull(),
    // 'pending' | 'confirmed' | 'preparing' | 'ready_for_pickup' | 'out_for_delivery' | 'completed' | 'cancelled'
    customerName: text('customer_name').notNull(),
    customerEmail: text('customer_email').notNull(),
    customerPhone: text('customer_phone').notNull(),
    deliveryAddress: text('delivery_address'),
    deliveryInstructions: text('delivery_instructions'),
    scheduledPickupAt: timestamp('scheduled_pickup_at'),
    subtotalCents: integer('subtotal_cents').notNull(),
    discountCents: integer('discount_cents').default(0).notNull(),
    deliveryFeeCents: integer('delivery_fee_cents').default(0).notNull(),
    totalCents: integer('total_cents').notNull(),
    couponCode: text('coupon_code'),
    paymentMethod: text('payment_method').notNull(), // 'cash_on_pickup' | 'cash_on_delivery' | 'gcash' | 'card'
    paymentStatus: text('payment_status').default('unpaid').notNull(), // 'unpaid' | 'pending_verification' | 'paid' | 'failed' | 'refunded'
    pointsEarned: integer('points_earned').default(0).notNull(),
    pointsRedeemed: integer('points_redeemed').default(0).notNull(),
    rejectionReason: text('rejection_reason'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('orders_profile_id_idx').on(table.profileId),
    index('orders_branch_id_idx').on(table.branchId),
    index('orders_status_idx').on(table.status),
  ]
);

export const orderItems = pgTable('order_items', {
  id: serial('id').primaryKey(),
  orderId: integer('order_id')
    .references(() => orders.id, { onDelete: 'cascade' })
    .notNull(),
  productId: integer('product_id').references(() => products.id, { onDelete: 'set null' }),
  itemType: text('item_type').default('product').notNull(),
  productNameSnapshot: text('product_name_snapshot').notNull(),
  productImageSnapshot: text('product_image_snapshot').notNull(),
  unitPriceCentsSnapshot: integer('unit_price_cents_snapshot').notNull(),
  quantity: integer('quantity').notNull(),
  customizationsSnapshot: jsonb('customizations_snapshot')
    .$type<CartCustomizationItem[]>()
    .default([])
    .notNull(),
  comboSnapshot: jsonb('combo_snapshot').$type<ComboSelectionPayload | null>(),
  lineTotalCents: integer('line_total_cents').notNull(),
  specialInstructions: text('special_instructions'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const payments = pgTable('payments', {
  id: serial('id').primaryKey(),
  orderId: integer('order_id')
    .references(() => orders.id, { onDelete: 'cascade' })
    .notNull(),
  method: text('method').notNull(),
  status: text('status').default('pending').notNull(), // 'pending' | 'verified' | 'failed' | 'refunded'
  amountCents: integer('amount_cents').notNull(),
  providerReference: text('provider_reference'),
  gatewayPayload: jsonb('gateway_payload').$type<Record<string, unknown>>(),
  verifiedAt: timestamp('verified_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const couponUsage = pgTable('coupon_usage', {
  id: serial('id').primaryKey(),
  couponId: integer('coupon_id')
    .references(() => coupons.id, { onDelete: 'cascade' })
    .notNull(),
  orderId: integer('order_id')
    .references(() => orders.id, { onDelete: 'cascade' })
    .notNull(),
  profileId: integer('profile_id')
    .references(() => profiles.id, { onDelete: 'cascade' })
    .notNull(),
  discountAppliedCents: integer('discount_applied_cents').notNull(),
  usedAt: timestamp('used_at').defaultNow().notNull(),
});

export const inventory = pgTable('inventory', {
  id: serial('id').primaryKey(),
  branchId: integer('branch_id')
    .references(() => branches.id, { onDelete: 'cascade' })
    .notNull(),
  productId: integer('product_id').references(() => products.id, { onDelete: 'set null' }),
  itemType: text('item_type').default('product').notNull(), // 'product' | 'ingredient'
  sku: text('sku').notNull(),
  itemName: text('item_name').notNull(),
  unit: text('unit').default('units').notNull(),
  quantityOnHand: integer('quantity_on_hand').default(0).notNull(),
  reorderThreshold: integer('reorder_threshold').default(15).notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const inventoryTransactions = pgTable('inventory_transactions', {
  id: serial('id').primaryKey(),
  inventoryId: integer('inventory_id')
    .references(() => inventory.id, { onDelete: 'cascade' })
    .notNull(),
  changeAmount: integer('change_amount').notNull(),
  previousQuantity: integer('previous_quantity').notNull(),
  newQuantity: integer('new_quantity').notNull(),
  reason: text('reason').notNull(),
  referenceOrderId: integer('reference_order_id').references(() => orders.id, {
    onDelete: 'set null',
  }),
  performedByProfileId: integer('performed_by_profile_id').references(() => profiles.id, {
    onDelete: 'set null',
  }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const reviews = pgTable('reviews', {
  id: serial('id').primaryKey(),
  productId: integer('product_id')
    .references(() => products.id, { onDelete: 'cascade' })
    .notNull(),
  profileId: integer('profile_id')
    .references(() => profiles.id, { onDelete: 'cascade' })
    .notNull(),
  orderId: integer('order_id').references(() => orders.id, { onDelete: 'set null' }),
  rating: integer('rating').notNull(),
  title: text('title').default('').notNull(),
  comment: text('comment').notNull(),
  isVerifiedPurchase: boolean('is_verified_purchase').default(false).notNull(),
  status: text('status').default('published').notNull(), // 'published' | 'hidden'
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const notifications = pgTable(
  'notifications',
  {
    id: serial('id').primaryKey(),
    profileId: integer('profile_id')
      .references(() => profiles.id, { onDelete: 'cascade' })
      .notNull(),
    orderId: integer('order_id').references(() => orders.id, { onDelete: 'set null' }),
    type: text('type').default('order_update').notNull(),
    title: text('title').notNull(),
    message: text('message').notNull(),
    isRead: boolean('is_read').default(false).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [index('notifications_profile_idx').on(table.profileId)]
);

export const loyaltyAccounts = pgTable('loyalty_accounts', {
  id: serial('id').primaryKey(),
  profileId: integer('profile_id')
    .references(() => profiles.id, { onDelete: 'cascade' })
    .notNull()
    .unique(),
  pointsBalance: integer('points_balance').default(0).notNull(),
  lifetimePoints: integer('lifetime_points').default(0).notNull(),
  tierName: text('tier_name').default('Flame Member').notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const loyaltyTransactions = pgTable('loyalty_transactions', {
  id: serial('id').primaryKey(),
  loyaltyAccountId: integer('loyalty_account_id')
    .references(() => loyaltyAccounts.id, { onDelete: 'cascade' })
    .notNull(),
  orderId: integer('order_id').references(() => orders.id, { onDelete: 'set null' }),
  pointsDelta: integer('points_delta').notNull(),
  transactionType: text('transaction_type').notNull(), // 'earn' | 'redeem' | 'adjust'
  description: text('description').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const orderStatusHistory = pgTable('order_status_history', {
  id: serial('id').primaryKey(),
  orderId: integer('order_id')
    .references(() => orders.id, { onDelete: 'cascade' })
    .notNull(),
  previousStatus: text('previous_status'),
  newStatus: text('new_status').notNull(),
  changedByProfileId: integer('changed_by_profile_id').references(() => profiles.id, {
    onDelete: 'set null',
  }),
  note: text('note'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const favoriteProducts = pgTable(
  'favorite_products',
  {
    id: serial('id').primaryKey(),
    profileId: integer('profile_id')
      .references(() => profiles.id, { onDelete: 'cascade' })
      .notNull(),
    productId: integer('product_id')
      .references(() => products.id, { onDelete: 'cascade' })
      .notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [uniqueIndex('favorite_profile_product_idx').on(table.profileId, table.productId)]
);

export const newsletterSubscribers = pgTable('newsletter_subscribers', {
  id: serial('id').primaryKey(),
  email: text('email').notNull().unique(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const storeSettings = pgTable('store_settings', {
  id: serial('id').primaryKey(),
  key: text('key').notNull().unique(),
  value: jsonb('value').$type<Record<string, unknown>>().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Relations
export const profilesRelations = relations(profiles, ({ one, many }) => ({
  role: one(roles, { fields: [profiles.roleId], references: [roles.id] }),
  addresses: many(addresses),
  orders: many(orders),
  reviews: many(reviews),
  notifications: many(notifications),
  loyaltyAccount: one(loyaltyAccounts, {
    fields: [profiles.id],
    references: [loyaltyAccounts.profileId],
  }),
  staffAccount: one(staffAccounts, {
    fields: [profiles.id],
    references: [staffAccounts.profileId],
  }),
}));

export const categoriesRelations = relations(categories, ({ many }) => ({
  products: many(products),
}));

export const productsRelations = relations(products, ({ one, many }) => ({
  category: one(categories, { fields: [products.categoryId], references: [categories.id] }),
  options: many(productOptions),
  reviews: many(reviews),
}));

export const productOptionsRelations = relations(productOptions, ({ one, many }) => ({
  product: one(products, { fields: [productOptions.productId], references: [products.id] }),
  customizations: many(productCustomizations),
}));

export const productCustomizationsRelations = relations(productCustomizations, ({ one }) => ({
  option: one(productOptions, {
    fields: [productCustomizations.optionId],
    references: [productOptions.id],
  }),
}));

export const ordersRelations = relations(orders, ({ one, many }) => ({
  profile: one(profiles, { fields: [orders.profileId], references: [profiles.id] }),
  branch: one(branches, { fields: [orders.branchId], references: [branches.id] }),
  items: many(orderItems),
  payments: many(payments),
  statusHistory: many(orderStatusHistory),
}));

export const orderItemsRelations = relations(orderItems, ({ one }) => ({
  order: one(orders, { fields: [orderItems.orderId], references: [orders.id] }),
  product: one(products, { fields: [orderItems.productId], references: [products.id] }),
}));
