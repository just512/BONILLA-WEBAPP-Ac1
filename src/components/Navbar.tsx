import React, { useState } from 'react';
import { Bell, Menu, ShoppingBag, User, X } from 'lucide-react';
import { useApp } from '../context/AppContext.tsx';
import { BrandLogo } from './BrandLogo.tsx';

export const Navbar: React.FC = () => {
  const {
    route,
    navigate,
    user,
    cart,
    setCartOpen,
    settings,
    unreadCount,
  } = useApp();
  const [announcementDismissed, setAnnouncementDismissed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const announcement = settings.announcement;
  const showAnnouncement = Boolean(announcement?.enabled && announcement?.text && !announcementDismissed);
  const currentPath = route.split('?')[0];

  const navLinks = [
    { label: 'Home', path: '/' },
    { label: 'Menu', path: '/menu' },
    { label: 'Combo Builder', path: '/combo-builder' },
    { label: 'Track Order', path: '/track' },
    { label: 'About', path: '/about' },
  ];

  const handleLinkClick = (path: string) => {
    setMobileMenuOpen(false);
    navigate(path);
  };

  return (
    <div className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-neutral-200 no-print">
      {/* Slim Dismissible Announcement Bar */}
      {showAnnouncement && (
        <div className="bg-[#171717] text-white text-xs py-2 px-4 flex items-center justify-center relative">
          <div className="max-w-7xl mx-auto flex items-center gap-3 pr-6 truncate">
            <span className="truncate font-medium text-[#FFF8ED]">{announcement?.text}</span>
            <button
              onClick={() => navigate('/menu')}
              className="text-[#FFC928] font-semibold underline underline-offset-2 hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {announcement?.ctaLabel || 'Order Now'}
            </button>
          </div>
          <button
            onClick={() => setAnnouncementDismissed(true)}
            aria-label="Dismiss announcement"
            className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-white p-1 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Clean 3-Zone Top Bar Contract */}
      <header className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-8">
        {/* Zone 1: Brand Wordmark */}
        <button
          onClick={() => handleLinkClick('/')}
          className="text-left focus-visible:outline-2 focus-visible:outline-[#D62828] rounded-md cursor-pointer shrink-0"
        >
          <BrandLogo />
        </button>

        {/* Zone 2: Single-line Nav Links */}
        <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-neutral-600">
          {navLinks.map((link) => {
            const active = currentPath === link.path;
            return (
              <button
                key={link.path}
                onClick={() => handleLinkClick(link.path)}
                className={`whitespace-nowrap shrink-0 py-1 border-b-2 transition-colors cursor-pointer ${
                  active
                    ? 'text-[#171717] border-[#D62828] font-semibold'
                    : 'border-transparent hover:text-[#171717] hover:border-neutral-300'
                }`}
              >
                {link.label}
              </button>
            );
          })}
          {(user?.roleName === 'admin' || user?.roleName === 'staff') && (
            <button
              onClick={() => handleLinkClick('/admin')}
              className={`whitespace-nowrap shrink-0 py-1 border-b-2 transition-colors cursor-pointer ${
                currentPath.startsWith('/admin')
                  ? 'text-[#D62828] border-[#D62828] font-semibold'
                  : 'text-[#D62828] border-transparent hover:border-[#D62828]'
              }`}
            >
              Operations
            </button>
          )}
        </nav>

        {/* Zone 3: Actions */}
        <div className="flex items-center gap-3 shrink-0">
          {user ? (
            <div className="hidden sm:flex items-center gap-2">
              <button
                onClick={() => handleLinkClick('/account?tab=notifications')}
                aria-label="Notifications"
                className="relative p-2 text-neutral-700 hover:text-[#171717] rounded-lg hover:bg-neutral-100 transition-colors cursor-pointer"
              >
                <Bell className="w-4 h-4" />
                {unreadCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-[#D62828] text-white text-[10px] font-bold flex items-center justify-center tabular-nums">
                    {unreadCount}
                  </span>
                )}
              </button>
              <button
                onClick={() => handleLinkClick('/account')}
                className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-[#171717] hover:bg-neutral-100 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <User className="w-4 h-4 text-[#D62828]" />
                <span className="max-w-[110px] truncate">{user.fullName.split(' ')[0]}</span>
              </button>
            </div>
          ) : (
            <button
              onClick={() => handleLinkClick('/auth/signin')}
              className="hidden sm:inline-flex items-center px-3 py-2 text-sm font-medium text-neutral-700 hover:text-[#171717] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Sign In
            </button>
          )}

          {/* Primary Action: Cart Button */}
          <button
            onClick={() => setCartOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#D62828] hover:bg-[#B51E1E] text-white text-sm font-semibold transition-colors whitespace-nowrap shrink-0 shadow-sm cursor-pointer"
          >
            <ShoppingBag className="w-4 h-4" />
            <span>Cart</span>
            <span className="tabular-nums font-mono text-xs bg-[#171717]/25 px-1.5 py-0.5 rounded">
              {cart?.itemCount ?? 0}
            </span>
          </button>

          {/* Mobile Hamburger */}
          <button
            onClick={() => setMobileMenuOpen((v) => !v)}
            aria-label="Toggle navigation menu"
            className="md:hidden p-2 text-neutral-700 hover:bg-neutral-100 rounded-lg cursor-pointer"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </header>

      {/* Mobile Menu Drawer */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-neutral-200 bg-white px-4 py-4 space-y-2">
          {navLinks.map((link) => (
            <button
              key={link.path}
              onClick={() => handleLinkClick(link.path)}
              className="block w-full text-left px-3 py-2.5 rounded-lg text-sm font-medium text-[#171717] hover:bg-[#FFF8ED]"
            >
              {link.label}
            </button>
          ))}
          {(user?.roleName === 'admin' || user?.roleName === 'staff') && (
            <button
              onClick={() => handleLinkClick('/admin')}
              className="block w-full text-left px-3 py-2.5 rounded-lg text-sm font-semibold text-[#D62828] hover:bg-[#FFF8ED]"
            >
              Admin & Kitchen Dashboard
            </button>
          )}
          <div className="pt-2 border-t border-neutral-100 flex items-center gap-2">
            {user ? (
              <button
                onClick={() => handleLinkClick('/account')}
                className="flex-1 py-2.5 px-3 rounded-lg bg-neutral-100 text-sm font-semibold text-[#171717]"
              >
                My Account ({user.fullName.split(' ')[0]})
              </button>
            ) : (
              <>
                <button
                  onClick={() => handleLinkClick('/auth/signin')}
                  className="flex-1 py-2.5 px-3 rounded-lg border border-neutral-300 text-sm font-semibold text-[#171717]"
                >
                  Sign In
                </button>
                <button
                  onClick={() => handleLinkClick('/auth/signup')}
                  className="flex-1 py-2.5 px-3 rounded-lg bg-[#171717] text-sm font-semibold text-white"
                >
                  Create Account
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
