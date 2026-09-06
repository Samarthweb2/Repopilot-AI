/**
 * AuthModal — Authentication modal with Google OAuth, GitHub OAuth, Email/Password, and Demo Mode.
 *
 * Features:
 * - Real Google OAuth & GitHub OAuth integration
 * - Transparent "Try with Demo Account" button for local/offline testing
 * - Seamless tab switching between Sign In and Create Account
 * - Password visibility toggle and validation
 * - Clear error banners for invalid credentials, duplicate accounts, and rate limits
 * - Animated entrance and exit
 */

import React, { useState, useEffect, useRef } from 'react'
import { useAuth } from '../lib/AuthContext'
import { HexagonREmblem } from './RepoPilotLogo'
import { X, Eye, EyeOff, AlertCircle, Loader2, ArrowRight } from 'lucide-react'

interface AuthModalProps {
  onAuthSuccess?: () => void
}

export function AuthModal({ onAuthSuccess }: AuthModalProps = {}) {
  const {
    authModalMode,
    closeAuthModal,
    login,
    signup,
    loginWithGoogle,
    loginWithGithub,
    authError,
    setAuthError,
  } = useAuth()

  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [socialLoading, setSocialLoading] = useState<'google' | 'github' | null>(null)
  const emailInputRef = useRef<HTMLInputElement>(null)

  // Sync internal mode when authModalMode changes
  useEffect(() => {
    if (authModalMode) {
      setMode(authModalMode)
      setError(null)
      setName('')
      setEmail('')
      setPassword('')
      setShowPassword(false)
      setIsSubmitting(false)
      setSocialLoading(null)

      setTimeout(() => emailInputRef.current?.focus(), 150)
    }
  }, [authModalMode])

  // Close on Escape key
  useEffect(() => {
    if (!authModalMode) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeAuthModal()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [authModalMode, closeAuthModal])

  if (!authModalMode) return null

  const activeError = error || authError

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setAuthError(null)

    if (!email.trim() || !email.includes('@')) {
      setError('Please enter a valid email address.')
      return
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.')
      return
    }
    if (mode === 'signup' && !name.trim()) {
      setError('Please enter your full name.')
      return
    }

    setIsSubmitting(true)
    try {
      if (mode === 'signup') {
        await signup(name.trim(), email.trim(), password)
      } else {
        await login(email.trim(), password)
      }
      onAuthSuccess?.()
    } catch (err: any) {
      setError(err.message || 'Authentication failed. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleGoogleLogin = async () => {
    setError(null)
    setAuthError(null)
    setSocialLoading('google')
    try {
      await loginWithGoogle()
      onAuthSuccess?.()
    } catch (err: any) {
      setError(err.message || 'Google sign-in failed.')
    } finally {
      setSocialLoading(null)
    }
  }

  const handleGithubLogin = async () => {
    setError(null)
    setAuthError(null)
    setSocialLoading('github')
    try {
      await loginWithGithub()
      onAuthSuccess?.()
    } catch (err: any) {
      setError(err.message || 'GitHub sign-in failed.')
    } finally {
      setSocialLoading(null)
    }
  }

  const switchMode = () => {
    setMode(mode === 'signin' ? 'signup' : 'signin')
    setError(null)
    setAuthError(null)
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget && !isSubmitting && !socialLoading) closeAuthModal() }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-xs animate-fadeIn" />

      {/* Modal Container */}
      <div
        className="relative w-full max-w-[440px] bg-white rounded-2xl shadow-2xl border border-slate-200/90 overflow-hidden"
        style={{
          animation: 'authModalSlideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        }}
      >
        {/* Close Button */}
        <button
          onClick={closeAuthModal}
          disabled={isSubmitting || !!socialLoading}
          className="absolute top-4 right-4 p-1.5 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors cursor-pointer z-10 disabled:opacity-50"
          aria-label="Close modal"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="px-7 pt-7 pb-0">
          <div className="flex items-center gap-2 mb-3">
            <HexagonREmblem size={26} color="#FFE600" />
            <span className="text-xs font-bold text-slate-400 uppercase tracking-widest font-nebius">RepoPilot AI</span>
          </div>
          <h2 className="text-xl font-bold text-[#031728] leading-tight font-nebius">
            {mode === 'signin' ? 'Welcome back' : 'Create your account'}
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 mt-1 mb-5">
            {mode === 'signin'
              ? 'Sign in to access your indexed codebases and AI assistant.'
              : 'Start indexing repositories and querying code with AST intelligence.'}
          </p>
        </div>

        {/* Content */}
        <div className="px-7 pb-7 space-y-4">
          {/* Error Banner */}
          {activeError && (
            <div className="flex items-start gap-2.5 p-3 bg-red-50 border border-red-200 rounded-xl text-xs sm:text-sm text-red-700 animate-fadeIn">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-red-500" />
              <span className="leading-snug">{activeError}</span>
            </div>
          )}

          {/* Social Login Buttons */}
          <div className="space-y-2.5">
            {/* Continue with Google */}
            <button
              type="button"
              id="btn-auth-google"
              onClick={handleGoogleLogin}
              disabled={!!socialLoading || isSubmitting}
              className="w-full flex items-center justify-center gap-3 py-2.5 px-4 rounded-xl border border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-sm font-semibold text-slate-800 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {socialLoading === 'google' ? (
                <Loader2 className="w-4 h-4 animate-spin text-slate-500" />
              ) : (
                <svg className="w-[18px] h-[18px] shrink-0" viewBox="0 0 24 24">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
              )}
              <span>Continue with Google</span>
            </button>

            {/* Continue with GitHub */}
            <button
              type="button"
              id="btn-auth-github"
              onClick={handleGithubLogin}
              disabled={!!socialLoading || isSubmitting}
              className="w-full flex items-center justify-center gap-3 py-2.5 px-4 rounded-xl border border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-sm font-semibold text-slate-800 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {socialLoading === 'github' ? (
                <Loader2 className="w-4 h-4 animate-spin text-slate-500" />
              ) : (
                <svg className="w-[18px] h-[18px] shrink-0" viewBox="0 0 24 24" fill="#24292f">
                  <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
                </svg>
              )}
              <span>Continue with GitHub</span>
            </button>
          </div>

          {/* Divider */}
          <div className="relative flex items-center justify-center py-1">
            <span className="border-t border-slate-200 w-full" />
            <span className="bg-white px-3.5 shrink-0 text-xs font-medium text-slate-400 uppercase tracking-wide">or with email</span>
            <span className="border-t border-slate-200 w-full" />
          </div>

          {/* Email/Password Form */}
          <form onSubmit={handleEmailSubmit} className="space-y-3">
            {/* Full Name (signup only) */}
            {mode === 'signup' && (
              <div className="animate-fadeIn">
                <label htmlFor="auth-name" className="block text-xs font-semibold text-slate-600 mb-1.5">
                  Full Name
                </label>
                <input
                  id="auth-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Jane Developer"
                  autoComplete="name"
                  required
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm placeholder:text-slate-400 focus:outline-none focus:border-[#031728] focus:ring-1 focus:ring-[#031728]/10 transition-all"
                />
              </div>
            )}

            {/* Email */}
            <div>
              <label htmlFor="auth-email" className="block text-xs font-semibold text-slate-600 mb-1.5">
                Work Email
              </label>
              <input
                ref={emailInputRef}
                id="auth-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="developer@company.com"
                autoComplete="email"
                required
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm placeholder:text-slate-400 focus:outline-none focus:border-[#031728] focus:ring-1 focus:ring-[#031728]/10 transition-all"
              />
            </div>

            {/* Password */}
            <div>
              <label htmlFor="auth-password" className="block text-xs font-semibold text-slate-600 mb-1.5">
                Password
              </label>
              <div className="relative">
                <input
                  id="auth-password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                  required
                  className="w-full px-3.5 py-2.5 pr-11 rounded-xl border border-slate-200 text-sm placeholder:text-slate-400 focus:outline-none focus:border-[#031728] focus:ring-1 focus:ring-[#031728]/10 transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {mode === 'signup' && (
                <p className="text-[11px] text-slate-400 mt-1.5">Minimum 6 characters with secure scrypt hashing</p>
              )}
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              id="btn-auth-submit"
              disabled={isSubmitting || !!socialLoading}
              className="w-full inline-flex items-center justify-center gap-2.5 py-3 px-4 rounded-xl bg-[#031728] hover:bg-[#072440] text-white text-sm font-semibold transition-all cursor-pointer shadow-xs disabled:opacity-50 disabled:cursor-not-allowed mt-1"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>{mode === 'signup' ? 'Creating account…' : 'Signing in…'}</span>
                </>
              ) : (
                <>
                  <span>{mode === 'signup' ? 'Create Account' : 'Sign In'}</span>
                  <ArrowRight className="w-4 h-4 text-[#D2FE22]" />
                </>
              )}
            </button>
          </form>

          {/* Mode Switch */}
          <div className="text-center text-xs sm:text-sm text-slate-500 pt-1">
            {mode === 'signin' ? (
              <>
                Don't have an account?{' '}
                <button
                  type="button"
                  id="btn-switch-to-signup"
                  onClick={switchMode}
                  className="font-semibold text-[#031728] hover:underline cursor-pointer"
                >
                  Create one
                </button>
              </>
            ) : (
              <>
                Already have an account?{' '}
                <button
                  type="button"
                  id="btn-switch-to-signin"
                  onClick={switchMode}
                  className="font-semibold text-[#031728] hover:underline cursor-pointer"
                >
                  Sign in
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Inline animation keyframes */}
      <style>{`
        @keyframes authModalSlideUp {
          from {
            opacity: 0;
            transform: translateY(24px) scale(0.97);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        .animate-fadeIn {
          animation: fadeIn 0.2s ease-out forwards;
        }
      `}</style>
    </div>
  )
}
