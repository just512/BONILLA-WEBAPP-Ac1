import React, { useEffect, useState } from 'react';
import { CheckCircle2, Eye, EyeOff, Lock, Mail, Phone, RefreshCw, User } from 'lucide-react';
import { useApp } from '../context/AppContext.tsx';
import { apiFetch } from '../lib/api.ts';

export const AuthPages: React.FC<{ mode: 'signin' | 'signup' | 'forgot' }> = ({ mode }) => {
  const {
    navigate,
    loginWithEmail,
    registerAccount,
    loginWithGoogle,
    resendVerificationEmail,
    syncEmailVerification,
    sendPasswordReset,
    pendingRedirect,
    setPendingRedirect,
    showToast,
  } = useApp();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Firebase email verification & password reset state
  const [pendingVerifyUserRole, setPendingVerifyUserRole] = useState<string | null>(null);
  const [resetEmailSent, setResetEmailSent] = useState(false);
  const [resetTokenInput, setResetTokenInput] = useState('');
  const [resetNewPassword, setResetNewPassword] = useState('');
  const [resetConfirmPassword, setResetConfirmPassword] = useState('');

  useEffect(() => {
    setErrorMsg('');
    setPendingVerifyUserRole(null);
    setResetEmailSent(false);
    setResetTokenInput('');
    setResetNewPassword('');
    setResetConfirmPassword('');
  }, [mode]);

  const finishAuthNavigation = (roleName: string) => {
    if (pendingRedirect) {
      const target = pendingRedirect;
      setPendingRedirect(null);
      navigate(target);
      return;
    }
    if (roleName === 'admin' || roleName === 'staff') {
      navigate('/admin');
    } else {
      navigate('/account');
    }
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setLoading(true);
    try {
      const user = await loginWithEmail(email, password, rememberMe);
      showToast(`Welcome back, ${user.fullName.split(' ')[0]}!`, 'success');
      finishAuthNavigation(user.roleName);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Sign in failed');
    } finally {
      setLoading(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    if (password.length < 8) {
      setErrorMsg('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setErrorMsg('Passwords do not match.');
      return;
    }
    setLoading(true);
    try {
      const res = await registerAccount({
        fullName,
        email,
        phone,
        password,
        confirmPassword,
      });
      if (!res.user.emailVerified && res.verificationEmailSent) {
        setPendingVerifyUserRole(res.user.roleName);
        showToast('Account created! Verification email sent to your inbox.', 'success');
      } else {
        showToast('Account created! Welcome to JUST BURGER.', 'success');
        finishAuthNavigation(res.user.roleName);
      }
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  const handleCheckVerification = async () => {
    setErrorMsg('');
    setLoading(true);
    try {
      const verified = await syncEmailVerification();
      if (verified) {
        showToast('Email verified successfully!', 'success');
        finishAuthNavigation(pendingVerifyUserRole || 'customer');
      } else {
        showToast('Not verified yet. Open the link in your email inbox and check again.', 'info');
      }
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to check verification status');
    } finally {
      setLoading(false);
    }
  };

  const handleResendVerification = async () => {
    setErrorMsg('');
    setLoading(true);
    try {
      await resendVerificationEmail();
      showToast(`Verification email re-sent to ${email}.`, 'success');
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to resend verification email.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setErrorMsg('');
    setLoading(true);
    try {
      const user = await loginWithGoogle();
      showToast(`Signed in as ${user.fullName}`, 'success');
      finishAuthNavigation(user.roleName);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Google sign-in was cancelled or failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleForgotSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setLoading(true);
    try {
      const res = await sendPasswordReset(email);
      if (res.resetTokenPreview) {
        setResetTokenInput(res.resetTokenPreview);
      }
      setResetEmailSent(true);
      showToast(res.message || 'Password reset link sent to your email address.', 'success');
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Password reset failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleResetConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    if (resetNewPassword.length < 8) {
      setErrorMsg('New password must be at least 8 characters.');
      return;
    }
    if (resetNewPassword !== resetConfirmPassword) {
      setErrorMsg('Passwords do not match.');
      return;
    }
    setLoading(true);
    try {
      const res = await apiFetch<{ message: string }>('/api/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({
          token: resetTokenInput,
          newPassword: resetNewPassword,
          confirmPassword: resetConfirmPassword,
        }),
      });
      showToast(res.message, 'success');
      navigate('/auth/signin');
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to reset password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[78vh] bg-[#FFF8ED] dark:bg-[#121110] py-12 px-4 flex items-center justify-center transition-colors duration-200">
      <div className="w-full max-w-md bg-white dark:bg-[#1A1A1A] rounded-2xl border border-neutral-200 dark:border-neutral-800 shadow-lg p-7 sm:p-8 space-y-6">
        {pendingRedirect && (
          <div className="rounded-xl bg-[#FFF8ED] dark:bg-[#231B16] border border-amber-200 dark:border-amber-900/50 px-4 py-3 text-xs font-medium text-[#171717] dark:text-neutral-100">
            Sign in or create an account to continue to checkout with your saved bag.
          </div>
        )}

        {pendingVerifyUserRole ? (
          <div className="space-y-4 text-center py-3">
            <div className="w-12 h-12 rounded-2xl bg-[#FFF8ED] dark:bg-[#231B16] border border-amber-200 dark:border-amber-900/50 flex items-center justify-center mx-auto text-[#D62828]">
              <Mail className="w-6 h-6" />
            </div>
            <h1 className="font-display text-2xl font-extrabold text-[#171717] dark:text-white">
              Verify Your Email
            </h1>
            <p className="text-sm text-neutral-600 dark:text-neutral-400 leading-relaxed">
              Your JUST BURGER account is active. We sent a verification link to{' '}
              <span className="font-semibold text-[#171717] dark:text-white">{email}</span>. Click the link in your
              inbox, then confirm below.
            </p>
            {errorMsg && (
              <div className="rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 px-4 py-3 text-xs font-medium text-[#D62828] dark:text-red-400 text-left">
                {errorMsg}
              </div>
            )}
            <button
              onClick={handleCheckVerification}
              disabled={loading}
              className="w-full py-3 rounded-xl bg-[#D62828] hover:bg-[#B51E1E] text-white font-semibold text-sm flex items-center justify-center gap-2 cursor-pointer"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{loading ? 'Checking...' : "I've Verified — Continue"}</span>
            </button>
            <button
              type="button"
              onClick={handleResendVerification}
              disabled={loading}
              className="w-full py-2.5 rounded-xl border border-neutral-300 dark:border-neutral-700 text-xs font-semibold text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800 flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Resend Verification Email</span>
            </button>
            <button
              type="button"
              onClick={() => finishAuthNavigation(pendingVerifyUserRole)}
              className="w-full py-2 text-xs text-neutral-500 dark:text-neutral-400 hover:text-[#171717] dark:hover:text-white cursor-pointer"
            >
              Continue to Account Now
            </button>
          </div>
        ) : (
          <>
            <div>
              <h1 className="font-display text-2xl sm:text-3xl font-extrabold text-[#171717] dark:text-white">
                {mode === 'signin'
                  ? 'Welcome Back'
                  : mode === 'signup'
                    ? 'Create Your Account'
                    : 'Reset Your Password'}
              </h1>
              <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-1">
                {mode === 'signin'
                  ? 'Sign in to place orders, track deliveries, and earn JUST Rewards.'
                  : mode === 'signup'
                    ? 'Join JUST BURGER to save addresses, track orders, and collect points.'
                    : 'Enter your email and we will send a secure password reset link.'}
              </p>
            </div>

            {errorMsg && (
              <div
                role="alert"
                className="rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 px-4 py-3 text-xs font-medium text-[#D62828] dark:text-red-400"
              >
                {errorMsg}
              </div>
            )}

            {mode !== 'forgot' && (
              <>
                <button
                  type="button"
                  onClick={handleGoogleSignIn}
                  disabled={loading}
                  className="w-full py-3 px-4 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-[#141414] hover:bg-neutral-50 dark:hover:bg-neutral-800 text-sm font-semibold text-[#171717] dark:text-neutral-100 flex items-center justify-center gap-2.5 transition-colors cursor-pointer"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden="true">
                    <path
                      fill="#4285F4"
                      d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24Z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14Z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96Z"
                    />
                  </svg>
                  <span>Continue with Google</span>
                </button>

                <div className="relative flex items-center py-1">
                  <div className="flex-grow border-t border-neutral-200 dark:border-neutral-800" />
                  <span className="shrink mx-3 text-xs text-neutral-400 dark:text-neutral-500">or with email</span>
                  <div className="flex-grow border-t border-neutral-200 dark:border-neutral-800" />
                </div>
              </>
            )}

            {mode === 'signin' && (
              <form onSubmit={handleSignIn} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                    Email Address
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-neutral-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-[#121212] text-[#171717] dark:text-neutral-100 placeholder:text-neutral-400 dark:placeholder:text-neutral-500 text-sm focus:outline-none focus:border-[#D62828]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                    Password
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-neutral-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter your password"
                      className="w-full pl-10 pr-10 py-2.5 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-[#121212] text-[#171717] dark:text-neutral-100 placeholder:text-neutral-400 dark:placeholder:text-neutral-500 text-sm focus:outline-none focus:border-[#D62828]"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((s) => !s)}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 cursor-pointer"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs">
                  <label className="inline-flex items-center gap-2 text-neutral-600 dark:text-neutral-400 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                      className="accent-[#D62828]"
                    />
                    Remember me
                  </label>
                  <button
                    type="button"
                    onClick={() => navigate('/auth/forgot-password')}
                    className="font-semibold text-[#D62828] dark:text-[#FFC928] hover:underline cursor-pointer"
                  >
                    Forgot password?
                  </button>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 rounded-xl bg-[#D62828] hover:bg-[#B51E1E] text-white font-semibold text-sm transition-colors cursor-pointer"
                >
                  {loading ? 'Signing In...' : 'Sign In'}
                </button>

                <p className="text-center text-xs text-neutral-600 dark:text-neutral-400 pt-2">
                  New to JUST BURGER?{' '}
                  <button
                    type="button"
                    onClick={() => navigate('/auth/signup')}
                    className="font-semibold text-[#D62828] dark:text-[#FFC928] hover:underline cursor-pointer"
                  >
                    Create Account
                  </button>
                </p>
              </form>
            )}

            {mode === 'signup' && (
              <form onSubmit={handleSignUp} className="space-y-3.5">
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                    Full Name
                  </label>
                  <div className="relative">
                    <User className="w-4 h-4 text-neutral-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      required
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="Alex Rivera"
                      className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-[#121212] text-[#171717] dark:text-neutral-100 placeholder:text-neutral-400 dark:placeholder:text-neutral-500 text-sm focus:outline-none focus:border-[#D62828]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                    Email Address
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-neutral-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="alex@example.com"
                      className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-[#121212] text-[#171717] dark:text-neutral-100 placeholder:text-neutral-400 dark:placeholder:text-neutral-500 text-sm focus:outline-none focus:border-[#D62828]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                    Contact Number
                  </label>
                  <div className="relative">
                    <Phone className="w-4 h-4 text-neutral-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="tel"
                      required
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="(555) 123-4567"
                      className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-[#121212] text-[#171717] dark:text-neutral-100 placeholder:text-neutral-400 dark:placeholder:text-neutral-500 text-sm focus:outline-none focus:border-[#D62828]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                    Password (min. 8 characters)
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-neutral-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      minLength={8}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Create a strong password"
                      className="w-full pl-10 pr-10 py-2.5 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-[#121212] text-[#171717] dark:text-neutral-100 placeholder:text-neutral-400 dark:placeholder:text-neutral-500 text-sm focus:outline-none focus:border-[#D62828]"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((s) => !s)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 cursor-pointer"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                    Confirm Password
                  </label>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter password"
                    className="w-full px-4 py-2.5 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-[#121212] text-[#171717] dark:text-neutral-100 placeholder:text-neutral-400 dark:placeholder:text-neutral-500 text-sm focus:outline-none focus:border-[#D62828]"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 rounded-xl bg-[#D62828] hover:bg-[#B51E1E] text-white font-semibold text-sm transition-colors cursor-pointer"
                >
                  {loading ? 'Creating Account...' : 'Create Account'}
                </button>

                <p className="text-center text-xs text-neutral-600 dark:text-neutral-400 pt-1">
                  Already have an account?{' '}
                  <button
                    type="button"
                    onClick={() => navigate('/auth/signin')}
                    className="font-semibold text-[#D62828] dark:text-[#FFC928] hover:underline cursor-pointer"
                  >
                    Sign In
                  </button>
                </p>
              </form>
            )}

            {mode === 'forgot' && (
              <div className="space-y-4">
                {resetEmailSent ? (
                  resetTokenInput ? (
                    <form onSubmit={handleResetConfirm} className="space-y-3.5">
                      <div className="rounded-xl bg-[#FFF8ED] dark:bg-[#231B16] border border-amber-200 dark:border-amber-900/50 p-4 space-y-1.5 text-sm text-[#171717] dark:text-white">
                        <p className="font-semibold">Reset Code Ready</p>
                        <p className="text-xs text-neutral-600 dark:text-neutral-300 leading-relaxed">
                          Enter a new password for <span className="font-semibold">{email}</span> using
                          the verification code below.
                        </p>
                      </div>
                      <input
                        type="text"
                        required
                        value={resetTokenInput}
                        onChange={(e) => setResetTokenInput(e.target.value)}
                        placeholder="Reset code"
                        className="w-full px-4 py-2.5 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-[#121212] text-[#171717] dark:text-neutral-100 font-mono text-sm uppercase focus:outline-none focus:border-[#D62828]"
                      />
                      <input
                        type="password"
                        required
                        minLength={8}
                        value={resetNewPassword}
                        onChange={(e) => setResetNewPassword(e.target.value)}
                        placeholder="New password (min. 8 characters)"
                        className="w-full px-4 py-2.5 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-[#121212] text-[#171717] dark:text-neutral-100 text-sm focus:outline-none focus:border-[#D62828]"
                      />
                      <input
                        type="password"
                        required
                        value={resetConfirmPassword}
                        onChange={(e) => setResetConfirmPassword(e.target.value)}
                        placeholder="Confirm new password"
                        className="w-full px-4 py-2.5 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-[#121212] text-[#171717] dark:text-neutral-100 text-sm focus:outline-none focus:border-[#D62828]"
                      />
                      <button
                        type="submit"
                        disabled={loading}
                        className="w-full py-3 rounded-xl bg-[#D62828] hover:bg-[#B51E1E] text-white font-semibold text-sm cursor-pointer"
                      >
                        {loading ? 'Updating Password...' : 'Set New Password'}
                      </button>
                    </form>
                  ) : (
                    <div className="rounded-xl bg-[#FFF8ED] dark:bg-[#231B16] border border-amber-200 dark:border-amber-900/50 p-4 space-y-2 text-sm text-[#171717] dark:text-white">
                      <p className="font-semibold">Reset Link Dispatched</p>
                      <p className="text-xs text-neutral-600 dark:text-neutral-300 leading-relaxed">
                        If an account exists for <span className="font-semibold">{email}</span>, a
                        password reset email has been sent. Open the link in your inbox to choose a
                        new password.
                      </p>
                    </div>
                  )
                ) : (
                  <form onSubmit={handleForgotSubmit} className="space-y-4">
                    <div>
                      <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                        Account Email Address
                      </label>
                      <input
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="you@example.com"
                        className="w-full px-4 py-2.5 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-[#121212] text-[#171717] dark:text-neutral-100 placeholder:text-neutral-400 dark:placeholder:text-neutral-500 text-sm focus:outline-none focus:border-[#D62828]"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full py-3 rounded-xl bg-[#171717] dark:bg-[#D62828] hover:bg-neutral-800 dark:hover:bg-[#B51E1E] text-white font-semibold text-sm cursor-pointer"
                    >
                      {loading ? 'Sending Reset Link...' : 'Send Password Reset Email'}
                    </button>
                  </form>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setResetEmailSent(false);
                    navigate('/auth/signin');
                  }}
                  className="w-full text-xs text-neutral-600 dark:text-neutral-400 hover:underline cursor-pointer"
                >
                  Back to Sign In
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};
