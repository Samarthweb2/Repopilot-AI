import React, { useState, useEffect, useRef } from 'react'
import { RepoSummary } from '../types'
import { RepoPilotLogo } from './RepoPilotLogo'
import { useAuth, UserProfile } from '../lib/AuthContext'
import {
  Sparkles,
  LogOut,
  ChevronDown,
  User,
  FolderGit2,
  MessageSquare,
  Shield,
  ArrowRight,
  GitBranch,
} from 'lucide-react'

interface HeaderProps {
  activeTab: 'landing' | 'connect' | 'dashboard' | 'ask'
  setActiveTab: (tab: 'landing' | 'connect' | 'dashboard' | 'ask') => void
  repos: RepoSummary[]
  activeRepoId: string | null
  setActiveRepoId: (repoId: string) => void
  backendHealthy?: boolean
  onSignOut?: () => void
}

// ─── Provider Badge ──────────────────────────────────────────────────────────────

function ProviderBadge({ provider }: { provider: string }) {
  const config: Record<string, { label: string; bg: string; text: string }> = {
    google: { label: 'Google', bg: 'bg-blue-50 border-blue-200', text: 'text-blue-700' },
    github: { label: 'GitHub', bg: 'bg-slate-100 border-slate-300', text: 'text-slate-700' },
    email: { label: 'Email', bg: 'bg-emerald-50 border-emerald-200', text: 'text-emerald-700' },
    demo: { label: 'Demo', bg: 'bg-amber-50 border-amber-200', text: 'text-amber-800' },
  }
  const c = config[provider] || config.email
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide border ${c.bg} ${c.text}`}>
      {c.label}
    </span>
  )
}

// ─── User Avatar ─────────────────────────────────────────────────────────────────

function UserAvatar({ user, size = 'sm' }: { user: UserProfile; size?: 'sm' | 'md' }) {
  const [imgError, setImgError] = useState(false)
  const dimensions = size === 'sm' ? 'w-8 h-8' : 'w-10 h-10'
  const textSize = size === 'sm' ? 'text-xs' : 'text-sm'

  const initials = user.name
    .split(' ')
    .map((p) => p[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)

  if (user.avatar_url && !imgError) {
    return (
      <img
        src={user.avatar_url}
        alt={user.name}
        className={`${dimensions} rounded-full object-cover ring-2 ring-slate-200`}
        onError={() => setImgError(true)}
      />
    )
  }

  return (
    <div className={`${dimensions} rounded-full bg-[#031728] flex items-center justify-center ring-2 ring-slate-200`}>
      <span className={`${textSize} font-bold text-[#D2FE22]`}>{initials || 'U'}</span>
    </div>
  )
}

// ─── User Dropdown Menu ──────────────────────────────────────────────────────────

