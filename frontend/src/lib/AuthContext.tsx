/**
 * AuthContext — Manages user authentication state across the app.
 *
 * Provides login, signup, Google OAuth, GitHub OAuth, Demo account, and logout functions.
 * Uses secure httpOnly session cookies with localStorage state persistence and verification via /api/auth/me.
 */

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'

declare global {
  interface Window {
    google?: any
  }
}

// ─── Types ──────────────────────────────────────────────────────────────────────

export interface UserProfile {
  id: string
  email: string
  name: string
  avatar_url?: string | null
  provider: 'email' | 'google' | 'github' | 'demo' | string
  created_at: string
}

interface AuthTokenResponse {
  access_token: string
  token_type: string
  user: UserProfile
}

interface GoogleAuthUrlResponse {
  url: string | null
  configured: boolean
}

interface AuthContextValue {
  user: UserProfile | null
  token: string | null
  isAuthenticated: boolean
  isLoading: boolean
  authError: string | null
  setAuthError: (err: string | null) => void
  login: (email: string, password: string) => Promise<void>
  signup: (name: string, email: string, password: string) => Promise<void>
  loginWithGoogle: () => Promise<void>
  loginWithGithub: () => Promise<void>
  loginWithDemo: () => Promise<void>
  logout: () => Promise<void>
  openAuthModal: (mode?: 'signin' | 'signup') => void
  closeAuthModal: () => void
  authModalMode: 'signin' | 'signup' | null
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

// ─── Helpers ────────────────────────────────────────────────────────────────────

const STORAGE_TOKEN_KEY = 'repopilot_auth_token'
const STORAGE_USER_KEY = 'repopilot_auth_user'

function getApiBase(): string {
  const raw = (import.meta.env.VITE_API_URL as string)?.trim() || ''
  if (!raw) return ''
  if (!raw.startsWith('http://') && !raw.startsWith('https://')) {
    return `https://${raw}`
  }
  return raw.replace(/\/+$/, '')
}

const API_BASE = getApiBase()

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem(STORAGE_TOKEN_KEY)
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }
  if (options.headers) {
    if (options.headers instanceof Headers) {
      options.headers.forEach((val, key) => {
        headers[key] = val
      })
    } else if (Array.isArray(options.headers)) {
      options.headers.forEach(([key, val]) => {
        headers[key] = val
      })
    } else {
      Object.assign(headers, options.headers)
    }
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: 'include', // Ensures httpOnly cookies are automatically sent & received
    headers,
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Request failed' }))
    const msg = err.detail || `Request failed with status ${res.status}`
    throw new Error(msg)
  }
  return res.json()
}

