import { eq } from 'drizzle-orm';
import { db } from './index.ts';
import {
  branches,
  categories,
  coupons,
  inventory,
  loyaltyAccounts,
  productCustomizations,
  productOptions,
  products,
  profiles,
  reviews,
  roles,
  staffAccounts,
  storeSettings,
} from './schema.ts';
import { hashPassword } from '../server/auth.ts';

let seedPromise: Promise<void> | null = null;

export async function ensureSeeded(): Promise<void> {
  if (!seedPromise) {
    seedPromise = runSeed().catch((err) => {
      seedPromise = null;
      console.error('Seed check error:', err);
      throw err;
    });
  }
  return seedPromise;
}

async function runSeed(): Promise<void> {
  try {
    const existingRoles = await db.select().from(roles).limit(1);
    if (existingRoles.length > 0) {
      const existingProducts = await db.select().from(products).limit(1);
      if (existingProducts.length > 0) {
        return;
      }
    }

    // 1. Seed Roles
    const roleDefs = [
      { name: 'customer', description: 'Standard ordering customer account' },
      { name: 'staff', description: 'Kitchen and branch order operations staff' },
      { name: 'admin', description: 'Full restaurant and system administrator' },
    ];
    for (const r of roleDefs) {
      await db.insert(roles).values(r).onConflictDoNothing();
    }
    const allRoles = await db.select().from(roles);
    const roleMap = new Map(allRoles.map((r) => [r.name, r.id]));

    // 2. Seed Branches
    const branchDefs = [
      {
        name: 'Downtown Flagship Grill',
        slug: 'downtown-flagship',
        address: '420 Grillhouse Ave, Downtown District',
        city: 'Metro Center',
        phone: '(555) 234-8910',
        operatingHours: 'Daily 10:00 AM – 11:00 PM',
        supportsPickup: true,
        supportsDelivery: true,
        deliveryFeeCents: 16700,
        minOrderCents: 56000,
        estimatedPrepMinutes: 15,
        isActive: true,
      },
      {
        name: 'Westside Craft Kitchen',
        slug: 'westside-kitchen',
        address: '1180 Harbor Blvd, Westside Quarter',
        city: 'Westside',
        phone: '(555) 234-8944',
        operatingHours: 'Daily 11:00 AM – 10:30 PM',
        supportsPickup: true,
        supportsDelivery: true,
        deliveryFeeCents: 22300,
        minOrderCents: 67200,
        estimatedPrepMinutes: 18,
        isActive: true,
      },
      {
        name: 'Central Station Express',
        slug: 'central-express',
        address: 'Concourse B, Central Transit Hub',
        city: 'Metro Center',
        phone: '(555) 234-8977',
        operatingHours: 'Mon–Sun 9:00 AM – 9:30 PM',
        supportsPickup: true,
        supportsDelivery: false,
        deliveryFeeCents: 0,
        minOrderCents: 44800,
        estimatedPrepMinutes: 10,
        isActive: true,
      },
    ];
    for (const b of branchDefs) {
      await db.insert(branches).values(b).onConflictDoNothing();
    }
    const seededBranches = await db.select().from(branches);
    const flagshipBranchId = seededBranches[0]?.id ?? 1;

    // 3. Seed Admin, Staff, and Sample Verified Reviewers
    const adminEmail = 'justinbonilla1999@gmail.com';
    const existingAdmin = await db
      .select()
      .from(profiles)
      .where(eq(profiles.email, adminEmail))
      .limit(1);
    let adminProfileId: number;
    if (existingAdmin.length === 0) {
      const inserted = await db
        .insert(profiles)
        .values({
          uid: 'seed-admin-justin',
          email: adminEmail,
          fullName: 'Justin Bonilla',
          phone: '(555) 234-8900',
          roleId: roleMap.get('admin') ?? null,
          roleName: 'admin',
          emailVerified: true,
        })
        .returning();
      adminProfileId = inserted[0].id;
    } else {
      adminProfileId = existingAdmin[0].id;
    }
    await db
      .insert(loyaltyAccounts)
      .values({ profileId: adminProfileId, pointsBalance: 450, lifetimePoints: 450, tierName: 'Gold Grill' })
      .onConflictDoNothing();

    // Seed Kitchen Staff Account (for testing staff role cleanly)
    const kitchenEmail = 'kitchen@justburger.co';
    const existingStaff = await db
      .select()
      .from(profiles)
      .where(eq(profiles.email, kitchenEmail))
      .limit(1);
    if (existingStaff.length === 0) {
      const staffProf = await db
        .insert(profiles)
        .values({
          uid: 'seed-staff-kitchen',
          email: kitchenEmail,
          fullName: 'Marco Reyes (Kitchen Lead)',
          phone: '(555) 234-8912',
          passwordHash: hashPassword('JustBurgerStaff!2026'),
          roleId: roleMap.get('staff') ?? null,
          roleName: 'staff',
          emailVerified: true,
        })
        .returning();
      await db
        .insert(staffAccounts)
        .values({
          profileId: staffProf[0].id,
          branchId: flagshipBranchId,
          staffTitle: 'Head Grill Chef',
          permissions: ['orders:manage', 'kitchen:manage', 'inventory:view'],
        })
        .onConflictDoNothing();
    }

    // Seed verified guest reviewer profiles
    const reviewerDefs = [
      {
        uid: 'seed-reviewer-elena',
        email: 'elena.vargas@example.com',
        fullName: 'Elena Vargas',
        phone: '(555) 890-1122',
      },
      {
        uid: 'seed-reviewer-marcus',
        email: 'marcus.chen@example.com',
        fullName: 'Marcus Chen',
        phone: '(555) 890-3344',
      },
      {
        uid: 'seed-reviewer-sofia',
        email: 'sofia.laurent@example.com',
        fullName: 'Sofia Laurent',
        phone: '(555) 890-5566',
      },
    ];
    const reviewerIds: number[] = [];
    for (const rev of reviewerDefs) {
      const found = await db.select().from(profiles).where(eq(profiles.email, rev.email)).limit(1);
      if (found.length === 0) {
        const ins = await db
          .insert(profiles)
          .values({
            ...rev,
            roleId: roleMap.get('customer') ?? null,
            roleName: 'customer',
            emailVerified: true,
          })
          .returning();
        reviewerIds.push(ins[0].id);
        await db
          .insert(loyaltyAccounts)
          .values({ profileId: ins[0].id, pointsBalance: 120, lifetimePoints: 120, tierName: 'Flame Member' })
          .onConflictDoNothing();
      } else {
        reviewerIds.push(found[0].id);
      }
    }

    // 4. Seed Categories
    const categoryDefs = [
      {
        name: 'Burgers',
        slug: 'burgers',
        description: 'Hand-smashed seared beef and crispy buttermilk chicken classics.',
        imageUrl: '/src/assets/images/classic_smash_burger_1795056342466.jpg',
        sortOrder: 1,
      },
      {
        name: 'Signature Burgers',
        slug: 'signature-burgers',
        description: 'Chef-crafted house specials with aged cheeses and small-batch sauces.',
        imageUrl: '/src/assets/images/truffle_swiss_burger_1795056342995.jpg',
        sortOrder: 2,
      },
      {
        name: 'Combo Meals',
        slug: 'combo-meals',
        description: 'Complete burger boxes paired with crispy sides and chilled drinks.',
        imageUrl: '/src/assets/images/burger_combo_meal_1795056342216.jpg',
        sortOrder: 3,
      },
      {
        name: 'Fries & Sides',
        slug: 'fries-and-sides',
        description: 'Skin-on rosemary fries, loaded cheddar bowls, and crispy rings.',
        imageUrl: '/src/assets/images/crispy_loaded_fries_1795056342337.jpg',
        sortOrder: 4,
      },
      {
        name: 'Drinks',
        slug: 'drinks',
        description: 'Thick hand-spun shakes, craft citrus sodas, and cold-brew fizz.',
        imageUrl: '/src/assets/images/craft_shakes_soda_1795056342323.jpg',
        sortOrder: 5,
      },
      {
        name: 'Desserts',
        slug: 'desserts',
        description: 'Warm dark fudge brownie sundaes and indulgent sweet finishes.',
        imageUrl: '/src/assets/images/chocolate_fudge_sundae_1795056342414.jpg',
        sortOrder: 6,
      },
    ];
    for (const c of categoryDefs) {
      await db.insert(categories).values(c).onConflictDoNothing();
    }
    const allCategories = await db.select().from(categories);
    const catMap = new Map(allCategories.map((c) => [c.slug, c.id]));

    // 5. Seed Products
    const productDefs = [
      {
        categoryId: catMap.get('signature-burgers')!,
        name: 'The JUST BURGER Gold',
        slug: 'the-just-burger-gold',
        description:
          'Double seared Angus smash patties, thick-cut smoked bacon, caramelized sweet onions, melted aged cheddar, crisp butter lettuce, and our signature tangy house sauce on a toasted sesame brioche bun.',
        ingredients:
          'Double Angus beef patties, aged sharp cheddar, applewood bacon, caramelized onions, vine tomato, butter lettuce, JUST BURGER sauce, toasted brioche bun',
        priceCents: 75500,
        imageUrl: '/src/assets/images/hero_signature_burger_1795056340276.jpg',
        calories: 890,
        prepTimeMinutes: 12,
        isFeatured: true,
        isBestSeller: true,
        isNewArrival: false,
        isSignature: true,
        isAvailable: true,
        isComboEligible: true,
        comboRole: 'burger',
        ratingAvg: '4.90',
        reviewCount: 3,
      },
      {
        categoryId: catMap.get('burgers')!,
        name: 'Classic Double Smash',
        slug: 'classic-double-smash',
        description:
          'Two lacy-edged smashed beef patties layered with double melted American cheddar, house-brined dill pickles, crisp lettuce, vine tomato, and classic grillhouse sauce.',
        ingredients:
          'Double smashed beef patties, double American cheddar, dill pickles, lettuce, tomato, house grill sauce, sesame brioche bun',
        priceCents: 55900,
        imageUrl: '/src/assets/images/classic_smash_burger_1795056342466.jpg',
        calories: 760,
        prepTimeMinutes: 10,
        isFeatured: true,
        isBestSeller: true,
        isNewArrival: false,
        isSignature: false,
        isAvailable: true,
        isComboEligible: true,
        comboRole: 'burger',
        ratingAvg: '4.85',
        reviewCount: 2,
      },
      {
        categoryId: catMap.get('signature-burgers')!,
        name: 'Black Truffle & Gruyère',
        slug: 'black-truffle-gruyere',
        description:
          'Thick prime-blend patty crowned with melted Swiss Gruyère, pan-roasted wild cremini mushrooms, crispy fried shallots, and rich black truffle garlic aioli.',
        ingredients:
          'Prime-blend beef patty, Swiss Gruyère cheese, roasted cremini mushrooms, crispy shallots, black truffle aioli, toasted brioche bun',
        priceCents: 80000,
        imageUrl: '/src/assets/images/truffle_swiss_burger_1795056342995.jpg',
        calories: 840,
        prepTimeMinutes: 14,
        isFeatured: true,
        isBestSeller: false,
        isNewArrival: true,
        isSignature: true,
        isAvailable: true,
        isComboEligible: true,
        comboRole: 'burger',
        ratingAvg: '4.95',
        reviewCount: 2,
      },
      {
        categoryId: catMap.get('burgers')!,
        name: 'Nashville Hot Honey Chicken',
        slug: 'nashville-hot-honey-chicken',
        description:
          'Buttermilk-brined crispy chicken thigh glazed in smoky chili honey oil, topped with crunchy purple cabbage slaw, thick dill pickles, and cool herb mayo.',
        ingredients:
          'Crispy buttermilk chicken thigh, hot honey chili glaze, shredded red & green slaw, dill pickles, herb mayo, brioche bun',
        priceCents: 61500,
        imageUrl: '/src/assets/images/spicy_chicken_burger_1795056342151.jpg',
        calories: 780,
        prepTimeMinutes: 12,
        isFeatured: false,
        isBestSeller: true,
        isNewArrival: true,
        isSignature: false,
        isAvailable: true,
        isComboEligible: true,
        comboRole: 'burger',
        ratingAvg: '4.80',
        reviewCount: 1,
      },
      {
        categoryId: catMap.get('combo-meals')!,
        name: 'Flagship Smash Feast',
        slug: 'flagship-smash-feast',
        description:
          'Our signature Classic Double Smash paired with skin-on rosemary fries, crispy beer-battered onion rings, and a chilled small-batch root brew craft soda.',
        ingredients:
          'Classic Double Smash burger, regular rosemary fries, 4pc crispy onion rings, craft soda bottle',
        priceCents: 89500,
        imageUrl: '/src/assets/images/burger_combo_meal_1795056342216.jpg',
        calories: 1320,
        prepTimeMinutes: 14,
        isFeatured: true,
        isBestSeller: true,
        isNewArrival: false,
        isSignature: false,
        isAvailable: true,
        isComboEligible: false,
        comboRole: null,
        ratingAvg: '4.90',
        reviewCount: 1,
      },
      {
        categoryId: catMap.get('combo-meals')!,
        name: 'Truffle & Crispy Rings Box',
        slug: 'truffle-crispy-rings-box',
        description:
          'Black Truffle & Gruyère burger served alongside sea-salt fries, smoky barbecue dip, onion rings, and your choice of craft beverage.',
        ingredients:
          'Black Truffle & Gruyère burger, rosemary fries, onion rings, smoky BBQ dip, chilled craft soda',
        priceCents: 106300,
        imageUrl: '/src/assets/images/burger_combo_meal_1795056342216.jpg',
        calories: 1410,
        prepTimeMinutes: 15,
        isFeatured: false,
        isBestSeller: false,
        isNewArrival: true,
        isSignature: true,
        isAvailable: true,
        isComboEligible: false,
        comboRole: null,
        ratingAvg: '4.80',
        reviewCount: 1,
      },
      {
        categoryId: catMap.get('fries-and-sides')!,
        name: 'Sea-Salt Rosemary Fries',
        slug: 'sea-salt-rosemary-fries',
        description:
          'Double-fried skin-on Russet fries tossed in flaky sea salt and fresh chopped rosemary, served with warm cheddar sauce and house smoky ketchup.',
        ingredients:
          'Hand-cut Russet potatoes, flaky sea salt, fresh rosemary, warm cheddar dip, smoky ketchup',
        priceCents: 25100,
        imageUrl: '/src/assets/images/crispy_loaded_fries_1795056342337.jpg',
        calories: 420,
        prepTimeMinutes: 6,
        isFeatured: false,
        isBestSeller: true,
        isNewArrival: false,
        isSignature: false,
        isAvailable: true,
        isComboEligible: true,
        comboRole: 'side',
        ratingAvg: '4.75',
        reviewCount: 1,
      },
      {
        categoryId: catMap.get('fries-and-sides')!,
        name: 'Cheddar Dipper Fries',
        slug: 'cheddar-dipper-fries',
        description:
          'Generous shareable bowl of crisp golden fries paired with sharp aged cheddar dip and roasted garlic herb ketchup.',
        ingredients: 'Skin-on potatoes, aged cheddar cheese sauce, herb ketchup, chives',
        priceCents: 33500,
        imageUrl: '/src/assets/images/crispy_loaded_fries_1795056342337.jpg',
        calories: 560,
        prepTimeMinutes: 7,
        isFeatured: false,
        isBestSeller: false,
        isNewArrival: true,
        isSignature: false,
        isAvailable: true,
        isComboEligible: true,
        comboRole: 'side',
        ratingAvg: '4.70',
        reviewCount: 1,
      },
      {
        categoryId: catMap.get('drinks')!,
        name: 'Salted Caramel Pretzel Shake',
        slug: 'salted-caramel-pretzel-shake',
        description:
          'Hand-spun Madagascar vanilla bean ice cream blended with burnt caramel, flaky sea salt, whipped cream, and a crisp salted pretzel twist.',
        ingredients:
          'Whole milk, vanilla bean ice cream, salted caramel sauce, whipped cream, mini pretzel',
        priceCents: 32400,
        imageUrl: '/src/assets/images/craft_shakes_soda_1795056342323.jpg',
        calories: 520,
        prepTimeMinutes: 4,
        isFeatured: false,
        isBestSeller: true,
        isNewArrival: false,
        isSignature: false,
        isAvailable: true,
        isComboEligible: true,
        comboRole: 'drink',
        ratingAvg: '4.90',
        reviewCount: 1,
      },
      {
        categoryId: catMap.get('drinks')!,
        name: 'Blood Orange Mint Soda',
        slug: 'blood-orange-mint-soda',
        description:
          'Bright Sicilian blood orange reduction topped with crisp sparkling mineral water, fresh garden mint, and citrus peel over crystal ice.',
        ingredients: 'Blood orange puree, sparkling water, cane sugar, fresh mint, orange wheel',
        priceCents: 21200,
        imageUrl: '/src/assets/images/craft_shakes_soda_1795056342323.jpg',
        calories: 140,
        prepTimeMinutes: 3,
        isFeatured: false,
        isBestSeller: false,
        isNewArrival: true,
        isSignature: false,
        isAvailable: true,
        isComboEligible: true,
        comboRole: 'drink',
        ratingAvg: '4.80',
        reviewCount: 1,
      },
      {
        categoryId: catMap.get('desserts')!,
        name: 'Dark Fudge Brownie Sundae',
        slug: 'dark-fudge-brownie-sundae',
        description:
          'Warm double-cocoa fudge brownie crowned with a scoop of cold vanilla bean ice cream, dark ganache drizzle, and toasted pecan crunch.',
        ingredients:
          'Dark chocolate brownie, Madagascar vanilla ice cream, hot fudge ganache, toasted pecans',
        priceCents: 36300,
        imageUrl: '/src/assets/images/chocolate_fudge_sundae_1795056342414.jpg',
        calories: 610,
        prepTimeMinutes: 5,
        isFeatured: true,
        isBestSeller: false,
        isNewArrival: true,
        isSignature: false,
        isAvailable: true,
        isComboEligible: true,
        comboRole: 'addon',
        ratingAvg: '4.95',
        reviewCount: 1,
      },
    ];

    for (const p of productDefs) {
      await db.insert(products).values(p).onConflictDoNothing();
    }

    const allProducts = await db.select().from(products);

    // 6. Seed Burger Options & Customizations for all Burger products
    const burgerProducts = allProducts.filter((p) => p.comboRole === 'burger');
    for (const bp of burgerProducts) {
      const existingOpts = await db
        .select()
        .from(productOptions)
        .where(eq(productOptions.productId, bp.id))
        .limit(1);
      if (existingOpts.length > 0) continue;

      const optGroups = [
        {
          groupName: 'Extra Patty & Protein',
          selectionType: 'multiple',
          isRequired: false,
          maxSelections: 2,
          sortOrder: 1,
          items: [
            { name: 'Extra Smashed Beef Patty', priceDeltaCents: 18200, caloriesDelta: 240, isAvailable: true, isDefault: false },
            { name: 'Smoked Applewood Bacon (2 Strips)', priceDeltaCents: 12600, caloriesDelta: 110, isAvailable: true, isDefault: false },
            { name: 'Wagyu Reserve Patty Upgrade', priceDeltaCents: 25200, caloriesDelta: 260, isAvailable: false, isDefault: false },
          ],
        },
        {
          groupName: 'Cheese Selection',
          selectionType: 'multiple',
          isRequired: false,
          maxSelections: 2,
          sortOrder: 2,
          items: [
            { name: 'Aged Sharp Cheddar', priceDeltaCents: 7000, caloriesDelta: 90, isAvailable: true, isDefault: false },
            { name: 'Melted Swiss Gruyère', priceDeltaCents: 8400, caloriesDelta: 95, isAvailable: true, isDefault: false },
            { name: 'Smoked Provolone', priceDeltaCents: 7000, caloriesDelta: 85, isAvailable: true, isDefault: false },
          ],
        },
        {
          groupName: 'Signature Sauces',
          selectionType: 'multiple',
          isRequired: false,
          maxSelections: 3,
          sortOrder: 3,
          items: [
            { name: 'JUST BURGER House Sauce', priceDeltaCents: 0, caloriesDelta: 60, isAvailable: true, isDefault: true },
            { name: 'Black Truffle Garlic Aioli', priceDeltaCents: 5600, caloriesDelta: 80, isAvailable: true, isDefault: false },
            { name: 'Nashville Chili Honey Glaze', priceDeltaCents: 4200, caloriesDelta: 55, isAvailable: true, isDefault: false },
            { name: 'Smoky Bourbon BBQ', priceDeltaCents: 2800, caloriesDelta: 45, isAvailable: true, isDefault: false },
          ],
        },
        {
          groupName: 'Vegetables & Toppings',
          selectionType: 'multiple',
          isRequired: false,
          maxSelections: 5,
          sortOrder: 4,
          items: [
            { name: 'Crisp Butter Lettuce', priceDeltaCents: 0, caloriesDelta: 5, isAvailable: true, isDefault: true },
            { name: 'Vine-Ripened Tomato', priceDeltaCents: 0, caloriesDelta: 10, isAvailable: true, isDefault: true },
            { name: 'House-Brined Dill Pickles', priceDeltaCents: 0, caloriesDelta: 5, isAvailable: true, isDefault: true },
            { name: 'Caramelized Sweet Onions', priceDeltaCents: 4800, caloriesDelta: 40, isAvailable: true, isDefault: false },
            { name: 'Roasted Cremini Mushrooms', priceDeltaCents: 8400, caloriesDelta: 35, isAvailable: true, isDefault: false },
            { name: 'Pickled Jalapeño Slices', priceDeltaCents: 3400, caloriesDelta: 10, isAvailable: true, isDefault: false },
          ],
        },
      ];

      for (const og of optGroups) {
        const insertedOpt = await db
          .insert(productOptions)
          .values({
            productId: bp.id,
            groupName: og.groupName,
            selectionType: og.selectionType,
            isRequired: og.isRequired,
            maxSelections: og.maxSelections,
            sortOrder: og.sortOrder,
          })
          .returning();
        const optionId = insertedOpt[0].id;
        for (let idx = 0; idx < og.items.length; idx++) {
          const item = og.items[idx];
          await db.insert(productCustomizations).values({
            optionId,
            name: item.name,
            priceDeltaCents: item.priceDeltaCents,
            isAvailable: item.isAvailable,
            isDefault: item.isDefault,
            caloriesDelta: item.caloriesDelta,
            sortOrder: idx + 1,
          });
        }
      }
    }

    // 7. Seed Inventory Items (Products + Kitchen Ingredients)
    const existingInv = await db.select().from(inventory).limit(1);
    if (existingInv.length === 0) {
      for (let i = 0; i < allProducts.length; i++) {
        const prod = allProducts[i];
        await db.insert(inventory).values({
          branchId: flagshipBranchId,
          productId: prod.id,
          itemType: 'product',
          sku: `JB-PRD-${String(prod.id).padStart(3, '0')}`,
          itemName: prod.name,
          unit: 'servings',
          quantityOnHand: i === 2 ? 9 : 48, // One item intentionally below threshold 15 for low-stock visibility
          reorderThreshold: 15,
        });
      }
      const ingredients = [
        { sku: 'JB-ING-001', itemName: 'Brioche Sesame Buns', unit: 'buns', quantityOnHand: 180, reorderThreshold: 40 },
        { sku: 'JB-ING-002', itemName: 'Angus Smash Beef Patties', unit: 'patties', quantityOnHand: 220, reorderThreshold: 50 },
        { sku: 'JB-ING-003', itemName: 'Black Truffle Aioli Batch', unit: 'tubs', quantityOnHand: 6, reorderThreshold: 10 },
        { sku: 'JB-ING-004', itemName: 'Aged Sharp Cheddar Slices', unit: 'slices', quantityOnHand: 310, reorderThreshold: 60 },
      ];
      for (const ing of ingredients) {
        await db.insert(inventory).values({
          branchId: flagshipBranchId,
          productId: null,
          itemType: 'ingredient',
          ...ing,
        });
      }
    }

    // 8. Seed Coupons / Promotions
    const couponDefs = [
      {
        code: 'JUST15',
        title: '15% Off Grill Favorites',
        description: 'Save 15% on orders ₱840.00 or more across burgers, sides, and shakes.',
        discountType: 'percentage',
        discountValue: 15,
        minOrderCents: 84000,
        maxDiscountCents: 84000,
        usageLimit: 500,
        isActive: true,
      },
      {
        code: 'WELCOME5',
        title: '₱280 Off First Feast',
        description: 'Flat ₱280.00 discount on any pickup or delivery order over ₱1,120.00.',
        discountType: 'fixed',
        discountValue: 28000,
        minOrderCents: 112000,
        maxDiscountCents: 28000,
        usageLimit: 1000,
        isActive: true,
      },
      {
        code: 'COMBO3',
        title: '₱168 Off Combo Night',
        description: 'Extra ₱168.00 off when your bag reaches ₱784.00+.',
        discountType: 'combo',
        discountValue: 16800,
        minOrderCents: 78400,
        maxDiscountCents: 16800,
        usageLimit: 300,
        isActive: true,
      },
    ];
    for (const cp of couponDefs) {
      await db.insert(coupons).values(cp).onConflictDoNothing();
    }

    // 9. Seed Store Settings
    const settingsDefs = [
      {
        key: 'announcement',
        value: {
          enabled: true,
          text: 'Use code JUST15 for 15% off orders ₱840+ · Freshly smashed to order across all branches',
          ctaLabel: 'Order Now',
        },
      },
      {
        key: 'business_info',
        value: {
          brandName: 'JUST BURGER',
          tagline: 'BIG FLAVOR. NO COMPROMISE.',
          supportEmail: 'hello@justburger.co',
          supportPhone: '(555) 234-8910',
          hours: 'Mon–Sun: 10:00 AM – 11:00 PM',
          address: '420 Grillhouse Ave, Downtown District',
          currencySymbol: '₱',
        },
      },
      {
        key: 'loyalty_rules',
        value: {
          pointsPerDollar: 1,
          minRedeemPoints: 1000,
          rewardsCatalog: [
            { id: 'reward_fries', title: '₱252.00 Rosemary Fries Voucher', pointsCost: 1400, discountCents: 25200 },
            { id: 'reward_five', title: '₱280.00 Off Any Order', pointsCost: 2800, discountCents: 28000 },
            { id: 'reward_ten', title: '₱560.00 Feast Credit', pointsCost: 5000, discountCents: 56000 },
          ],
        },
      },
      {
        key: 'payment_config',
        value: {
          cash_on_pickup: true,
          cash_on_delivery: true,
          gcash: true,
          card: true,
        },
      },
    ];
    for (const s of settingsDefs) {
      await db.insert(storeSettings).values(s).onConflictDoNothing();
    }

    // 10. Seed Initial Verified Reviews
    const existingReviews = await db.select().from(reviews).limit(1);
    if (existingReviews.length === 0 && reviewerIds.length >= 3 && allProducts.length >= 3) {
      const goldBurger = allProducts.find((p) => p.slug === 'the-just-burger-gold') ?? allProducts[0];
      const smashBurger = allProducts.find((p) => p.slug === 'classic-double-smash') ?? allProducts[1];
      const truffleBurger = allProducts.find((p) => p.slug === 'black-truffle-gruyere') ?? allProducts[2];

      await db.insert(reviews).values([
        {
          productId: goldBurger.id,
          profileId: reviewerIds[0],
          rating: 5,
          title: 'Crispiest smash crust in town',
          comment:
            'Ordered the JUST BURGER Gold with extra caramelized onions for pickup—hot out of the kitchen in 12 minutes and the brioche held up to the last bite.',
          isVerifiedPurchase: true,
          status: 'published',
        },
        {
          productId: smashBurger.id,
          profileId: reviewerIds[1],
          rating: 5,
          title: 'Balanced, bold, never greasy',
          comment:
            'Built a custom combo with rosemary fries and blood orange soda. Delivery arrived ahead of schedule and the house dill pickles are unreal.',
          isVerifiedPurchase: true,
          status: 'published',
        },
        {
          productId: truffleBurger.id,
          profileId: reviewerIds[2],
          rating: 5,
          title: 'Gruyère + truffle aioli hits different',
          comment:
            'The roasted wild mushrooms and crispy shallots make this taste like a steakhouse burger at fast-casual speed.',
          isVerifiedPurchase: true,
          status: 'published',
        },
      ]);
    }
  } catch (error) {
    console.error('Database seeding failed:', error);
    throw new Error('Failed to initialize JUST BURGER database seed.', { cause: error });
  }
}
