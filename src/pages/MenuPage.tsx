import React, { useEffect, useState } from 'react';
import { LayoutGrid, List, Search } from 'lucide-react';
import { useApp } from '../context/AppContext.tsx';
import { apiFetch } from '../lib/api.ts';
import { Category, Product } from '../types.ts';
import { ProductCard } from '../components/ProductCard.tsx';

export const MenuPage: React.FC = () => {
  const { route, user } = useApp();
  const params = new URLSearchParams(route.split('?')[1] || '');

  const [search, setSearch] = useState(params.get('search') || '');
  const [category, setCategory] = useState(params.get('category') || 'all');
  const [filter, setFilter] = useState(params.get('filter') || 'all');
  const [sort, setSort] = useState('popular');
  const [availableOnly, setAvailableOnly] = useState(false);
  const [layout, setLayout] = useState<'grid' | 'list'>('grid');

  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [favoriteIds, setFavoriteIds] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const p = new URLSearchParams(route.split('?')[1] || '');
    if (p.get('category')) setCategory(p.get('category')!);
    if (p.get('filter')) setFilter(p.get('filter')!);
  }, [route]);

  useEffect(() => {
    setLoading(true);
    const qs = new URLSearchParams();
    if (search.trim()) qs.set('search', search.trim());
    if (category !== 'all') qs.set('category', category);
    if (filter !== 'all') qs.set('filter', filter);
    if (sort) qs.set('sort', sort);
    if (availableOnly) qs.set('availableOnly', 'true');

    apiFetch<{ products: Product[]; categories: Category[] }>(`/api/products?${qs.toString()}`)
      .then((res) => {
        setProducts(res.products);
        setCategories(res.categories);
      })
      .finally(() => setLoading(false));
  }, [search, category, filter, sort, availableOnly]);

  useEffect(() => {
    if (!user) {
      setFavoriteIds(new Set());
      return;
    }
    apiFetch<{ favorites: Product[] }>('/api/account/favorites')
      .then((res) => setFavoriteIds(new Set(res.favorites.map((f) => f.id))))
      .catch(() => {});
  }, [user]);

  const handleFavoriteToggle = (productId: number, next: boolean) => {
    setFavoriteIds((prev) => {
      const copy = new Set(prev);
      if (next) copy.add(productId);
      else copy.delete(productId);
      return copy;
    });
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10 min-h-[75vh]">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-6 border-b border-neutral-200">
        <div>
          <h1 className="font-display text-3xl sm:text-4xl font-extrabold text-[#171717]">
            Our Food Menu
          </h1>
          <p className="text-sm text-neutral-600 mt-1">
            Browse every burger, combo, side, shake, and dessert. Click any item to customize.
          </p>
        </div>

        {/* Search + Grid/List Switch */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1 sm:w-72">
            <Search className="w-4 h-4 text-neutral-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search burgers, fries, ingredients..."
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-neutral-300 text-sm focus:outline-none focus:border-[#D62828]"
            />
          </div>
          <div className="inline-flex items-center p-1 rounded-xl bg-neutral-100 border border-neutral-200">
            <button
              onClick={() => setLayout('grid')}
              aria-label="Grid layout"
              className={`p-2 rounded-lg cursor-pointer ${
                layout === 'grid' ? 'bg-white shadow-sm text-[#171717]' : 'text-neutral-500'
              }`}
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setLayout('list')}
              aria-label="List layout"
              className={`p-2 rounded-lg cursor-pointer ${
                layout === 'list' ? 'bg-white shadow-sm text-[#171717]' : 'text-neutral-500'
              }`}
            >
              <List className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Category Tabs */}
      <div className="py-5 flex items-center gap-2 overflow-x-auto">
        <button
          onClick={() => setCategory('all')}
          className={`px-4 py-2 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
            category === 'all'
              ? 'bg-[#171717] text-white'
              : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
          }`}
        >
          All Categories
        </button>
        {categories.map((cat) => (
          <button
            key={cat.id}
            onClick={() => setCategory(cat.slug)}
            className={`px-4 py-2 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
              category === cat.slug
                ? 'bg-[#D62828] text-white'
                : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
            }`}
          >
            {cat.name}
          </button>
        ))}
      </div>

      {/* Filters & Sorting Bar */}
      <div className="pb-8 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2">
          {[
            { id: 'all', label: 'All Items' },
            { id: 'best-sellers', label: 'Best Sellers' },
            { id: 'new-arrivals', label: 'New Arrivals' },
            { id: 'featured', label: 'Featured' },
            { id: 'signature', label: 'Signature' },
          ].map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
                filter === f.id
                  ? 'border-[#171717] bg-[#FFF8ED] text-[#171717] font-semibold'
                  : 'border-neutral-200 bg-white text-neutral-600 hover:border-neutral-300'
              }`}
            >
              {f.label}
            </button>
          ))}
          <label className="inline-flex items-center gap-2 ml-2 text-xs font-medium text-neutral-700 cursor-pointer">
            <input
              type="checkbox"
              checked={availableOnly}
              onChange={(e) => setAvailableOnly(e.target.checked)}
              className="accent-[#D62828] rounded"
            />
            In stock only
          </label>
        </div>

        <div className="flex items-center gap-2.5 text-xs">
          <span className="text-neutral-500 font-medium">Sort by</span>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            className="border border-neutral-300 rounded-lg px-3 py-1.5 text-xs font-semibold text-[#171717] bg-white"
          >
            <option value="popular">Popularity</option>
            <option value="price_asc">Price: Low to High</option>
            <option value="price_desc">Price: High to Low</option>
            <option value="newest">New Arrivals</option>
            <option value="rating">Highest Rated</option>
          </select>
        </div>
      </div>

      {/* Product Grid / List */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <div key={n} className="h-96 rounded-2xl bg-neutral-100 animate-pulse" />
          ))}
        </div>
      ) : products.length === 0 ? (
        <div className="text-center py-20 border border-neutral-200 rounded-2xl bg-neutral-50">
          <h3 className="font-display text-xl font-bold text-[#171717]">No matching menu items</h3>
          <p className="text-sm text-neutral-500 mt-1 mb-5">
            Try clearing your search query or switching filters.
          </p>
          <button
            onClick={() => {
              setSearch('');
              setCategory('all');
              setFilter('all');
              setAvailableOnly(false);
            }}
            className="px-5 py-2.5 rounded-lg bg-[#171717] text-white text-xs font-semibold cursor-pointer"
          >
            Reset Filters
          </button>
        </div>
      ) : layout === 'grid' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {products.map((p) => (
            <ProductCard
              key={p.id}
              product={p}
              isFavorited={favoriteIds.has(p.id)}
              onFavoriteToggle={handleFavoriteToggle}
            />
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          {products.map((p) => (
            <ProductCard
              key={p.id}
              product={p}
              layout="list"
              isFavorited={favoriteIds.has(p.id)}
              onFavoriteToggle={handleFavoriteToggle}
            />
          ))}
        </div>
      )}
    </div>
  );
};