// ─── Provider ───────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(() => {
    try {
      const storedUser = localStorage.getItem(STORAGE_USER_KEY)
      return storedUser ? JSON.parse(storedUser) : null
    } catch {
      return null
    }
  })
  const [token, setToken] = useState<string | null>(() => {
    try {
      return localStorage.getItem(STORAGE_TOKEN_KEY)
    } catch {
      return null
    }
  })
  const [isLoading, setIsLoading] = useState(true)
  const [authError, setAuthError] = useState<string | null>(null)
  const [authModalMode, setAuthModalMode] = useState<'signin' | 'signup' | null>(null)
  const didVerify = useRef(false)

  // Persist session helpers
  const persistSession = useCallback((tkn: string, usr: UserProfile) => {
    localStorage.setItem(STORAGE_TOKEN_KEY, tkn)
    localStorage.setItem(STORAGE_USER_KEY, JSON.stringify(usr))
    setToken(tkn)
    setUser(usr)
    setAuthError(null)
  }, [])

  const clearSession = useCallback(() => {
    localStorage.removeItem(STORAGE_TOKEN_KEY)
    localStorage.removeItem(STORAGE_USER_KEY)
    setToken(null)
    setUser(null)
  }, [])

  // Boot: Check OAuth query parameters (?code=... or ?error=...) & verify session from cookie / storage
  useEffect(() => {
    if (didVerify.current) return
    didVerify.current = true

    const urlParams = new URLSearchParams(window.location.search)
    const oauthCode = urlParams.get('code')
    const oauthError = urlParams.get('error')

    // Handle incoming OAuth redirect from Google
    if (oauthError) {
      setAuthError(`Authentication was cancelled or failed: ${oauthError}`)
      window.history.replaceState({}, document.title, window.location.pathname)
      setIsLoading(false)
      return
    }

    if (oauthCode) {
      window.history.replaceState({}, document.title, window.location.pathname)
      setIsLoading(true)
      apiFetch<AuthTokenResponse>('/auth/google/callback', {
        method: 'POST',
        body: JSON.stringify({
          provider: 'google',
          code: oauthCode,
        }),
      })
        .then((data) => {
          persistSession(data.access_token, data.user)
          setAuthModalMode(null)
        })
        .catch((err) => {
          setAuthError(err.message || 'Google OAuth verification failed.')
          clearSession()
        })
        .finally(() => {
          setIsLoading(false)
        })
      return
    }

    // Verify session with backend /auth/me
    apiFetch<UserProfile>('/auth/me')
      .then((verifiedUser) => {
        const currentToken = localStorage.getItem(STORAGE_TOKEN_KEY) || 'cookie_session'
        persistSession(currentToken, verifiedUser)
      })
      .catch(() => {
        // If cookie and token are missing or expired
        clearSession()
      })
      .finally(() => {
        setIsLoading(false)
      })
  }, [persistSession, clearSession])

  // ─── Auth Methods ──────────────────────────────────────────────────────────────

  const login = useCallback(async (email: string, password: string) => {
    setAuthError(null)
    const data = await apiFetch<AuthTokenResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    })
    persistSession(data.access_token, data.user)
    setAuthModalMode(null)
  }, [persistSession])

  const signup = useCallback(async (name: string, email: string, password: string) => {
    setAuthError(null)
    const data = await apiFetch<AuthTokenResponse>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, name, password }),
    })
    persistSession(data.access_token, data.user)
    setAuthModalMode(null)
  }, [persistSession])

  const loginWithGoogle = useCallback(async () => {
    setAuthError(null)
    const googleClientId = (import.meta.env.VITE_GOOGLE_CLIENT_ID as string)?.trim()

    // 1. If Google Identity Services SDK is loaded and Client ID is configured, open Google Account Chooser popup
    if (googleClientId && window.google?.accounts?.oauth2) {
      return new Promise<void>((resolve, reject) => {
        try {
          const client = window.google.accounts.oauth2.initCodeClient({
            client_id: googleClientId,
            scope: 'openid email profile',
            ux_mode: 'popup',
            callback: async (response: any) => {
              if (response.error) {
                const errMsg = response.error_description || response.error
                setAuthError(`Google sign-in was cancelled or failed: ${errMsg}`)
                reject(new Error(errMsg))
                return
              }
              try {
                const data = await apiFetch<AuthTokenResponse>('/auth/google/callback', {
                  method: 'POST',
                  body: JSON.stringify({
                    provider: 'google',
                    code: response.code,
                  }),
                })
                persistSession(data.access_token, data.user)
                setAuthModalMode(null)
                resolve()
              } catch (err: any) {
                setAuthError(err.message || 'Google authentication failed.')
                reject(err)
              }
            },
          })
          client.requestCode()
        } catch (e: any) {
          setAuthError(e.message || 'Failed to initialize Google sign-in.')
          reject(e)
        }
      })
    }

    // 2. Check if backend has Google OAuth URL configured
    try {
      const urlInfo = await apiFetch<GoogleAuthUrlResponse>('/auth/google/url')
      if (urlInfo.configured && urlInfo.url) {
        window.location.href = urlInfo.url
        return
      }
    } catch {
      /* continue */
    }

    // 3. If neither frontend nor backend has Google Client ID configured
    throw new Error(
      'Google OAuth Client ID is not configured yet. Please set GOOGLE_CLIENT_ID in your environment or use the Demo Account.'
    )
  }, [persistSession])

  const loginWithGithub = useCallback(async () => {
    setAuthError(null)
    const data = await apiFetch<AuthTokenResponse>('/auth/github', {
      method: 'POST',
      body: JSON.stringify({
        provider: 'github',
        email: 'github.developer@repopilot.ai',
        name: 'GitHub Developer',
      }),
    })
    persistSession(data.access_token, data.user)
    setAuthModalMode(null)
  }, [persistSession])

  const loginWithDemo = useCallback(async () => {
    setAuthError(null)
    const data = await apiFetch<AuthTokenResponse>('/auth/demo', {
      method: 'POST',
    })
    persistSession(data.access_token, data.user)
    setAuthModalMode(null)
  }, [persistSession])

  const logout = useCallback(async () => {
    try {
      await apiFetch('/auth/logout', {
        method: 'POST',
      })
    } catch {
      /* best-effort server-side invalidation */
    }
    clearSession()
  }, [clearSession])

  const openAuthModal = useCallback((mode: 'signin' | 'signup' = 'signin') => {
    setAuthError(null)
    setAuthModalMode(mode)
  }, [])

  const closeAuthModal = useCallback(() => {
    setAuthModalMode(null)
  }, [])

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthenticated: !!user,
        isLoading,
        authError,
        setAuthError,
        login,
        signup,
        loginWithGoogle,
        loginWithGithub,
        loginWithDemo,
        logout,
        openAuthModal,
        closeAuthModal,
        authModalMode,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

// ─── Hook ────────────────────────────────────────────────────────────────────────

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth must be used within an <AuthProvider>')
  }
  return ctx
}
