import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Check, Minus, Plus, ShoppingBag, Star } from 'lucide-react';
import { useApp } from '../context/AppContext.tsx';
import { apiFetch, formatMoney } from '../lib/api.ts';
import { Product, ProductCustomization, ReviewItem } from '../types.ts';
import { ProductImage } from '../components/ProductImage.tsx';

export const ProductDetailPage: React.FC<{ productId: number }> = ({ productId }) => {
  const { navigate, addToCart, currencySymbol, user, showToast } = useApp();
  const [product, setProduct] = useState<Product | null>(null);
  const [reviews, setReviews] = useState<ReviewItem[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [quantity, setQuantity] = useState(1);
  const [instructions, setInstructions] = useState('');
  const [adding, setAdding] = useState(false);

  // Review form
  const [revRating, setRevRating] = useState(5);
  const [revTitle, setRevTitle] = useState('');
  const [revComment, setRevComment] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);

  const loadProduct = () => {
    setLoading(true);
    apiFetch<{ product: Product; reviews: ReviewItem[] }>(`/api/products/${productId}`)
      .then((res) => {
        setProduct(res.product);
        setReviews(res.reviews);
        const defaults = new Set<number>();
        for (const opt of res.product.options ?? []) {
          for (const cust of opt.customizations) {
            if (cust.isDefault && cust.isAvailable) defaults.add(cust.id);
          }
        }
        setSelectedIds(defaults);
      })
      .catch(() => showToast('Unable to load product details.', 'error'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadProduct();
  }, [productId]);

  const toggleCustomization = (cust: ProductCustomization, maxSelections: number, groupIds: number[]) => {
    if (!cust.isAvailable) return;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(cust.id)) {
        next.delete(cust.id);
      } else {
        const currentInGroup = groupIds.filter((id) => next.has(id));
        if (currentInGroup.length >= maxSelections && maxSelections === 1) {
          for (const gid of currentInGroup) next.delete(gid);
        } else if (currentInGroup.length >= maxSelections) {
          showToast(`Maximum ${maxSelections} selections in this group.`, 'info');
          return prev;
        }
        next.add(cust.id);
      }
      return next;
    });
  };

  const { extrasCents, unitPriceCents, totalCents, caloriesTotal } = useMemo(() => {
    if (!product) return { extrasCents: 0, unitPriceCents: 0, totalCents: 0, caloriesTotal: 0 };
    let extras = 0;
    let calExtra = 0;
    for (const opt of product.options ?? []) {
      for (const c of opt.customizations) {
        if (selectedIds.has(c.id)) {
          extras += c.priceDeltaCents;
          calExtra += c.caloriesDelta;
        }
      }
    }
    const unit = product.priceCents + extras;
    return {
      extrasCents: extras,
      unitPriceCents: unit,
      totalCents: unit * quantity,
      caloriesTotal: product.calories + calExtra,
    };
  }, [product, selectedIds, quantity]);

  const handleAdd = async () => {
    if (!product || !product.isAvailable) return;
    setAdding(true);
    try {
      await addToCart({
        productId: product.id,
        quantity,
        customizationIds: Array.from(selectedIds),
        specialInstructions: instructions,
      });
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Unable to add to cart', 'error');
    } finally {
      setAdding(false);
    }
  };

  const handleSubmitReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      showToast('Please sign in to submit a review.', 'info');
      return;
    }
    setSubmittingReview(true);
    try {
      await apiFetch('/api/reviews', {
        method: 'POST',
        body: JSON.stringify({
          productId,
          rating: revRating,
          title: revTitle,
          comment: revComment,
        }),
      });
      showToast('Thank you! Your verified review is published.', 'success');
      setRevTitle('');
      setRevComment('');
      loadProduct();
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Could not post review', 'error');
    } finally {
      setSubmittingReview(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12">
        <div className="h-[460px] rounded-2xl bg-neutral-100 dark:bg-neutral-800 animate-pulse" />
      </div>
    );
  }

  if (!product) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-20 text-center">
        <h2 className="font-display text-2xl font-bold text-[#171717] dark:text-white">Product not found</h2>
        <button
          onClick={() => navigate('/menu')}
          className="mt-4 px-5 py-2.5 rounded-lg bg-[#D62828] text-white text-sm font-semibold cursor-pointer"
        >
          Back to Menu
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10">
      <button
        onClick={() => navigate('/menu')}
        className="inline-flex items-center gap-2 text-sm font-medium text-neutral-600 dark:text-neutral-400 hover:text-[#171717] dark:hover:text-white mb-6 cursor-pointer"
      >
        <ArrowLeft className="w-4 h-4" />
        <span>Back to Menu</span>
      </button>

      {/* Two-Column Contiguous PDP & Burger Customizer */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
        {/* Left: Sticky Product Photography */}
        <div className="lg:col-span-6 lg:sticky lg:top-24 space-y-4">
          <div className="aspect-[4/3] rounded-2xl overflow-hidden bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-800">
            <ProductImage
              src={product.imageUrl}
              alt={product.name}
              className="w-full h-full object-cover"
            />
          </div>
          {product.ingredients && (
            <div className="rounded-xl bg-[#FFF8ED] dark:bg-[#191614] border border-amber-200/70 dark:border-neutral-800 p-4">
              <p className="text-xs font-bold uppercase tracking-wider text-neutral-700 dark:text-[#FFC928] mb-1">
                Ingredients
              </p>
              <p className="text-sm text-neutral-700 dark:text-neutral-300 leading-relaxed">{product.ingredients}</p>
            </div>
          )}
        </div>

        {/* Right: Customizer & Purchase Module */}
        <div className="lg:col-span-6 space-y-6">
          <div>
            <div className="flex items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400 mb-2">
              <span>{product.categoryName || 'Menu'}</span>
              <span aria-hidden="true">·</span>
              <span className="tabular-nums">{caloriesTotal} kcal</span>
              {Number(product.ratingAvg) > 0 && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="inline-flex items-center gap-1 font-semibold text-[#171717] dark:text-[#FFC928]">
                    <Star className="w-3.5 h-3.5 fill-[#FFC928] text-[#FFC928]" />
                    {Number(product.ratingAvg).toFixed(1)} ({product.reviewCount})
                  </span>
                </>
              )}
            </div>
            <h1 className="font-display text-3xl sm:text-4xl font-extrabold text-[#171717] dark:text-white">
              {product.name}
            </h1>
            <p className="font-mono text-2xl font-bold text-[#D62828] dark:text-[#FFC928] mt-2 tabular-nums">
              {formatMoney(unitPriceCents, currencySymbol)}
              {extrasCents > 0 && (
                <span className="text-xs font-sans font-medium text-neutral-500 dark:text-neutral-400 ml-2">
                  (Base {formatMoney(product.priceCents, currencySymbol)} +{' '}
                  {formatMoney(extrasCents, currencySymbol)} extras)
                </span>
              )}
            </p>
            <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-3 leading-relaxed">{product.description}</p>
          </div>

          {/* Burger Customization Groups */}
          {product.options && product.options.length > 0 && (
            <div className="space-y-5 pt-4 border-t border-neutral-200 dark:border-neutral-800">
              <h2 className="font-display text-lg font-bold text-[#171717] dark:text-white">
                Customize Your Build
              </h2>
              {product.options.map((opt) => {
                const groupIds = opt.customizations.map((c) => c.id);
                return (
                  <div key={opt.id} className="space-y-2.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-[#171717] dark:text-neutral-200 uppercase tracking-wider">
                        {opt.groupName}
                      </span>
                      <span className="text-neutral-500 dark:text-neutral-400">Up to {opt.maxSelections}</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {opt.customizations.map((cust) => {
                        const checked = selectedIds.has(cust.id);
                        return (
                          <button
                            key={cust.id}
                            type="button"
                            disabled={!cust.isAvailable}
                            onClick={() =>
                              toggleCustomization(cust, opt.maxSelections, groupIds)
                            }
                            className={`flex items-center justify-between gap-2 px-3.5 py-2.5 rounded-xl border text-left text-sm transition-all ${
                              !cust.isAvailable
                                ? 'bg-neutral-100 dark:bg-neutral-900 border-neutral-200 dark:border-neutral-800 text-neutral-400 dark:text-neutral-600 cursor-not-allowed opacity-70'
                                : checked
                                  ? 'bg-[#FFF8ED] dark:bg-[#231B16] border-[#D62828] text-[#171717] dark:text-white font-medium cursor-pointer'
                                  : 'bg-white dark:bg-[#1A1A1A] border-neutral-200 dark:border-neutral-800 hover:border-neutral-400 dark:hover:border-neutral-600 text-[#171717] dark:text-neutral-200 cursor-pointer'
                            }`}
                          >
                            <span className="flex items-center gap-2 min-w-0">
                              <span
                                className={`w-4 h-4 rounded flex items-center justify-center shrink-0 border ${
                                  checked
                                    ? 'bg-[#D62828] border-[#D62828] text-white'
                                    : 'border-neutral-300 dark:border-neutral-600 bg-white dark:bg-[#121212]'
                                }`}
                              >
                                {checked && <Check className="w-3 h-3" />}
                              </span>
                              <span className="truncate">{cust.name}</span>
                            </span>
                            <span className="font-mono text-xs shrink-0 tabular-nums">
                              {!cust.isAvailable
                                ? 'Unavailable'
                                : cust.priceDeltaCents > 0
                                  ? `+${formatMoney(cust.priceDeltaCents, currencySymbol)}`
                                  : 'Included'}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Special Kitchen Instructions */}
          <div className="pt-2">
            <label className="block text-xs font-bold uppercase tracking-wider text-neutral-700 dark:text-neutral-300 mb-1.5">
              Kitchen Notes (Optional)
            </label>
            <input
              type="text"
              maxLength={200}
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="e.g. No onions, cut burger in half, extra crispy..."
              className="w-full px-3.5 py-2.5 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-[#141414] text-sm text-[#171717] dark:text-neutral-100 placeholder:text-neutral-400 dark:placeholder:text-neutral-500 focus:outline-none focus:border-[#D62828]"
            />
          </div>

          {/* Quantity + Add to Cart Bar */}
          <div className="pt-4 border-t border-neutral-200 dark:border-neutral-800 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <div className="inline-flex items-center justify-between border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-[#1A1A1A] rounded-xl px-2 py-1.5 sm:w-36">
              <button
                type="button"
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                aria-label="Decrease quantity"
                className="p-2 text-neutral-600 dark:text-neutral-300 hover:text-[#171717] dark:hover:text-white cursor-pointer"
              >
                <Minus className="w-4 h-4" />
              </button>
              <span className="font-mono font-bold text-base tabular-nums text-[#171717] dark:text-white">{quantity}</span>
              <button
                type="button"
                onClick={() => setQuantity((q) => Math.min(50, q + 1))}
                aria-label="Increase quantity"
                className="p-2 text-neutral-600 dark:text-neutral-300 hover:text-[#171717] dark:hover:text-white cursor-pointer"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>

            <button
              type="button"
              disabled={!product.isAvailable || adding}
              onClick={handleAdd}
              className="flex-1 py-3.5 px-6 rounded-xl bg-[#D62828] hover:bg-[#B51E1E] disabled:bg-neutral-300 dark:disabled:bg-neutral-700 text-white font-semibold text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <ShoppingBag className="w-4 h-4" />
              <span>
                {product.isAvailable
                  ? adding
                    ? 'Adding...'
                    : `Add to Cart · ${formatMoney(totalCents, currencySymbol)}`
                  : 'Currently Sold Out'}
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* Reviews & Verified Purchase Feedback */}
      <section className="mt-16 pt-12 border-t border-neutral-200 dark:border-neutral-800 grid grid-cols-1 lg:grid-cols-12 gap-10">
        <div className="lg:col-span-7 space-y-4">
          <h2 className="font-display text-2xl font-bold text-[#171717] dark:text-white">
            Customer Reviews ({reviews.length})
          </h2>
          {reviews.length === 0 ? (
            <p className="text-sm text-neutral-500 dark:text-neutral-400 py-6">
              No reviews yet. Order this item to leave the first verified review!
            </p>
          ) : (
            <div className="space-y-4">
              {reviews.map((r) => (
                <div key={r.id} className="rounded-xl border border-neutral-200 dark:border-neutral-800 p-5 bg-white dark:bg-[#1A1A1A]">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-1">
                      {Array.from({ length: r.rating }).map((_, i) => (
                        <Star key={i} className="w-3.5 h-3.5 fill-[#FFC928] text-[#FFC928]" />
                      ))}
                    </div>
                    <span className="text-xs text-neutral-500 dark:text-neutral-400">
                      {new Date(r.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  {r.title && <h3 className="font-semibold text-sm text-[#171717] dark:text-white">{r.title}</h3>}
                  <p className="text-sm text-neutral-600 dark:text-neutral-300 mt-1">{r.comment}</p>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-3">
                    {r.authorName}
                    {r.isVerifiedPurchase ? ' · Verified Purchase' : ''}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="lg:col-span-5">
          <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-[#FFF8ED] dark:bg-[#191614] p-6">
            <h3 className="font-display text-lg font-bold text-[#171717] dark:text-white">Write a Review</h3>
            <p className="text-xs text-neutral-600 dark:text-neutral-400 mt-1 mb-4">
              Verified reviews can be submitted once you have a completed order containing this item.
            </p>
            <form onSubmit={handleSubmitReview} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">Rating</label>
                <div className="flex items-center gap-1.5">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      onClick={() => setRevRating(star)}
                      className="p-1 cursor-pointer"
                    >
                      <Star
                        className={`w-5 h-5 ${
                          star <= revRating
                            ? 'fill-[#FFC928] text-[#FFC928]'
                            : 'text-neutral-300 dark:text-neutral-600'
                        }`}
                      />
                    </button>
                  ))}
                </div>
              </div>
              <input
                type="text"
                value={revTitle}
                onChange={(e) => setRevTitle(e.target.value)}
                placeholder="Headline (e.g. Best smash burger!)"
                className="w-full px-3.5 py-2.5 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-[#121212] text-sm text-[#171717] dark:text-neutral-100 placeholder:text-neutral-400 dark:placeholder:text-neutral-500"
              />
              <textarea
                rows={3}
                required
                value={revComment}
                onChange={(e) => setRevComment(e.target.value)}
                placeholder="Share your experience with the flavor, temperature, and prep..."
                className="w-full px-3.5 py-2.5 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-[#121212] text-sm text-[#171717] dark:text-neutral-100 placeholder:text-neutral-400 dark:placeholder:text-neutral-500"
              />
              <button
                type="submit"
                disabled={submittingReview}
                className="w-full py-2.5 px-4 rounded-xl bg-[#171717] dark:bg-[#D62828] hover:bg-neutral-800 dark:hover:bg-[#B51E1E] text-white text-sm font-semibold cursor-pointer"
              >
                {submittingReview ? 'Submitting...' : 'Post Verified Review'}
              </button>
            </form>
          </div>
        </div>
      </section>
    </div>
  );
};
