/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { AppProvider, useApp } from './context/AppContext.tsx';
import { Navbar } from './components/Navbar.tsx';
import { Footer } from './components/Footer.tsx';
import { CartDrawer } from './components/CartDrawer.tsx';
import { HomePage } from './pages/HomePage.tsx';
import { MenuPage } from './pages/MenuPage.tsx';
import { ProductDetailPage } from './pages/ProductDetailPage.tsx';
import { ComboBuilderPage } from './pages/ComboBuilderPage.tsx';
import { AuthPages } from './pages/AuthPages.tsx';
import { CheckoutPage } from './pages/CheckoutPage.tsx';
import { OrderTrackingPage } from './pages/OrderTrackingPage.tsx';
import { CustomerAccountPage } from './pages/CustomerAccountPage.tsx';
import { AdminDashboardPage } from './pages/AdminDashboardPage.tsx';
import { AboutContactPage } from './pages/AboutContactPage.tsx';

const AppRoutes: React.FC = () => {
  const { route } = useApp();
  const path = route.split('?')[0];

  if (path.startsWith('/admin')) {
    return <AdminDashboardPage />;
  }

  let content: React.ReactNode;
  if (path === '/' || path === '') {
    content = <HomePage />;
  } else if (path === '/menu') {
    content = <MenuPage />;
  } else if (path.startsWith('/product/')) {
    const id = Number(path.replace('/product/', ''));
    content = <ProductDetailPage productId={id} />;
  } else if (path === '/combo-builder') {
    content = <ComboBuilderPage />;
  } else if (path === '/auth/signin') {
    content = <AuthPages mode="signin" />;
  } else if (path === '/auth/signup') {
    content = <AuthPages mode="signup" />;
  } else if (path === '/auth/forgot-password') {
    content = <AuthPages mode="forgot" />;
  } else if (path === '/checkout') {
    content = <CheckoutPage />;
  } else if (path === '/track') {
    content = <OrderTrackingPage />;
  } else if (path.startsWith('/track/')) {
    const ordNum = path.replace('/track/', '');
    content = <OrderTrackingPage initialOrderNumber={ordNum} />;
  } else if (path === '/account') {
    content = <CustomerAccountPage />;
  } else if (path === '/about' || path === '/contact') {
    content = <AboutContactPage />;
  } else {
    content = <HomePage />;
  }

  return (
    <div className="min-h-screen flex flex-col bg-white text-[#171717]">
      <Navbar />
      <main className="flex-1">{content}</main>
      <Footer />
      <CartDrawer />
    </div>
  );
};

export default function App() {
  return (
    <AppProvider>
      <AppRoutes />
    </AppProvider>
  );
}
