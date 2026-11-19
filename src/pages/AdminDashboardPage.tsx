import React, { useEffect, useState } from 'react';
import {
  BarChart3,
  Boxes,
  ChefHat,
  ClipboardList,
  FolderKanban,
  LayoutDashboard,
  LogOut,
  MapPin,
  MessageSquare,
  Package,
  Settings,
  ShieldAlert,
  Store,
  Tag,
  UserCheck,
  Users,
} from 'lucide-react';
import { useApp } from '../context/AppContext.tsx';
import { BrandLogo } from '../components/BrandLogo.tsx';
import { AdminOverviewTab } from '../components/admin/AdminOverviewTab.tsx';
import { AdminProductsTab } from '../components/admin/AdminProductsTab.tsx';
import { AdminOrdersKitchenTab } from '../components/admin/AdminOrdersKitchenTab.tsx';
import { AdminOperationsTab } from '../components/admin/AdminOperationsTab.tsx';

type AdminSection =
  | 'overview'
  | 'products'
  | 'categories'
  | 'orders'
  | 'kitchen'
  | 'inventory'
  | 'customers'
  | 'promotions'
  | 'branches'
  | 'reviews'
  | 'reports'
  | 'staff'
  | 'settings';

export const AdminDashboardPage: React.FC = () => {
  const { user, authReady, navigate, logout } = useApp();
  const [section, setSection] = useState<AdminSection>('overview');

  useEffect(() => {
    if (authReady && !user) {
      navigate('/auth/signin');
    }
  }, [authReady, user, navigate]);

  if (!authReady) {
    return <div className="min-h-screen bg-neutral-50 flex items-center justify-center text-sm">Loading...</div>;
  }

  if (!user || (user.roleName !== 'admin' && user.roleName !== 'staff')) {
    return (
      <div className="max-w-lg mx-auto px-4 py-20 text-center space-y-4">
        <ShieldAlert className="w-12 h-12 text-[#D62828] mx-auto" />
        <h1 className="font-display text-2xl font-bold text-[#171717]">Access Restricted</h1>
        <p className="text-sm text-neutral-600">
          This administrative dashboard is restricted to authorized JUST BURGER staff and
          administrators.
        </p>
        <button
          onClick={() => navigate('/')}
          className="px-5 py-2.5 rounded-xl bg-[#171717] text-white text-xs font-semibold cursor-pointer"
        >
          Return to Storefront
        </button>
      </div>
    );
  }

  const navItems: Array<{
    id: AdminSection;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
  }> = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'orders', label: 'Orders', icon: ClipboardList },
    { id: 'kitchen', label: 'Kitchen Display', icon: ChefHat },
    { id: 'products', label: 'Products', icon: Package },
    { id: 'categories', label: 'Categories', icon: FolderKanban },
    { id: 'inventory', label: 'Inventory', icon: Boxes },
    { id: 'customers', label: 'Customers', icon: Users },
    { id: 'promotions', label: 'Promotions', icon: Tag },
    { id: 'branches', label: 'Branches', icon: MapPin },
    { id: 'reviews', label: 'Reviews', icon: MessageSquare },
    { id: 'reports', label: 'Reports', icon: BarChart3 },
    { id: 'staff', label: 'Staff Accounts', icon: UserCheck },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  return (
    <div className="min-h-screen bg-neutral-100 flex flex-col lg:flex-row">
      {/* Sidebar Navigation */}
      <aside className="lg:w-64 bg-[#171717] text-white shrink-0 flex flex-col justify-between no-print">
        <div>
          <div className="px-5 py-5 border-b border-neutral-800 flex items-center justify-between">
            <BrandLogo inverted />
          </div>

          <div className="px-5 py-3 border-b border-neutral-800 text-xs">
            <p className="font-semibold text-white truncate">{user.fullName}</p>
            <p className="text-[#FFC928] uppercase font-bold tracking-wider mt-0.5">
              {user.roleName}
            </p>
          </div>

          <nav className="p-3 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-1 gap-1">
            {navItems.map((item) => {
              const active = section === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setSection(item.id)}
                  className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-lg text-xs font-medium transition-colors text-left cursor-pointer ${
                    active
                      ? 'bg-[#D62828] text-white font-semibold'
                      : 'text-neutral-300 hover:bg-neutral-800 hover:text-white'
                  }`}
                >
                  <item.icon className="w-4 h-4 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        <div className="p-3 border-t border-neutral-800 space-y-1">
          <button
            onClick={() => navigate('/')}
            className="w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-lg text-xs font-medium text-neutral-300 hover:bg-neutral-800 cursor-pointer"
          >
            <Store className="w-4 h-4" />
            <span>Back to Storefront</span>
          </button>
          <button
            onClick={logout}
            className="w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-lg text-xs font-medium text-neutral-400 hover:text-white hover:bg-neutral-800 cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            <span>Logout</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="bg-white border-b border-neutral-200 px-6 py-4 flex items-center justify-between no-print">
          <div className="text-sm font-medium text-neutral-500">
            Operations <span className="mx-2">/</span>{' '}
            <span className="font-display font-bold text-[#171717] capitalize">
              {navItems.find((i) => i.id === section)?.label}
            </span>
          </div>
        </header>

        <main className="p-4 sm:p-6 lg:p-8 flex-1">
          {section === 'overview' && <AdminOverviewTab />}
          {(section === 'products' || section === 'categories') && (
            <AdminProductsTab view={section} />
          )}
          {(section === 'orders' || section === 'kitchen') && (
            <AdminOrdersKitchenTab view={section} />
          )}
          {(section === 'inventory' ||
            section === 'customers' ||
            section === 'promotions' ||
            section === 'branches' ||
            section === 'reviews' ||
            section === 'reports' ||
            section === 'staff' ||
            section === 'settings') && <AdminOperationsTab view={section} />}
        </main>
      </div>
    </div>
  );
};
