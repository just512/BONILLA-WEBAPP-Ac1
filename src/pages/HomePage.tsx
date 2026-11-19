import React, { useEffect, useState } from 'react';
import { ArrowRight, Check, Flame, ShieldCheck, Star, Tag, Truck } from 'lucide-react';
import { useApp } from '../context/AppContext.tsx';
import { apiFetch, formatMoney } from '../lib/api.ts';
import { Category, Coupon, Product, ReviewItem } from '../types.ts';
import { ProductCard } from '../components/ProductCard.tsx';
import { ProductImage } from '../components/ProductImage.tsx';

interface StorefrontResponse {
  categories: Category[];
  bestSellers: Product[];
  signatureCollection: Product[];
  promotions: Coupon[];
  reviews: ReviewItem[];
}

export const HomePage: React.FC = () => {
  const { navigate, currencySymbol, showToast } = useApp();
  const [data, setData] = useState<StorefrontResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [newsletterEmail, setNewsletterEmail] = useState('');
  const [subscribing, setSubscribing] = useState(false);

  useEffect(() => {
    apiFetch<StorefrontResponse>('/api/storefront')
      .then((res) => setData(res))
      .catch(() => showToast('Unable to load menu highlights right now.', 'error'))
      .finally(() => setLoading(false));
  }, [showToast]);

  const handleNewsletterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newsletterEmail.trim()) return;
    setSubscribing(true);
    try {
      const res = await apiFetch<{ message: string }>('/api/newsletter', {
        method: 'POST',
        body: JSON.stringify({ email: newsletterEmail }),
      });
      showToast(res.message, 'success');
      setNewsletterEmail('');
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Subscription failed', 'error');
    } finally {
      setSubscribing(false);
    }
  };

  return (
    <div className="bg-white">
      {/* 1. HERO SECTION */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 pt-8 pb-16 lg:py-14">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-stretch">
          <div className="lg:col-span-6 flex flex-col justify-center py-4 lg:py-8">
            <p className="text-xs font-semibold uppercase tracking-widest text-[#D62828] mb-3">
              BIG FLAVOR. NO COMPROMISE.
            </p>
            <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-[#171717] leading-[1.05] [text-wrap:balance]">
              GOOD BURGERS. GREAT MOMENTS.
            </h1>
            <p className="mt-5 text-base sm:text-lg text-neutral-600 max-w-xl leading-relaxed">
              Fresh cravings, bold flavors, and satisfying bites. Your next favorite burger is just a
              few clicks away.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3.5">
              <button
                onClick={() => navigate('/menu')}
                className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl bg-[#D62828] hover:bg-[#B51E1E] text-white font-semibold text-sm shadow-sm transition-colors cursor-pointer"
              >
                <span>Order Now</span>
                <ArrowRight className="w-4 h-4" />
              </button>
              <button
                onClick={() => navigate('/combo-builder')}
                className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl border border-neutral-300 hover:border-[#171717] text-[#171717] font-semibold text-sm transition-colors cursor-pointer"
              >
                <span>Build Your Combo</span>
              </button>
            </div>

            <div className="mt-8 pt-6 border-t border-neutral-200 grid grid-cols-3 gap-4 text-sm">
              <div>
                <p className="font-display text-lg font-bold text-[#171717]">100% Angus</p>
                <p className="text-xs text-neutral-500">Freshly smashed to order</p>
              </div>
              <div>
                <p className="font-display text-lg font-bold text-[#171717]">12–15 min</p>
                <p className="text-xs text-neutral-500">Average grill prep</p>
              </div>
              <div>
                <p className="font-display text-lg font-bold text-[#171717]">JUST15</p>
                <p className="text-xs text-neutral-500">15% off orders $15+</p>
              </div>
            </div>
          </div>

          <div className="lg:col-span-6">
            <div className="relative h-full min-h-[340px] lg:min-h-[480px] rounded-2xl overflow-hidden bg-[#171717] shadow-xl">
              <ProductImage
                src="/src/assets/images/hero_signature_burger_1795056340276.jpg"
                alt="The JUST BURGER Gold double smashed beef burger"
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/15 to-transparent" />
              <div className="absolute bottom-6 left-6 right-6 flex items-end justify-between gap-4 text-white">
                <div>
                  <p className="text-xs font-semibold text-[#FFC928] uppercase tracking-wider">
                    House Favorite · Limited Batch Sauce
                  </p>
                  <p className="font-display text-2xl font-bold mt-1">The JUST BURGER Gold</p>
                </div>
                <button
                  onClick={() => navigate('/menu')}
                  className="px-4 py-2 rounded-lg bg-[#FFC928] text-[#171717] text-xs font-bold hover:bg-amber-300 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Explore Menu
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 2. FEATURED CATEGORIES */}
      <section className="bg-[#FFF8ED] border-y border-amber-100 py-14">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex items-end justify-between gap-4 mb-8">
            <div>
              <h2 className="font-display text-2xl sm:text-3xl font-bold text-[#171717]">
                Explore by Category
              </h2>
              <p className="text-sm text-neutral-600 mt-1">
                From smashed double classics to thick salted caramel shakes.
              </p>
            </div>
            <button
              onClick={() => navigate('/menu')}
              className="text-sm font-semibold text-[#D62828] hover:underline whitespace-nowrap shrink-0 cursor-pointer"
            >
              View Full Menu →
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
            {(data?.categories ?? []).map((cat) => (
              <button
                key={cat.id}
                onClick={() => navigate(`/menu?category=${encodeURIComponent(cat.slug)}`)}
                className="group text-left bg-white rounded-xl overflow-hidden border border-amber-200/60 hover:border-[#D62828] transition-all duration-200 hover:-translate-y-0.5 cursor-pointer"
              >
                <div className="aspect-[4/3] overflow-hidden bg-neutral-100">
                  <ProductImage
                    src={cat.imageUrl}
                    alt={cat.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                </div>
                <div className="p-3">
                  <h3 className="font-display font-bold text-sm text-[#171717] group-hover:text-[#D62828] truncate">
                    {cat.name}
                  </h3>
                </div>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* 3. BEST SELLERS */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 py-16">
        <div className="flex items-end justify-between gap-4 mb-8">
          <div>
            <h2 className="font-display text-2xl sm:text-3xl font-bold text-[#171717]">
              Best Sellers
            </h2>
            <p className="text-sm text-neutral-600 mt-1">
              Most-ordered favorites crafted fresh on our flat-top grills.
            </p>
          </div>
          <button
            onClick={() => navigate('/menu?filter=best-sellers')}
            className="text-sm font-semibold text-[#D62828] hover:underline whitespace-nowrap shrink-0 cursor-pointer"
          >
            All Best Sellers →
          </button>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map((n) => (
              <div key={n} className="h-96 rounded-2xl bg-neutral-100 animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {(data?.bestSellers ?? []).map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        )}
      </section>

      {/* 4. SIGNATURE COLLECTION (DARK SECTION) */}
      <section className="bg-[#171717] text-white py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-10">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-[#FFC928] mb-2">
                Chef-Crafted Series
              </p>
              <h2 className="font-display text-2xl sm:text-3xl font-bold text-white">
                The Signature Collection
              </h2>
            </div>
            <button
              onClick={() => navigate('/combo-builder')}
              className="px-4 py-2.5 rounded-lg bg-[#FFC928] text-[#171717] text-xs font-bold hover:bg-amber-300 transition-colors self-start sm:self-auto whitespace-nowrap shrink-0 cursor-pointer"
            >
              Build a Signature Combo (Save 10%)
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {(data?.signatureCollection ?? []).map((product) => (
              <ProductCard key={product.id} product={product} dark />
            ))}
          </div>
        </div>
      </section>

      {/* 5. SPECIAL OFFERS & PROMOTIONS */}
      {data?.promotions && data.promotions.length > 0 && (
        <section className="max-w-7xl mx-auto px-4 sm:px-6 py-16">
          <div className="mb-8">
            <h2 className="font-display text-2xl sm:text-3xl font-bold text-[#171717]">
              Special Offers & Promo Codes
            </h2>
            <p className="text-sm text-neutral-600 mt-1">
              Apply these active codes directly in your shopping bag at checkout.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {data.promotions.map((promo) => (
              <div
                key={promo.id}
                className="rounded-2xl border border-neutral-200 bg-[#FFF8ED] p-6 flex flex-col justify-between gap-4"
              >
                <div>
                  <div className="flex items-center justify-between gap-2 text-xs text-neutral-600 mb-2">
                    <span className="inline-flex items-center gap-1.5 font-semibold text-[#D62828]">
                      <Tag className="w-3.5 h-3.5" />
                      Active Offer
                    </span>
                    {promo.minOrderCents > 0 && (
                      <span>Min. {formatMoney(promo.minOrderCents, currencySymbol)}</span>
                    )}
                  </div>
                  <h3 className="font-display text-xl font-bold text-[#171717]">{promo.title}</h3>
                  <p className="text-sm text-neutral-600 mt-1.5">{promo.description}</p>
                </div>

                <div className="pt-4 border-t border-amber-200/70 flex items-center justify-between gap-3">
                  <code className="font-mono text-sm font-bold text-[#171717] bg-white px-3 py-1.5 rounded-lg border border-amber-200">
                    {promo.code}
                  </code>
                  <button
                    onClick={() => {
                      navigator.clipboard?.writeText(promo.code);
                      showToast(`Code ${promo.code} copied — apply it in your bag!`, 'success');
                      navigate('/menu');
                    }}
                    className="text-xs font-semibold text-[#D62828] hover:underline cursor-pointer"
                  >
                    Copy & Order →
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 6. WHY CHOOSE JUST BURGER & HOW IT WORKS */}
      <section className="border-t border-neutral-200 bg-neutral-50 py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 space-y-16">
          <div>
            <h2 className="font-display text-2xl sm:text-3xl font-bold text-[#171717] mb-8">
              Why Choose JUST BURGER
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {[
                {
                  icon: Flame,
                  title: 'Delicious Food',
                  desc: 'Seared crust Angus patties, aged cheddar, and toasted brioche made fresh.',
                },
                {
                  icon: Check,
                  title: 'Convenient Ordering',
                  desc: 'Customize every topping, build custom combos, and reorder favorites in seconds.',
                },
                {
                  icon: ShieldCheck,
                  title: 'Freshly Prepared',
                  desc: 'Every burger hits the flat-top grill only after your order is confirmed.',
                },
                {
                  icon: Truck,
                  title: 'Easy Pickup & Delivery',
                  desc: 'Choose branch pickup or doorstep delivery with live kitchen tracking.',
                },
              ].map((item) => (
                <div
                  key={item.title}
                  className="bg-white rounded-2xl border border-neutral-200 p-6 space-y-3"
                >
                  <div className="w-10 h-10 rounded-xl bg-[#FFF8ED] text-[#D62828] flex items-center justify-center">
                    <item.icon className="w-5 h-5" />
                  </div>
                  <h3 className="font-display font-bold text-base text-[#171717]">{item.title}</h3>
                  <p className="text-sm text-neutral-600 leading-relaxed">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h2 className="font-display text-2xl sm:text-3xl font-bold text-[#171717] mb-8">
              How It Works
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {[
                { step: '01.', title: 'Browse the Menu', desc: 'Filter classics, signature burgers, shakes, and sides.' },
                { step: '02.', title: 'Choose Your Favorites', desc: 'Customize toppings, sauces, or build a custom combo.' },
                { step: '03.', title: 'Place Your Order', desc: 'Pick your branch, select pickup or delivery, and pay securely.' },
                { step: '04.', title: 'Enjoy Your Meal', desc: 'Track your burger live from grill to pickup counter or door.' },
              ].map((s) => (
                <div key={s.step} className="pt-4 border-t-2 border-[#171717]">
                  <span className="font-mono text-xs font-bold text-[#D62828]">{s.step}</span>
                  <h3 className="font-display font-bold text-lg text-[#171717] mt-1">{s.title}</h3>
                  <p className="text-sm text-neutral-600 mt-1.5">{s.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* 7. CUSTOMER REVIEWS */}
      {data?.reviews && data.reviews.length > 0 && (
        <section className="max-w-7xl mx-auto px-4 sm:px-6 py-16">
          <div className="mb-8">
            <h2 className="font-display text-2xl sm:text-3xl font-bold text-[#171717]">
              Verified Guest Reviews
            </h2>
            <p className="text-sm text-neutral-600 mt-1">
              Real feedback from JUST BURGER diners across our branches.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {data.reviews.slice(0, 3).map((rev) => (
              <div key={rev.id} className="rounded-2xl border border-neutral-200 p-6 bg-white flex flex-col justify-between gap-4">
                <div>
                  <div className="flex items-center gap-1 text-[#FFC928] mb-3">
                    {Array.from({ length: rev.rating }).map((_, idx) => (
                      <Star key={idx} className="w-4 h-4 fill-[#FFC928] text-[#FFC928]" />
                    ))}
                  </div>
                  {rev.title && (
                    <h3 className="font-display font-bold text-base text-[#171717] mb-1.5">
                      {rev.title}
                    </h3>
                  )}
                  <p className="text-sm text-neutral-600 leading-relaxed">{rev.comment}</p>
                </div>
                <div className="pt-3 border-t border-neutral-100 text-xs text-neutral-500 flex items-center justify-between">
                  <span className="font-semibold text-[#171717]">{rev.authorName}</span>
                  <span>
                    {rev.productName}
                    {rev.isVerifiedPurchase ? ' · Verified Order' : ''}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 8. NEWSLETTER */}
      <section className="bg-[#D62828] text-white py-14">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 text-center">
          <h2 className="font-display text-2xl sm:text-3xl font-bold">
            Get Fresh Drops & Secret Menu Offers
          </h2>
          <p className="text-sm text-red-100 mt-2 max-w-xl mx-auto">
            Join the JUST BURGER list for seasonal burger releases, double-point weekends, and
            exclusive promo codes.
          </p>
          <form
            onSubmit={handleNewsletterSubmit}
            className="mt-6 flex flex-col sm:flex-row gap-3 max-w-md mx-auto"
          >
            <input
              type="email"
              required
              value={newsletterEmail}
              onChange={(e) => setNewsletterEmail(e.target.value)}
              placeholder="Enter your email address"
              className="flex-1 px-4 py-3 rounded-xl bg-white text-[#171717] text-sm placeholder:text-neutral-400 focus:outline-none"
            />
            <button
              type="submit"
              disabled={subscribing}
              className="px-6 py-3 rounded-xl bg-[#171717] hover:bg-neutral-800 text-[#FFC928] font-semibold text-sm transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {subscribing ? 'Joining...' : 'Join List'}
            </button>
          </form>
        </div>
      </section>
    </div>
  );
};
