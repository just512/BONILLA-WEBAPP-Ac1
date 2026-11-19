export interface UserProfile {
  id: number;
  uid: string;
  email: string;
  fullName: string;
  phone: string;
  roleName: 'customer' | 'staff' | 'admin' | string;
  emailVerified: boolean;
  avatarUrl: string | null;
  isActive: boolean;
  branchId?: number | null;
  staffTitle?: string | null;
}

export interface Branch {
  id: number;
  name: string;
  slug: string;
  address: string;
  city: string;
  phone: string;
  operatingHours: string;
  supportsPickup: boolean;
  supportsDelivery: boolean;
  deliveryFeeCents: number;
  minOrderCents: number;
  estimatedPrepMinutes: number;
  isActive: boolean;
}

export interface Category {
  id: number;
  name: string;
  slug: string;
  description: string;
  imageUrl: string | null;
  sortOrder: number;
  isActive: boolean;
}

export interface ProductCustomization {
  id: number;
  optionId: number;
  name: string;
  priceDeltaCents: number;
  isAvailable: boolean;
  isDefault: boolean;
  caloriesDelta: number;
  sortOrder: number;
}

export interface ProductOption {
  id: number;
  productId: number;
  groupName: string;
  selectionType: 'single' | 'multiple';
  isRequired: boolean;
  maxSelections: number;
  sortOrder: number;
  customizations: ProductCustomization[];
}

export interface Product {
  id: number;
  categoryId: number | null;
  categoryName?: string;
  categorySlug?: string;
  name: string;
  slug: string;
  description: string;
  ingredients: string;
  priceCents: number;
  imageUrl: string;
  calories: number;
  prepTimeMinutes: number;
  isFeatured: boolean;
  isBestSeller: boolean;
  isNewArrival: boolean;
  isSignature: boolean;
  isAvailable: boolean;
  isComboEligible: boolean;
  comboRole: 'burger' | 'side' | 'drink' | 'addon' | null;
  ratingAvg: string;
  reviewCount: number;
  options?: ProductOption[];
}

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

export interface CartItem {
  id: number;
  cartId: number;
  productId: number | null;
  itemType: 'product' | 'combo';
  displayName: string;
  imageUrl: string;
  selectedCustomizations: CartCustomizationItem[];
  comboPayload: ComboSelectionPayload | null;
  quantity: number;
  unitPriceCents: number;
  specialInstructions: string;
}

export interface CartState {
  id: number;
  sessionToken: string;
  branchId: number | null;
  branch: Branch | null;
  couponCode: string | null;
  couponTitle: string | null;
  items: CartItem[];
  itemCount: number;
  subtotalCents: number;
  discountCents: number;
  deliveryFeeCents: number;
}

export interface OrderItemSnapshot {
  id: number;
  orderId: number;
  productId: number | null;
  itemType: string;
  productNameSnapshot: string;
  productImageSnapshot: string;
  unitPriceCentsSnapshot: number;
  quantity: number;
  customizationsSnapshot: CartCustomizationItem[];
  comboSnapshot: ComboSelectionPayload | null;
  lineTotalCents: number;
  specialInstructions: string | null;
}

export interface OrderStatusHistoryRow {
  id: number;
  orderId: number;
  previousStatus: string | null;
  newStatus: string;
  note: string | null;
  createdAt: string;
}

export interface Order {
  id: number;
  orderNumber: string;
  profileId: number;
  branchId: number;
  branch?: Branch | null;
  branchName?: string;
  orderType: 'pickup' | 'delivery';
  status:
    | 'pending'
    | 'confirmed'
    | 'preparing'
    | 'ready_for_pickup'
    | 'out_for_delivery'
    | 'completed'
    | 'cancelled';
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  deliveryAddress: string | null;
  deliveryInstructions: string | null;
  scheduledPickupAt: string | null;
  subtotalCents: number;
  discountCents: number;
  deliveryFeeCents: number;
  totalCents: number;
  couponCode: string | null;
  paymentMethod: 'cash_on_pickup' | 'cash_on_delivery' | 'gcash' | 'card';
  paymentStatus: 'unpaid' | 'pending_verification' | 'paid' | 'failed' | 'refunded';
  pointsEarned: number;
  pointsRedeemed: number;
  rejectionReason: string | null;
  createdAt: string;
  updatedAt: string;
  items?: OrderItemSnapshot[];
  history?: OrderStatusHistoryRow[];
}

export interface Coupon {
  id: number;
  code: string;
  title: string;
  description: string;
  discountType: 'percentage' | 'fixed' | 'combo';
  discountValue: number;
  minOrderCents: number;
  maxDiscountCents: number | null;
  usageLimit: number | null;
  usedCount: number;
  expiresAt: string | null;
  isActive: boolean;
}

export interface ReviewItem {
  id: number;
  rating: number;
  title: string;
  comment: string;
  isVerifiedPurchase: boolean;
  status?: string;
  createdAt: string;
  authorName: string;
  productName?: string;
  productId?: number;
}

export interface NotificationItem {
  id: number;
  orderId: number | null;
  type: string;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
}

export interface Address {
  id: number;
  label: string;
  recipientName: string;
  phone: string;
  streetAddress: string;
  district: string;
  city: string;
  postalCode: string;
  deliveryNotes: string;
  isDefault: boolean;
}

export interface StoreSettingsMap {
  announcement?: {
    enabled: boolean;
    text: string;
    ctaLabel?: string;
  };
  business_info?: {
    brandName: string;
    tagline: string;
    supportEmail: string;
    supportPhone: string;
    hours: string;
    address: string;
    currencySymbol: string;
  };
  loyalty_rules?: {
    pointsPerDollar: number;
    minRedeemPoints: number;
    rewardsCatalog: Array<{
      id: string;
      title: string;
      pointsCost: number;
      discountCents: number;
    }>;
  };
  payment_config?: {
    cash_on_pickup: boolean;
    cash_on_delivery: boolean;
    gcash: boolean;
    card: boolean;
  };
}
