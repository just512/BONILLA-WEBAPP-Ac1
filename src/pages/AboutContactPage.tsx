import React from 'react';
import { Clock, Mail, MapPin, Phone } from 'lucide-react';
import { useApp } from '../context/AppContext.tsx';
import { ProductImage } from '../components/ProductImage.tsx';

export const AboutContactPage: React.FC = () => {
  const { settings, branches, navigate } = useApp();
  const info = settings.business_info;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12 space-y-16">
      {/* Story Split */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
        <div className="lg:col-span-6 space-y-5">
          <p className="text-xs font-semibold uppercase tracking-widest text-[#D62828]">
            {info?.tagline || 'BIG FLAVOR. NO COMPROMISE.'}
          </p>
          <h1 className="font-display text-3xl sm:text-5xl font-extrabold text-[#171717] leading-tight">
            Independent Smash Burgers Built From Scratch
          </h1>
          <p className="text-base text-neutral-600 leading-relaxed">
            JUST BURGER started with a single flat-top griddle and a simple rule: never freeze beef,
            toast every brioche bun in browned butter, and make every sauce in-house each morning.
          </p>
          <p className="text-base text-neutral-600 leading-relaxed">
            Whether you customize a double smash classic for express counter pickup or order a
            late-night feast to your doorstep, every burger is seared to order the moment your ticket
            hits our kitchen display.
          </p>
          <button
            onClick={() => navigate('/menu')}
            className="px-6 py-3 rounded-xl bg-[#D62828] hover:bg-[#B51E1E] text-white font-semibold text-sm cursor-pointer"
          >
            Explore Our Menu
          </button>
        </div>
        <div className="lg:col-span-6">
          <div className="aspect-[4/3] rounded-2xl overflow-hidden bg-neutral-100 shadow-lg">
            <ProductImage
              src="/src/assets/images/truffle_swiss_burger_1795056342995.jpg"
              alt="JUST BURGER craft kitchen"
              className="w-full h-full object-cover"
            />
          </div>
        </div>
      </section>

      {/* Branches & Contact */}
      <section className="space-y-6">
        <div>
          <h2 className="font-display text-2xl sm:text-3xl font-bold text-[#171717]">
            Our Branches & Contact Info
          </h2>
          <p className="text-sm text-neutral-600 mt-1">
            Reach our support team at {info?.supportEmail || 'hello@justburger.co'} or{' '}
            {info?.supportPhone || '(555) 234-8910'}.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {branches.map((b) => (
            <div key={b.id} className="rounded-2xl border border-neutral-200 bg-white p-6 space-y-3">
              <h3 className="font-display text-lg font-bold text-[#171717]">{b.name}</h3>
              <div className="space-y-2 text-sm text-neutral-600">
                <p className="flex items-start gap-2">
                  <MapPin className="w-4 h-4 text-[#D62828] shrink-0 mt-0.5" />
                  <span>
                    {b.address}, {b.city}
                  </span>
                </p>
                <p className="flex items-center gap-2">
                  <Phone className="w-4 h-4 text-[#D62828] shrink-0" />
                  <span className="tabular-nums">{b.phone}</span>
                </p>
                <p className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-[#D62828] shrink-0" />
                  <span>{b.operatingHours}</span>
                </p>
                <p className="flex items-center gap-2">
                  <Mail className="w-4 h-4 text-[#D62828] shrink-0" />
                  <span>
                    {b.supportsPickup && b.supportsDelivery
                      ? 'Pickup & Delivery Available'
                      : 'Store Pickup Only'}
                  </span>
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};
