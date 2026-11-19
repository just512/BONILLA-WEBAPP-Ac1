import React, { useEffect, useState } from 'react';
import { getDownloadURL, ref, uploadBytesResumable } from 'firebase/storage';
import { Plus, Trash2, Upload } from 'lucide-react';
import { apiFetch, formatMoney } from '../../lib/api.ts';
import { auth, storage } from '../../lib/firebase.ts';
import { useApp } from '../../context/AppContext.tsx';
import { Category, Product } from '../../types.ts';
import { ProductImage } from '../ProductImage.tsx';

export const AdminProductsTab: React.FC<{ view: 'products' | 'categories' }> = ({ view }) => {
  const { currencySymbol, showToast } = useApp();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  // Add / Edit Product State
  const [editingId, setEditingId] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [categoryId, setCategoryId] = useState<number>(1);
  const [priceDollars, setPriceDollars] = useState('10.99');
  const [description, setDescription] = useState('');
  const [ingredients, setIngredients] = useState('');
  const [imageUrl, setImageUrl] = useState('/src/assets/images/classic_smash_burger_1795056342466.jpg');
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [isFeatured, setIsFeatured] = useState(false);
  const [isBestSeller, setIsBestSeller] = useState(false);
  const [isSignature, setIsSignature] = useState(false);
  const [isComboEligible, setIsComboEligible] = useState(true);
  const [comboRole, setComboRole] = useState<string>('burger');

  // Option / Customization Add State
  const [optionProdId, setOptionProdId] = useState<number | null>(null);
  const [optGroup, setOptGroup] = useState('Extra Patty & Protein');
  const [optName, setOptName] = useState('');
  const [optPriceDollars, setOptPriceDollars] = useState('1.50');

  // Category Form State
  const [catName, setCatName] = useState('');
  const [catDesc, setCatDesc] = useState('');
  const [catImageUrl, setCatImageUrl] = useState('/src/assets/images/classic_smash_burger_1795056342466.jpg');
  const [catUploadProgress, setCatUploadProgress] = useState<number | null>(null);

  const loadData = () => {
    setLoading(true);
    apiFetch<{ products: Product[]; categories: Category[] }>('/api/admin/products')
      .then((res) => {
        setProducts(res.products);
        setCategories(res.categories);
        if (res.categories[0] && !categoryId) setCategoryId(res.categories[0].id);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadData();
  }, []);

  const uploadToFirebaseStorage = async (
    file: File,
    folder: 'products' | 'categories',
    onProgress: (pct: number | null) => void
  ): Promise<string | null> => {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      showToast('Only JPEG, PNG, and WebP images are permitted.', 'error');
      return null;
    }
    if (file.size > 2 * 1024 * 1024) {
      showToast('Max upload size is 2MB.', 'error');
      return null;
    }
    if (!auth.currentUser) {
      showToast(
        'Please sign in using Firebase Email/Password or Google so Firebase Storage can authorize your upload.',
        'error'
      );
      return null;
    }

    const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
    const cleanBase = file.name.replace(/\.[^/.]+$/, '').replace(/[^a-z0-9]/gi, '_').slice(0, 30) || 'image';
    const storagePath = `${folder}/${Date.now()}_${cleanBase}.${ext}`;
    const storageRef = ref(storage, storagePath);

    onProgress(0);
    try {
      const downloadUrl = await new Promise<string>((resolve, reject) => {
        const uploadTask = uploadBytesResumable(storageRef, file, {
          contentType: file.type,
        });
        uploadTask.on(
          'state_changed',
          (snapshot) => {
            if (snapshot.totalBytes > 0) {
              const pct = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
              onProgress(pct);
            }
          },
          (error) => reject(error),
          async () => {
            const url = await getDownloadURL(uploadTask.snapshot.ref);
            resolve(url);
          }
        );
      });
      showToast('Image uploaded to Firebase Storage!', 'success');
      return downloadUrl;
    } catch (err: unknown) {
      const code =
        typeof err === 'object' && err !== null && 'code' in err
          ? String((err as { code?: unknown }).code)
          : '';
      if (code === 'storage/unauthorized') {
        showToast(
          'Firebase Storage blocked upload (storage/unauthorized). Publish Storage rules allowing authenticated writes.',
          'error'
        );
      } else {
        showToast(err instanceof Error ? err.message : 'Firebase Storage upload failed', 'error');
      }
      return null;
    } finally {
      onProgress(null);
    }
  };

  const handleProductFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    const url = await uploadToFirebaseStorage(file, 'products', setUploadProgress);
    if (url) setImageUrl(url);
  };

  const handleCategoryFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    const url = await uploadToFirebaseStorage(file, 'categories', setCatUploadProgress);
    if (url) setCatImageUrl(url);
  };

  const resetForm = () => {
    setEditingId(null);
    setName('');
    setPriceDollars('10.99');
    setDescription('');
    setIngredients('');
    setImageUrl('/src/assets/images/classic_smash_burger_1795056342466.jpg');
    setIsFeatured(false);
    setIsBestSeller(false);
    setIsSignature(false);
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (uploadProgress !== null) {
      showToast('Please wait for image upload to finish.', 'info');
      return;
    }
    const priceCents = Math.round(Number(priceDollars) * 100);
    if (!Number.isFinite(priceCents) || priceCents < 0) {
      showToast('Enter a valid price.', 'error');
      return;
    }
    try {
      const payload = {
        name,
        categoryId,
        priceCents,
        description,
        ingredients,
        imageUrl,
        isFeatured,
        isBestSeller,
        isSignature,
        isComboEligible,
        comboRole: isComboEligible ? comboRole : null,
      };
      if (editingId) {
        await apiFetch(`/api/admin/products/${editingId}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
        showToast('Product updated.', 'success');
      } else {
        await apiFetch('/api/admin/products', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        showToast('Product created.', 'success');
      }
      resetForm();
      loadData();
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Save failed', 'error');
    }
  };

  const handleToggleProductField = async (p: Product, field: keyof Product) => {
    try {
      await apiFetch(`/api/admin/products/${p.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ [field]: !p[field] }),
      });
      loadData();
    } catch {
      showToast('Failed to update product flag.', 'error');
    }
  };

  const handleDeleteProduct = async (id: number) => {
    try {
      await apiFetch(`/api/admin/products/${id}`, { method: 'DELETE' });
      showToast('Product deleted.', 'info');
      loadData();
    } catch {
      showToast('Could not delete product.', 'error');
    }
  };

  const handleAddOption = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!optionProdId) return;
    try {
      await apiFetch(`/api/admin/products/${optionProdId}/options`, {
        method: 'POST',
        body: JSON.stringify({
          groupName: optGroup,
          customizationName: optName,
          priceDeltaCents: Math.round(Number(optPriceDollars) * 100),
          isAvailable: true,
        }),
      });
      setOptName('');
      showToast('Customization option added.', 'success');
      loadData();
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Failed to add option', 'error');
    }
  };

  const handleToggleCustomization = async (custId: number, current: boolean) => {
    await apiFetch(`/api/admin/customizations/${custId}`, {
      method: 'PATCH',
      body: JSON.stringify({ isAvailable: !current }),
    });
    loadData();
  };

  const handleCreateCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (catUploadProgress !== null) {
      showToast('Please wait for category image upload to finish.', 'info');
      return;
    }
    try {
      await apiFetch('/api/admin/categories', {
        method: 'POST',
        body: JSON.stringify({ name: catName, description: catDesc, imageUrl: catImageUrl }),
      });
      setCatName('');
      setCatDesc('');
      setCatImageUrl('/src/assets/images/classic_smash_burger_1795056342466.jpg');
      showToast('Category created.', 'success');
      loadData();
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Failed to create category', 'error');
    }
  };

  if (loading) return <div className="h-72 rounded-2xl bg-neutral-100 animate-pulse" />;

  if (view === 'categories') {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 space-y-3">
          <h2 className="font-display text-xl font-bold text-[#171717]">Categories</h2>
          {categories.map((c) => (
            <div
              key={c.id}
              className="rounded-xl border border-neutral-200 bg-white p-4 flex items-center justify-between gap-4"
            >
              <div className="flex items-center gap-3">
                <ProductImage
                  src={c.imageUrl}
                  alt={c.name}
                  className="w-11 h-11 rounded-lg object-cover shrink-0 border border-neutral-200"
                />
                <div>
                  <p className="font-semibold text-sm text-[#171717]">{c.name}</p>
                  <p className="text-xs text-neutral-500">{c.description}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={async () => {
                    await apiFetch(`/api/admin/categories/${c.id}`, {
                      method: 'PATCH',
                      body: JSON.stringify({ isActive: !c.isActive }),
                    });
                    loadData();
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
                    c.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-neutral-100 text-neutral-500'
                  }`}
                >
                  {c.isActive ? 'Active' : 'Hidden'}
                </button>
                <button
                  onClick={async () => {
                    await apiFetch(`/api/admin/categories/${c.id}`, { method: 'DELETE' });
                    loadData();
                  }}
                  className="p-1.5 text-neutral-400 hover:text-[#D62828] cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>

        <form
          onSubmit={handleCreateCategory}
          className="lg:col-span-5 rounded-xl border border-neutral-200 bg-white p-6 space-y-4 self-start"
        >
          <h3 className="font-display text-lg font-bold text-[#171717]">Add Category</h3>
          <input
            type="text"
            required
            value={catName}
            onChange={(e) => setCatName(e.target.value)}
            placeholder="Category Name"
            className="w-full px-3.5 py-2.5 rounded-lg border border-neutral-300 text-sm"
          />
          <textarea
            rows={3}
            value={catDesc}
            onChange={(e) => setCatDesc(e.target.value)}
            placeholder="Category description"
            className="w-full px-3.5 py-2.5 rounded-lg border border-neutral-300 text-sm"
          />
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <ProductImage
                src={catImageUrl}
                alt="Category preview"
                className="w-12 h-12 rounded-lg object-cover border border-neutral-200 shrink-0"
              />
              <label className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-neutral-300 text-xs font-semibold cursor-pointer hover:bg-neutral-50">
                <Upload className="w-3.5 h-3.5 text-[#D62828]" />
                <span>
                  {catUploadProgress !== null
                    ? `Uploading ${catUploadProgress}%...`
                    : 'Upload to Firebase Storage'}
                </span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={handleCategoryFileUpload}
                  disabled={catUploadProgress !== null}
                />
              </label>
            </div>
            {catUploadProgress !== null && (
              <div className="h-1.5 w-full rounded-full bg-neutral-200 overflow-hidden">
                <div
                  className="h-full bg-[#D62828] transition-all duration-150"
                  style={{ width: `${catUploadProgress}%` }}
                />
              </div>
            )}
            <input
              type="text"
              value={catImageUrl}
              onChange={(e) => setCatImageUrl(e.target.value)}
              placeholder="Or category image URL"
              className="w-full px-3 py-2 rounded-lg border border-neutral-300 text-xs"
            />
          </div>
          <button
            type="submit"
            disabled={catUploadProgress !== null}
            className="w-full py-2.5 rounded-lg bg-[#D62828] disabled:opacity-60 text-white text-xs font-semibold cursor-pointer"
          >
            Create Category
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Add / Edit Product Form */}
      <form
        onSubmit={handleSaveProduct}
        className="rounded-xl border border-neutral-200 bg-white p-6 space-y-4"
      >
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-bold text-[#171717]">
            {editingId ? 'Edit Product' : 'Add New Product'}
          </h2>
          {editingId && (
            <button
              type="button"
              onClick={resetForm}
              className="text-xs font-semibold text-neutral-500 hover:text-[#171717] cursor-pointer"
            >
              Cancel Edit
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Product Name"
            className="px-3.5 py-2.5 rounded-lg border border-neutral-300 text-sm"
          />
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(Number(e.target.value))}
            className="px-3.5 py-2.5 rounded-lg border border-neutral-300 text-sm bg-white"
          >
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <input
            type="number"
            step="0.01"
            min="0"
            required
            value={priceDollars}
            onChange={(e) => setPriceDollars(e.target.value)}
            placeholder="Price ($)"
            className="px-3.5 py-2.5 rounded-lg border border-neutral-300 text-sm font-mono"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <textarea
            rows={2}
            required
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Product description..."
            className="px-3.5 py-2.5 rounded-lg border border-neutral-300 text-sm"
          />
          <textarea
            rows={2}
            value={ingredients}
            onChange={(e) => setIngredients(e.target.value)}
            placeholder="Ingredients list..."
            className="px-3.5 py-2.5 rounded-lg border border-neutral-300 text-sm"
          />
        </div>

        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-4">
            <ProductImage
              src={imageUrl}
              alt="Product preview"
              className="w-12 h-12 rounded-lg object-cover border border-neutral-200 shrink-0"
            />
            <label className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-neutral-300 text-xs font-semibold cursor-pointer hover:bg-neutral-50">
              <Upload className="w-3.5 h-3.5 text-[#D62828]" />
              <span>
                {uploadProgress !== null
                  ? `Uploading ${uploadProgress}%...`
                  : 'Upload to Firebase Storage (JPG/PNG/WebP ≤ 2MB)'}
              </span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={handleProductFileUpload}
                disabled={uploadProgress !== null}
              />
            </label>
            <input
              type="text"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder="Or Firebase Storage / image URL"
              className="flex-1 min-w-[200px] px-3 py-2 rounded-lg border border-neutral-300 text-xs"
            />
          </div>
          {uploadProgress !== null && (
            <div className="h-1.5 w-full rounded-full bg-neutral-200 overflow-hidden">
              <div
                className="h-full bg-[#D62828] transition-all duration-150"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-5 text-xs font-medium text-neutral-700 pt-1">
          <label className="inline-flex items-center gap-1.5 cursor-pointer">
            <input type="checkbox" checked={isFeatured} onChange={(e) => setIsFeatured(e.target.checked)} className="accent-[#D62828]" />
            Featured
          </label>
          <label className="inline-flex items-center gap-1.5 cursor-pointer">
            <input type="checkbox" checked={isBestSeller} onChange={(e) => setIsBestSeller(e.target.checked)} className="accent-[#D62828]" />
            Best Seller
          </label>
          <label className="inline-flex items-center gap-1.5 cursor-pointer">
            <input type="checkbox" checked={isSignature} onChange={(e) => setIsSignature(e.target.checked)} className="accent-[#D62828]" />
            Signature
          </label>
          <label className="inline-flex items-center gap-1.5 cursor-pointer">
            <input type="checkbox" checked={isComboEligible} onChange={(e) => setIsComboEligible(e.target.checked)} className="accent-[#D62828]" />
            Combo Eligible
          </label>
          {isComboEligible && (
            <select
              value={comboRole}
              onChange={(e) => setComboRole(e.target.value)}
              className="border border-neutral-300 rounded-md px-2 py-1 text-xs"
            >
              <option value="burger">Combo Burger</option>
              <option value="side">Combo Side</option>
              <option value="drink">Combo Drink</option>
              <option value="addon">Combo Add-on</option>
            </select>
          )}
        </div>

        <button
          type="submit"
          disabled={uploadProgress !== null}
          className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-lg bg-[#D62828] disabled:opacity-60 text-white text-xs font-semibold cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>{editingId ? 'Save Changes' : 'Add Product'}</span>
        </button>
      </form>

      {/* Product Table */}
      <div className="rounded-xl border border-neutral-200 bg-white overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-neutral-50 text-xs text-neutral-500 border-b border-neutral-200">
              <tr>
                <th className="px-4 py-3 font-semibold">Product</th>
                <th className="px-4 py-3 font-semibold">Price</th>
                <th className="px-4 py-3 font-semibold">Flags</th>
                <th className="px-4 py-3 font-semibold">Availability</th>
                <th className="px-4 py-3 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {products.map((p) => (
                <React.Fragment key={p.id}>
                  <tr className="hover:bg-neutral-50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <ProductImage src={p.imageUrl} alt={p.name} className="w-11 h-11 rounded-lg object-cover shrink-0" />
                        <div>
                          <p className="font-semibold text-[#171717]">{p.name}</p>
                          <p className="text-xs text-neutral-500">
                            {categories.find((c) => c.id === p.categoryId)?.name || 'Menu'}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono font-semibold tabular-nums">
                      {formatMoney(p.priceCents, currencySymbol)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1.5 text-xs">
                        <button
                          onClick={() => handleToggleProductField(p, 'isFeatured')}
                          className={`px-2 py-0.5 rounded border cursor-pointer ${
                            p.isFeatured ? 'border-[#171717] bg-[#FFF8ED] font-semibold' : 'border-neutral-200 text-neutral-400'
                          }`}
                        >
                          Featured
                        </button>
                        <button
                          onClick={() => handleToggleProductField(p, 'isBestSeller')}
                          className={`px-2 py-0.5 rounded border cursor-pointer ${
                            p.isBestSeller ? 'border-[#D62828] bg-red-50 text-[#D62828] font-semibold' : 'border-neutral-200 text-neutral-400'
                          }`}
                        >
                          Best Seller
                        </button>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => handleToggleProductField(p, 'isAvailable')}
                        className={`px-2.5 py-1 rounded text-xs font-semibold cursor-pointer ${
                          p.isAvailable ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-[#D62828]'
                        }`}
                      >
                        {p.isAvailable ? 'Available' : 'Sold Out'}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-right space-x-2">
                      <button
                        onClick={() => setOptionProdId(optionProdId === p.id ? null : p.id)}
                        className="text-xs font-semibold text-neutral-700 hover:underline cursor-pointer"
                      >
                        Options ({p.options?.length ?? 0})
                      </button>
                      <button
                        onClick={() => {
                          setEditingId(p.id);
                          setName(p.name);
                          setCategoryId(p.categoryId || 1);
                          setPriceDollars((p.priceCents / 100).toFixed(2));
                          setDescription(p.description);
                          setIngredients(p.ingredients);
                          setImageUrl(p.imageUrl);
                          setIsFeatured(p.isFeatured);
                          setIsBestSeller(p.isBestSeller);
                          setIsSignature(p.isSignature);
                          setIsComboEligible(p.isComboEligible);
                          setComboRole(p.comboRole || 'burger');
                        }}
                        className="text-xs font-semibold text-[#D62828] hover:underline cursor-pointer"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDeleteProduct(p.id)}
                        className="text-xs font-semibold text-neutral-400 hover:text-[#D62828] cursor-pointer"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                  {optionProdId === p.id && (
                    <tr>
                      <td colSpan={5} className="bg-neutral-50 px-6 py-4 border-t border-neutral-200">
                        <div className="space-y-3">
                          <p className="text-xs font-bold uppercase tracking-wider text-[#171717]">
                            Customizations for {p.name}
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {(p.options ?? []).flatMap((o) =>
                              o.customizations.map((c) => (
                                <button
                                  key={c.id}
                                  onClick={() => handleToggleCustomization(c.id, c.isAvailable)}
                                  className={`px-3 py-1.5 rounded-lg border text-xs cursor-pointer ${
                                    c.isAvailable
                                      ? 'bg-white border-neutral-300 text-[#171717]'
                                      : 'bg-red-50 border-red-200 text-[#D62828] line-through'
                                  }`}
                                >
                                  {o.groupName}: {c.name} (+{formatMoney(c.priceDeltaCents, currencySymbol)})
                                </button>
                              ))
                            )}
                          </div>
                          <form onSubmit={handleAddOption} className="flex flex-wrap gap-2 pt-2">
                            <input
                              type="text"
                              required
                              value={optGroup}
                              onChange={(e) => setOptGroup(e.target.value)}
                              placeholder="Group (e.g. Cheese Selection)"
                              className="px-3 py-1.5 rounded-lg border border-neutral-300 bg-white text-xs"
                            />
                            <input
                              type="text"
                              required
                              value={optName}
                              onChange={(e) => setOptName(e.target.value)}
                              placeholder="Option name (e.g. Smoked Gouda)"
                              className="px-3 py-1.5 rounded-lg border border-neutral-300 bg-white text-xs"
                            />
                            <input
                              type="number"
                              step="0.01"
                              value={optPriceDollars}
                              onChange={(e) => setOptPriceDollars(e.target.value)}
                              placeholder="Extra $"
                              className="w-24 px-3 py-1.5 rounded-lg border border-neutral-300 bg-white text-xs font-mono"
                            />
                            <button
                              type="submit"
                              className="px-3.5 py-1.5 rounded-lg bg-[#171717] text-white text-xs font-semibold cursor-pointer"
                            >
                              Add Option
                            </button>
                          </form>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