function UserMenu({
  user,
  onNavigateTo,
  onSignOut,
}: {
  user: UserProfile
  onNavigateTo: (tab: 'dashboard' | 'connect' | 'ask') => void
  onSignOut: () => void
}) {
  const [open, setOpen] = useState(false)
  const [confirmSignOut, setConfirmSignOut] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  // Close menu on click outside
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false)
        setConfirmSignOut(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  // Close on Escape key
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
        setConfirmSignOut(false)
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open])

  return (
    <div ref={menuRef} className="relative">
      <button
        id="user-menu-button"
        onClick={() => { setOpen(!open); setConfirmSignOut(false) }}
        className="flex items-center gap-2 px-2.5 py-1.5 rounded-full hover:bg-slate-100 transition-colors cursor-pointer border border-slate-200/80 bg-white"
        aria-label="User menu"
      >
        <UserAvatar user={user} size="sm" />
        <span className="hidden sm:block text-xs sm:text-sm font-semibold text-slate-800 max-w-[130px] truncate">
          {user.name}
        </span>
        <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div
          id="user-menu-dropdown"
          className="absolute right-0 top-full mt-2 w-72 bg-white rounded-xl shadow-xl border border-slate-200/90 overflow-hidden z-50 animate-fadeIn"
        >
          {/* User Info Section */}
          <div className="px-4 py-3.5 border-b border-slate-100 bg-slate-50/50">
            <div className="flex items-center gap-3">
              <UserAvatar user={user} size="md" />
              <div className="min-w-0 flex-1">
                <p id="user-menu-name" className="text-sm font-bold text-[#031728] truncate">{user.name}</p>
                <p id="user-menu-email" className="text-xs text-slate-500 truncate">{user.email}</p>
                <div className="mt-1">
                  <ProviderBadge provider={user.provider} />
                </div>
              </div>
            </div>
          </div>

          {/* Quick Links */}
          <div className="py-1.5">
            <button
              onClick={() => { onNavigateTo('dashboard'); setOpen(false) }}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 hover:text-black transition-colors cursor-pointer"
            >
              <FolderGit2 className="w-4 h-4 text-slate-400" />
              <span>Workspace Dashboard</span>
            </button>
            <button
              onClick={() => { onNavigateTo('connect'); setOpen(false) }}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 hover:text-black transition-colors cursor-pointer"
            >
              <GitBranch className="w-4 h-4 text-slate-400" />
              <span>Connect Codebase</span>
            </button>
            <button
              onClick={() => { onNavigateTo('ask'); setOpen(false) }}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 hover:text-black transition-colors cursor-pointer"
            >
              <MessageSquare className="w-4 h-4 text-slate-400" />
              <span>Ask Assistant</span>
            </button>
          </div>

          {/* Sign Out */}
          <div className="border-t border-slate-100 py-1.5">
            {confirmSignOut ? (
              <div className="px-4 py-2.5 space-y-2">
                <p className="text-xs text-slate-500 font-medium">Sign out of your account?</p>
                <div className="flex items-center gap-2">
                  <button
                    id="btn-confirm-signout"
                    onClick={() => { onSignOut(); setOpen(false) }}
                    className="flex-1 py-1.5 rounded-lg bg-red-50 border border-red-200 text-xs font-semibold text-red-700 hover:bg-red-100 transition-colors cursor-pointer"
                  >
                    Yes, sign out
                  </button>
                  <button
                    onClick={() => setConfirmSignOut(false)}
                    className="flex-1 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                id="btn-trigger-signout"
                onClick={() => setConfirmSignOut(true)}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
                <span>Sign Out</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Main Header Component ──────────────────────────────────────────────────────

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  repos,
  activeRepoId: _activeRepoId,
  setActiveRepoId: _setActiveRepoId,
  backendHealthy: _backendHealthy,
  onSignOut,
}) => {
  const { user, isAuthenticated, openAuthModal, logout } = useAuth()
  const [isScrolled, setIsScrolled] = useState(false)

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20)
    }
    handleScroll()
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  return (
    <header
      className={`sticky top-0 z-50 w-full bg-white transition-all duration-200 ${
        isScrolled
          ? 'border-b border-slate-200/90 shadow-xs'
          : 'border-b border-transparent shadow-none'
      }`}
    >
      {/* Top Navbar Row */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-18 sm:h-20 flex items-center justify-between relative">
        {/* Left: Stacked Hexagon R Brand Logo */}
        <div className="flex items-center shrink-0 py-1.5">
          <div
            id="brand-logo-button"
            onClick={() => {
              if (isAuthenticated) {
                setActiveTab('dashboard')
              } else {
                setActiveTab('landing')
              }
              window.scrollTo({ top: 0, behavior: 'smooth' })
            }}
            className="cursor-pointer flex items-center group"
          >
            <RepoPilotLogo size="md" />
          </div>
        </div>

        {/* Center: Horizontally Centered Primary Nav Links */}
        <nav className="hidden lg:flex items-center justify-center gap-6 text-xs sm:text-sm font-medium absolute left-1/2 -translate-x-1/2">
          {!isAuthenticated && (
            <button
              id="nav-overview"
              onClick={() => setActiveTab('landing')}
              className={`hover:text-black transition-colors pb-0.5 cursor-pointer ${
                activeTab === 'landing'
                  ? 'text-black font-bold border-b-2 border-black'
                  : 'text-slate-600'
              }`}
            >
              Overview
            </button>
          )}

          <button
            id="nav-dashboard"
            onClick={() => {
              if (isAuthenticated) {
                setActiveTab('dashboard')
              } else {
                openAuthModal('signin')
              }
            }}
            className={`hover:text-black transition-colors pb-0.5 cursor-pointer inline-flex items-center gap-1.5 ${
              activeTab === 'dashboard'
                ? 'text-black font-bold border-b-2 border-black'
                : 'text-slate-600'
            }`}
          >
            <span>Repositories</span>
            {repos.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-slate-100 text-[11px] font-semibold text-slate-800 border border-slate-200">
                {repos.length}
              </span>
            )}
          </button>

          <button
            id="nav-connect"
            onClick={() => {
              if (isAuthenticated) {
                setActiveTab('connect')
              } else {
                openAuthModal('signin')
              }
            }}
            className={`hover:text-black transition-colors pb-0.5 cursor-pointer ${
              activeTab === 'connect'
                ? 'text-black font-bold border-b-2 border-black'
                : 'text-slate-600'
            }`}
          >
            Connect Codebase
          </button>

          {/* Ask Assistant: Yellow Highlighted Oval Background Pill */}
          <button
            id="nav-ask"
            onClick={() => {
              if (isAuthenticated) {
                setActiveTab('ask')
              } else {
                openAuthModal('signin')
              }
            }}
            className={`inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs sm:text-sm font-bold transition-all cursor-pointer shadow-xs ${
              activeTab === 'ask'
                ? 'bg-[#D2FE22] text-[#0F1115] ring-2 ring-black/25'
                : 'bg-[#D2FE22] text-[#0F1115] hover:bg-[#c2ed1e]'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 fill-[#0F1115]" />
            <span>Ask Assistant</span>
          </button>
        </nav>

        {/* Right Actions */}
        <div className="flex items-center gap-2.5 sm:gap-3 shrink-0">
          {isAuthenticated && user ? (
            /* Authenticated: User Avatar & Dropdown Menu */
            <div className="flex items-center gap-2.5">
              <UserMenu
                user={user}
                onNavigateTo={(tab) => {
                  setActiveTab(tab)
                  window.scrollTo({ top: 0, behavior: 'smooth' })
                }}
                onSignOut={() => {
                  if (onSignOut) {
                    onSignOut()
                  } else {
                    setActiveTab('landing')
                    window.scrollTo({ top: 0, behavior: 'smooth' })
                  }
                  logout()
                }}
              />
            </div>
          ) : (
            /* Unauthenticated: Sign in & Sign up Buttons */
            <>
              <button
                id="btn-sign-in"
                onClick={() => openAuthModal('signin')}
                className="cursor-pointer text-xs sm:text-sm font-semibold text-slate-700 hover:text-black px-3.5 py-1.5 rounded-full hover:bg-slate-100 transition-colors"
              >
                Sign in
              </button>
              <button
                id="btn-sign-up"
                onClick={() => openAuthModal('signup')}
                className="cursor-pointer inline-flex items-center justify-center px-4 py-1.5 rounded-full text-xs sm:text-sm font-semibold bg-[#031728] text-white hover:bg-[#072440] transition-all shadow-sm"
              >
                Sign up
              </button>
            </>
          )}
        </div>
      </div>

      {/* Mobile Sub-Navigation Bar */}
      <div className="lg:hidden flex items-center justify-around border-t border-slate-100 px-3 py-2 bg-slate-50 text-xs font-medium">
        {!isAuthenticated && (
          <button
            onClick={() => setActiveTab('landing')}
            className={`py-1 ${activeTab === 'landing' ? 'text-black font-bold border-b-2 border-black' : 'text-slate-600'}`}
          >
            Overview
          </button>
        )}
        <button
          onClick={() => {
            if (isAuthenticated) setActiveTab('dashboard')
            else openAuthModal('signin')
          }}
          className={`py-1 ${activeTab === 'dashboard' ? 'text-black font-bold border-b-2 border-black' : 'text-slate-600'}`}
        >
          Repositories {repos.length > 0 && `(${repos.length})`}
        </button>
        <button
          onClick={() => {
            if (isAuthenticated) setActiveTab('connect')
            else openAuthModal('signin')
          }}
          className={`py-1 ${activeTab === 'connect' ? 'text-black font-bold border-b-2 border-black' : 'text-slate-600'}`}
        >
          Connect Codebase
        </button>
        <button
          onClick={() => {
            if (isAuthenticated) setActiveTab('ask')
            else openAuthModal('signin')
          }}
          className={`px-3 py-1 rounded-full font-bold bg-[#D2FE22] text-[#0F1115] shadow-xs ${
            activeTab === 'ask' ? 'ring-2 ring-black/25' : ''
          }`}
        >
          Ask Assistant
        </button>
      </div>
    </header>
  )
}
