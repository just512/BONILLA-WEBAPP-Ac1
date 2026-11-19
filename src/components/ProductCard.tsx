import React, { useState } from 'react';
import { Heart, Plus, Star } from 'lucide-react';
import { Product } from '../types.ts';
import { useApp } from '../context/AppContext.tsx';
import { apiFetch, formatMoney } from '../lib/api.ts';
import { ProductImage } from './ProductImage.tsx';

interface ProductCardProps {
  product: Product;
  layout?: 'grid' | 'list';
  dark?: boolean;
  isFavorited?: boolean;
  onFavoriteToggle?: (productId: number, next: boolean) => void;
}

export const ProductCard: React.FC<ProductCardProps> = ({
  product,
  layout = 'grid',
  dark = false,
  isFavorited = false,
  onFavoriteToggle,
}) => {
  const { navigate, addToCart, currencySymbol, user, showToast } = useApp();
  const [adding, setAdding] = useState(false);

  const handleQuickAdd = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!product.isAvailable) return;
    setAdding(true);
    try {
      await addToCart({ productId: product.id, quantity: 1, customizationIds: [] });
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Unable to add item', 'error');
    } finally {
      setAdding(false);
    }
  };

  const handleFavorite = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user) {
      showToast('Sign in to save favorite burgers.', 'info');
      return;
    }
    try {
      const res = await apiFetch<{ favorited: boolean }>(`/api/account/favorites/${product.id}`, {
        method: 'POST',
      });
      onFavoriteToggle?.(product.id, res.favorited);
      showToast(res.favorited ? 'Saved to favorites.' : 'Removed from favorites.', 'success');
    } catch {
      showToast('Unable to update favorite.', 'error');
    }
  };

  const rating = Number(product.ratingAvg || 0);

  if (layout === 'list') {
    return (
      <article
        onClick={() => navigate(`/product/${product.id}`)}
        className="group flex flex-col sm:flex-row gap-5 p-4 rounded-2xl border border-neutral-200 bg-white hover:shadow-md transition-all duration-200 cursor-pointer"
      >
        <div className="sm:w-52 aspect-[4/3] rounded-xl overflow-hidden bg-neutral-100 shrink-0">
          <ProductImage
            src={product.imageUrl}
            alt={product.name}
            className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-300"
          />
        </div>
        <div className="flex-1 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-2 text-xs text-neutral-500 mb-1">
              <span>
                {product.categoryName || 'Menu'} · {product.calories} kcal
                {product.isBestSeller ? ' · Best Seller' : product.isNewArrival ? ' · New' : ''}
              </span>
              {rating > 0 && (
                <span className="inline-flex items-center gap-1 font-medium text-[#171717] tabular-nums">
                  <Star className="w-3.5 h-3.5 fill-[#FFC928] text-[#FFC928]" />
                  {rating.toFixed(1)}
                </span>
              )}
            </div>
            <h3 className="font-display text-lg font-bold text-[#171717] group-hover:text-[#D62828] transition-colors">
              {product.name}
            </h3>
            <p className="text-sm text-neutral-600 mt-1.5 line-clamp-2">{product.description}</p>
          </div>
          <div className="mt-4 pt-3 border-t border-neutral-100 flex items-center justify-between gap-3">
            <span className="font-mono text-base font-bold text-[#171717] tabular-nums">
              {formatMoney(product.priceCents, currencySymbol)}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  navigate(`/product/${product.id}`);
                }}
                className="px-3.5 py-2 rounded-lg border border-neutral-300 text-xs font-semibold text-[#171717] hover:bg-neutral-50 cursor-pointer"
              >
                View Details
              </button>
              <button
                onClick={handleQuickAdd}
                disabled={!product.isAvailable || adding}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#D62828] hover:bg-[#B51E1E] disabled:bg-neutral-300 text-white text-xs font-semibold transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{product.isAvailable ? (adding ? 'Adding...' : 'Add to Cart') : 'Sold Out'}</span>
              </button>
            </div>
          </div>
        </div>
      </article>
    );
  }

  return (
    <article
      onClick={() => navigate(`/product/${product.id}`)}
      className={`group flex flex-col rounded-2xl overflow-hidden border transition-all duration-200 hover:-translate-y-0.5 cursor-pointer ${
        dark
          ? 'bg-neutral-900 border-neutral-800 hover:border-neutral-700 text-white'
          : 'bg-white border-neutral-200 hover:shadow-lg text-[#171717]'
      }`}
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-neutral-100">
        <ProductImage
          src={product.imageUrl}
          alt={product.name}
          className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-300"
        />
        {!product.isAvailable && (
          <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
            <span className="text-xs font-bold uppercase tracking-wider text-white bg-[#171717] px-3 py-1.5 rounded-md">
              Currently Sold Out
            </span>
          </div>
        )}
        {onFavoriteToggle && (
          <button
            onClick={handleFavorite}
            aria-label="Toggle favorite"
            className="absolute top-3 right-3 p-2 rounded-full bg-white/90 hover:bg-white text-[#171717] shadow-sm cursor-pointer"
          >
            <Heart className={`w-4 h-4 ${isFavorited ? 'fill-[#D62828] text-[#D62828]' : ''}`} />
          </button>
        )}
      </div>

      <div className="p-5 flex-1 flex flex-col justify-between">
        <div>
          <div
            className={`flex items-center justify-between gap-2 text-xs mb-1.5 ${
              dark ? 'text-neutral-400' : 'text-neutral-500'
            }`}
          >
            <span className="truncate">
              {product.categoryName || 'Menu'}
              {product.isBestSeller ? ' · Best Seller' : product.isSignature ? ' · Signature' : ''}
            </span>
            {rating > 0 && (
              <span
                className={`inline-flex items-center gap-1 font-semibold tabular-nums shrink-0 ${
                  dark ? 'text-[#FFC928]' : 'text-[#171717]'
                }`}
              >
                <Star className="w-3.5 h-3.5 fill-[#FFC928] text-[#FFC928]" />
                {rating.toFixed(1)}
              </span>
            )}
          </div>
          <h3
            className={`font-display text-lg font-bold leading-snug group-hover:text-[#D62828] transition-colors ${
              dark ? 'text-white group-hover:text-[#FFC928]' : 'text-[#171717]'
            }`}
          >
            {product.name}
          </h3>
          <p
            className={`text-sm mt-1.5 line-clamp-2 leading-relaxed ${
              dark ? 'text-neutral-400' : 'text-neutral-600'
            }`}
          >
            {product.description}
          </p>
        </div>

        <div
          className={`mt-5 pt-3.5 border-t flex items-center justify-between gap-3 ${
            dark ? 'border-neutral-800' : 'border-neutral-100'
          }`}
        >
          <span
            className={`font-mono text-base font-bold tabular-nums ${
              dark ? 'text-[#FFC928]' : 'text-[#171717]'
            }`}
          >
            {formatMoney(product.priceCents, currencySymbol)}
          </span>
          <button
            onClick={handleQuickAdd}
            disabled={!product.isAvailable || adding}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              dark
                ? 'bg-[#FFC928] hover:bg-amber-300 text-[#171717]'
                : 'bg-[#D62828] hover:bg-[#B51E1E] text-white disabled:bg-neutral-300'
            }`}
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{product.isAvailable ? (adding ? 'Adding...' : 'Add to Cart') : 'Unavailable'}</span>
          </button>
        </div>
      </div>
    </article>
  );
};
