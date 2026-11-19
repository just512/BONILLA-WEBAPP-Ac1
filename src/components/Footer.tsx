import React, { useState } from 'react';
import { Clock, Mail, MapPin, Phone, X } from 'lucide-react';
import { useApp } from '../context/AppContext.tsx';
import { BrandLogo } from './BrandLogo.tsx';

export const Footer: React.FC = () => {
  const { navigate, settings, branches } = useApp();
  const [policyModal, setPolicyModal] = useState<'privacy' | 'terms' | null>(null);

  const info = settings.business_info;

  return (
    <footer className="bg-[#171717] text-neutral-300 border-t border-neutral-800 no-print">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-14">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-10">
          {/* Column 1: Brand */}
          <div className="space-y-4">
            <BrandLogo inverted />
            <p className="text-sm text-neutral-400 leading-relaxed">
              {info?.tagline || 'BIG FLAVOR. NO COMPROMISE.'} Independent smash burger kitchens
              grilling fresh Angus beef, house-brined pickles, and toasted brioche daily.
            </p>
            <div className="flex items-center gap-4 text-xs font-medium text-neutral-400 pt-1">
              <a
                href="#instagram"
                onClick={(e) => {
                  e.preventDefault();
                  navigate('/about');
                }}
                className="hover:text-[#FFC928] transition-colors"
              >
                Instagram
              </a>
              <span aria-hidden="true">·</span>
              <a
                href="#facebook"
                onClick={(e) => {
                  e.preventDefault();
                  navigate('/about');
                }}
                className="hover:text-[#FFC928] transition-colors"
              >
                Facebook
              </a>
              <span aria-hidden="true">·</span>
              <a
                href="#tiktok"
                onClick={(e) => {
                  e.preventDefault();
                  navigate('/about');
                }}
                className="hover:text-[#FFC928] transition-colors"
              >
                TikTok
              </a>
            </div>
          </div>

          {/* Column 2: Explore */}
          <div className="space-y-3">
            <h3 className="font-display text-sm font-bold text-white uppercase tracking-wider">
              Explore
            </h3>
            <ul className="space-y-2.5 text-sm">
              <li>
                <button
                  onClick={() => navigate('/menu')}
                  className="hover:text-[#FFC928] transition-colors cursor-pointer"
                >
                  Full Food Menu
                </button>
              </li>
              <li>
                <button
                  onClick={() => navigate('/combo-builder')}
                  className="hover:text-[#FFC928] transition-colors cursor-pointer"
                >
                  Build Your Own Combo
                </button>
              </li>
              <li>
                <button
                  onClick={() => navigate('/track')}
                  className="hover:text-[#FFC928] transition-colors cursor-pointer"
                >
                  Track an Order
                </button>
              </li>
              <li>
                <button
                  onClick={() => navigate('/about')}
                  className="hover:text-[#FFC928] transition-colors cursor-pointer"
                >
                  About & Contact
                </button>
              </li>
              <li>
                <button
                  onClick={() => navigate('/account')}
                  className="hover:text-[#FFC928] transition-colors cursor-pointer"
                >
                  JUST Rewards Loyalty
                </button>
              </li>
            </ul>
          </div>

          {/* Column 3: Contact & Hours */}
          <div className="space-y-3">
            <h3 className="font-display text-sm font-bold text-white uppercase tracking-wider">
              Contact & Hours
            </h3>
            <ul className="space-y-2.5 text-sm text-neutral-400">
              <li className="flex items-start gap-2.5">
                <MapPin className="w-4 h-4 text-[#FFC928] shrink-0 mt-0.5" />
                <span>{info?.address || branches[0]?.address || '420 Grillhouse Ave'}</span>
              </li>
              <li className="flex items-center gap-2.5">
                <Phone className="w-4 h-4 text-[#FFC928] shrink-0" />
                <span className="tabular-nums">{info?.supportPhone || '(555) 234-8910'}</span>
              </li>
              <li className="flex items-center gap-2.5">
                <Mail className="w-4 h-4 text-[#FFC928] shrink-0" />
                <span>{info?.supportEmail || 'hello@justburger.co'}</span>
              </li>
              <li className="flex items-center gap-2.5">
                <Clock className="w-4 h-4 text-[#FFC928] shrink-0" />
                <span>{info?.hours || 'Daily 10:00 AM – 11:00 PM'}</span>
              </li>
            </ul>
          </div>

          {/* Column 4: Branches */}
          <div className="space-y-3">
            <h3 className="font-display text-sm font-bold text-white uppercase tracking-wider">
              Our Kitchens
            </h3>
            <ul className="space-y-3 text-sm">
              {branches.slice(0, 3).map((b) => (
                <li key={b.id} className="text-neutral-400">
                  <p className="text-white font-medium">{b.name}</p>
                  <p className="text-xs text-neutral-400">
                    {b.supportsPickup && b.supportsDelivery
                      ? 'Pickup & Delivery'
                      : b.supportsPickup
                        ? 'Pickup Only'
                        : 'Delivery Only'}{' '}
                    · {b.operatingHours}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-12 pt-8 border-t border-neutral-800 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-neutral-500">
          <p>© {new Date().getFullYear()} JUST BURGER. All rights reserved.</p>
          <div className="flex items-center gap-5">
            <button
              onClick={() => setPolicyModal('privacy')}
              className="hover:text-white transition-colors cursor-pointer"
            >
              Privacy Policy
            </button>
            <button
              onClick={() => setPolicyModal('terms')}
              className="hover:text-white transition-colors cursor-pointer"
            >
              Terms & Conditions
            </button>
            <button
              onClick={() => navigate('/admin')}
              className="hover:text-[#FFC928] transition-colors cursor-pointer"
            >
              Staff Portal
            </button>
          </div>
        </div>
      </div>

      {/* Policy Modal */}
      {policyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white text-[#171717] rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-neutral-200 pb-3">
              <h3 className="font-display text-xl font-bold">
                {policyModal === 'privacy' ? 'Privacy Policy' : 'Terms & Conditions'}
              </h3>
              <button
                onClick={() => setPolicyModal(null)}
                className="p-1.5 rounded-lg hover:bg-neutral-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="text-sm text-neutral-600 space-y-3 max-h-80 overflow-y-auto leading-relaxed">
              {policyModal === 'privacy' ? (
                <>
                  <p>
                    JUST BURGER collects only the account, contact, and delivery address details
                    needed to prepare and deliver your food orders accurately.
                  </p>
                  <p>
                    Your passwords are salted and hashed with scrypt, and payment verification
                    records are stored securely without keeping raw card credentials on file.
                  </p>
                </>
              ) : (
                <>
                  <p>
                    All orders are prepared fresh upon confirmation. Menu prices and promotions are
                    validated server-side at checkout based on your selected branch.
                  </p>
                  <p>
                    JUST Rewards points are credited exclusively on paid, completed orders and may be
                    redeemed according to the active rewards catalog.
                  </p>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </footer>
  );
};
