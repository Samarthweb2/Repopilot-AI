import React, { useState, useEffect } from 'react'
import { RepoSummary } from '../types'
import { RepoPilotLogo } from './RepoPilotLogo'
import {
  Sparkles,
  X,
  Lock,
  ArrowRight,
} from 'lucide-react'

interface HeaderProps {
  activeTab: 'landing' | 'connect' | 'dashboard' | 'ask'
  setActiveTab: (tab: 'landing' | 'connect' | 'dashboard' | 'ask') => void
  repos: RepoSummary[]
  activeRepoId: string | null
  setActiveRepoId: (repoId: string) => void
  backendHealthy?: boolean
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  repos,
  activeRepoId: _activeRepoId,
  setActiveRepoId: _setActiveRepoId,
}) => {
  const [authModal, setAuthModal] = useState<'signin' | 'signup' | null>(null)
  const [isScrolled, setIsScrolled] = useState(false)
  const [authEmail, setAuthEmail] = useState('')
  const [authPassword, setAuthPassword] = useState('')
  const [authSubmitted, setAuthSubmitted] = useState(false)

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
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between relative">
        {/* Left: Nebius-style Logo Badge */}
        <div className="flex items-center shrink-0">
          <div
            onClick={() => setActiveTab('landing')}
            className="cursor-pointer flex items-center gap-2 group"
          >
            <RepoPilotLogo size="md" />
          </div>
        </div>

        {/* Center: Horizontally Centered Primary Nav Links */}
        <nav className="hidden lg:flex items-center justify-center gap-6 text-xs sm:text-sm font-medium absolute left-1/2 -translate-x-1/2">
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

          <button
            id="nav-dashboard"
            onClick={() => setActiveTab('dashboard')}
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
            onClick={() => setActiveTab('connect')}
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
            onClick={() => setActiveTab('ask')}
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

        {/* Right Actions: Sign in & Sign up Buttons */}
        <div className="flex items-center gap-2.5 sm:gap-3 shrink-0">
          {/* Sign in Placeholder Button */}
          <button
            id="btn-sign-in"
            onClick={() => setAuthModal('signin')}
            className="cursor-pointer text-xs sm:text-sm font-semibold text-slate-700 hover:text-black px-3.5 py-1.5 rounded-full hover:bg-slate-100 transition-colors"
          >
            Sign in
          </button>

          {/* Sign up Placeholder Button */}
          <button
            id="btn-sign-up"
            onClick={() => setAuthModal('signup')}
            className="cursor-pointer inline-flex items-center justify-center px-4 py-1.5 rounded-full text-xs sm:text-sm font-semibold bg-[#031728] text-white hover:bg-[#072440] transition-all shadow-sm"
          >
            Sign up
          </button>
        </div>
      </div>

      {/* Mobile Sub-Navigation Bar */}
      <div className="lg:hidden flex items-center justify-around border-t border-slate-100 px-3 py-2 bg-slate-50 text-xs font-medium">
        <button
          onClick={() => setActiveTab('landing')}
          className={`py-1 ${activeTab === 'landing' ? 'text-black font-bold border-b-2 border-black' : 'text-slate-600'}`}
        >
          Overview
        </button>
        <button
          onClick={() => setActiveTab('dashboard')}
          className={`py-1 ${activeTab === 'dashboard' ? 'text-black font-bold border-b-2 border-black' : 'text-slate-600'}`}
        >
          Repositories {repos.length > 0 && `(${repos.length})`}
        </button>
        <button
          onClick={() => setActiveTab('connect')}
          className={`py-1 ${activeTab === 'connect' ? 'text-black font-bold border-b-2 border-black' : 'text-slate-600'}`}
        >
          Connect Codebase
        </button>
        <button
          onClick={() => setActiveTab('ask')}
          className={`px-3 py-1 rounded-full font-bold bg-[#D2FE22] text-[#0F1115] shadow-xs ${
            activeTab === 'ask' ? 'ring-2 ring-black/25' : ''
          }`}
        >
          Ask Assistant
        </button>
      </div>

      {/* Placeholder Authentication Modal */}
      {authModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-fadeIn">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 sm:p-8 shadow-2xl border border-slate-200 relative space-y-6">
            <button
              onClick={() => setAuthModal(null)}
              className="absolute top-4 right-4 p-1.5 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="space-y-2">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#D2FE22]/20 border border-[#D2FE22] text-xs font-bold text-slate-900 uppercase tracking-wider">
                <Lock className="w-3.5 h-3.5 text-black" />
                {authModal === 'signin' ? 'Account Access' : 'Create Account'}
              </div>
              <h3 className="text-2xl font-bold text-[#031728]">
                {authModal === 'signin' ? 'Sign in to RepoPilot' : 'Get started with RepoPilot'}
              </h3>
              <p className="text-xs text-slate-500">
                {authModal === 'signin'
                  ? 'Access your private repositories, team workspaces, and cached AST symbol graphs.'
                  : 'Start indexing Git codebases and querying deep call-chains with AI.'}
              </p>
            </div>

            <div className="space-y-4">
              <button
                type="button"
                onClick={() => {
                  setAuthModal(null)
                  setActiveTab('ask')
                }}
                className="w-full flex items-center justify-center gap-2.5 py-2.5 px-4 rounded-xl border border-slate-300 hover:bg-slate-50 text-sm font-semibold text-slate-800 transition-all cursor-pointer"
              >
                <svg className="w-4 h-4 fill-current shrink-0" viewBox="0 0 24 24">
                  <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
                </svg>
                <span>Continue with GitHub</span>
              </button>

              <div className="relative flex items-center justify-center text-xs text-slate-400">
                <span className="border-t border-slate-200 w-full" />
                <span className="bg-white px-3 shrink-0">or continue with email</span>
                <span className="border-t border-slate-200 w-full" />
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Work Email</label>
                  <input
                    type="email"
                    placeholder="developer@company.com"
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-black"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Password</label>
                  <input
                    type="password"
                    placeholder="••••••••"
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-black"
                  />
                </div>
              </div>

              <div className="p-3 bg-amber-50 rounded-xl border border-amber-200/60 text-xs text-amber-800 leading-relaxed">
                <strong>Preview Mode:</strong> Authentication is currently a placeholder UI. All codebase indexing and AI assistant features are immediately accessible without signing in!
              </div>

              <button
                type="button"
                onClick={() => {
                  setAuthModal(null)
                  setActiveTab('ask')
                }}
                className="w-full inline-flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-[#031728] hover:bg-[#072440] text-white text-sm font-semibold transition-all cursor-pointer shadow-sm"
              >
                <span>Continue to Workspace</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  )
}
