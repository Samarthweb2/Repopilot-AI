import React, { useState, useEffect } from 'react'
import { Header } from './components/Header'
import { LandingPageView } from './views/LandingPageView'
import { DashboardView } from './views/DashboardView'
import { ConnectRepoView } from './views/ConnectRepoView'
import { AskView } from './views/AskView'
import { AuthModal } from './components/AuthModal'
import { AuthProvider, useAuth } from './lib/AuthContext'
import { checkBackendHealth, getRepos } from './lib/api'
import { RepoSummary } from './types'

function AppContent() {
  const { openAuthModal, isAuthenticated, isLoading } = useAuth()

  // Default active tab: 'dashboard' for authenticated users, 'landing' for logged-out visitors
  const [activeTab, setActiveTab] = useState<'landing' | 'dashboard' | 'connect' | 'ask'>(() => {
    try {
      return localStorage.getItem('repopilot_auth_user') ? 'dashboard' : 'landing'
    } catch {
      return 'landing'
    }
  })
  const [repos, setRepos] = useState<RepoSummary[]>([])
  const [activeRepoId, setActiveRepoId] = useState<string | null>(null)
  const [backendHealthy, setBackendHealthy] = useState<boolean>(true)

  // Sync workspace routing with authentication state
  useEffect(() => {
    if (!isLoading) {
      if (isAuthenticated && activeTab === 'landing') {
        setActiveTab('dashboard')
      } else if (!isAuthenticated && activeTab !== 'landing') {
        setActiveTab('landing')
      }
    }
  }, [isAuthenticated, isLoading])

  // Direct callback invoked whenever login/signup succeeds
  const handleAuthSuccess = () => {
    setActiveTab('dashboard')
    window.scrollTo({ top: 0, behavior: 'smooth' })
    refreshRepos()
  }

  // Direct callback invoked when user signs out
  const handleSignOut = () => {
    setActiveTab('landing')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const refreshRepos = async () => {
    try {
      const data = await getRepos()
      setRepos(data)
      if (data.length > 0 && !activeRepoId) {
        setActiveRepoId(data[0].repo_id)
      }
    } catch (err) {
      console.error('Error fetching repositories in App:', err)
    }
  }

  const pollHealth = async () => {
    const ok = await checkBackendHealth()
    setBackendHealthy(ok)
  }

  useEffect(() => {
    pollHealth()
    refreshRepos()

    const interval = setInterval(() => {
      pollHealth()
    }, 10000)

    return () => clearInterval(interval)
  }, [])

  const handleRepoConnected = (repo: RepoSummary) => {
    setActiveRepoId(repo.repo_id)
    refreshRepos()
  }

  const handleNavigateToAsk = (repoId?: string) => {
    if (repoId) {
      setActiveRepoId(repoId)
    } else if (repos.length > 0 && !activeRepoId) {
      setActiveRepoId(repos[0].repo_id)
    }
    setActiveTab('ask')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleNavigateToConnect = () => {
    setActiveTab('connect')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleNavigateToDashboard = () => {
    setActiveTab('dashboard')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#f8fafc] text-[#031728] font-sans antialiased selection:bg-[#D2FE22] selection:text-black">
      {/* Top Navbar */}
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        repos={repos}
        activeRepoId={activeRepoId}
        setActiveRepoId={setActiveRepoId}
        backendHealthy={backendHealthy}
        onSignOut={handleSignOut}
      />

      {/* Primary Landing Page (For Logged-out Visitors Only) */}
      {!isAuthenticated || activeTab === 'landing' ? (
        <LandingPageView
          onNavigateToConnect={handleNavigateToConnect}
          onNavigateToDashboard={handleNavigateToDashboard}
          onNavigateToAsk={() => handleNavigateToAsk()}
          onRegister={() => openAuthModal('signup')}
          isAuthenticated={isAuthenticated}
          repoCount={repos.length}
        />
      ) : (
        <>
          {/* Workspace Banner for App Views */}
          <div className="bg-[#031728] text-white border-b border-slate-800 py-6 px-4 sm:px-6 lg:px-8">
            <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="px-2.5 py-0.5 rounded-full bg-[#D2FE22] text-black text-xs font-bold font-nebius uppercase tracking-wider">
                  Workspace
                </span>
                <h2 className="text-xl font-bold font-nebius text-white">
                  {activeTab === 'dashboard' && 'Repository Dashboard'}
                  {activeTab === 'connect' && 'Connect New Codebase'}
                  {activeTab === 'ask' && 'Autonomous Codebase Assistant'}
                </h2>
              </div>

              <div className="flex items-center gap-2">
                <button
                  id="btn-workspace-dashboard"
                  onClick={handleNavigateToDashboard}
                  className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors cursor-pointer ${
                    activeTab === 'dashboard'
                      ? 'bg-[#D2FE22] text-black'
                      : 'bg-white/10 text-slate-200 hover:bg-white/20'
                  }`}
                >
                  Repositories ({repos.length})
                </button>
                <button
                  id="btn-workspace-connect"
                  onClick={handleNavigateToConnect}
                  className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors cursor-pointer ${
                    activeTab === 'connect'
                      ? 'bg-[#D2FE22] text-black'
                      : 'bg-white/10 text-slate-200 hover:bg-white/20'
                  }`}
                >
                  Connect Repo
                </button>
                <button
                  id="btn-workspace-ask"
                  onClick={() => handleNavigateToAsk()}
                  className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors cursor-pointer ${
                    activeTab === 'ask'
                      ? 'bg-[#D2FE22] text-black'
                      : 'bg-white/10 text-slate-200 hover:bg-white/20'
                  }`}
                >
                  Ask Assistant
                </button>
              </div>
            </div>
          </div>

          {/* Main View Workspace */}
          <main id="nebius-main-content" className="flex-1 bg-[#f8fafc] py-8 relative z-10">
            {activeTab === 'dashboard' && (
              <DashboardView
                onSelectRepo={(id) => setActiveRepoId(id)}
                onNavigateToConnect={handleNavigateToConnect}
                onNavigateToAsk={handleNavigateToAsk}
                activeRepoId={activeRepoId}
              />
            )}

            {activeTab === 'connect' && (
              <ConnectRepoView
                onRepoConnected={handleRepoConnected}
                onNavigateToAsk={handleNavigateToAsk}
              />
            )}

            {activeTab === 'ask' && (
              <AskView
                repos={repos}
                activeRepoId={activeRepoId}
                onSelectRepo={(id) => setActiveRepoId(id)}
              />
            )}
          </main>
        </>
      )}

      {/* Footer */}
      <footer className="border-t border-slate-200/80 bg-white py-8 text-xs sm:text-sm text-slate-700 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 sm:gap-6">
          <div className="flex flex-wrap items-center gap-x-6 sm:gap-x-8 gap-y-2">
            <a
              href="http://localhost:8000/docs"
              target="_blank"
              rel="noreferrer"
              className="text-slate-700 hover:text-black transition-colors"
            >
              RepoPilot AI Cloud Docs
            </a>
            <button
              onClick={() => {
                if (isAuthenticated) setActiveTab('dashboard')
                else openAuthModal('signin')
              }}
              className="text-slate-700 hover:text-black transition-colors cursor-pointer"
            >
              Workspace Docs
            </button>
            <div className="flex items-center gap-1.5 text-slate-700">
              <span className={`w-2 h-2 rounded-full inline-block ${backendHealthy ? 'bg-emerald-500' : 'bg-red-500'}`} />
              <span>Status</span>
            </div>
            <a
              href="https://github.com/Samarthweb2/Repopilot-AI"
              target="_blank"
              rel="noreferrer"
              className="text-slate-700 hover:text-black transition-colors"
            >
              GitHub
            </a>
            <a
              href="https://discord.com"
              target="_blank"
              rel="noreferrer"
              className="text-slate-700 hover:text-black transition-colors"
            >
              Discord
            </a>
          </div>

          <div className="text-slate-500 text-xs sm:text-sm shrink-0">
            © 2026 RepoPilot AI.
          </div>
        </div>
      </footer>

      {/* Global Auth Modal */}
      <AuthModal onAuthSuccess={handleAuthSuccess} />
    </div>
  )
}

export function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  )
}

export default App
