import React, { useState, useEffect } from 'react'
import { Header } from './components/Header'
import { LandingPageView } from './views/LandingPageView'
import { DashboardView } from './views/DashboardView'
import { ConnectRepoView } from './views/ConnectRepoView'
import { AskView } from './views/AskView'
import { checkBackendHealth, getRepos } from './lib/api'
import { RepoSummary } from './types'
import {
  ArrowRight,
  Database,
  FolderGit2,
  GitBranch,
  Layers,
  Sparkles,
} from 'lucide-react'

export function App() {
  const [activeTab, setActiveTab] = useState<'landing' | 'dashboard' | 'connect' | 'ask'>('landing')
  const [repos, setRepos] = useState<RepoSummary[]>([])
  const [activeRepoId, setActiveRepoId] = useState<string | null>(null)
  const [backendHealthy, setBackendHealthy] = useState<boolean>(true)

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
      />

      {/* Primary Landing Page (First View) */}
      {activeTab === 'landing' ? (
        <LandingPageView
          onNavigateToConnect={handleNavigateToConnect}
          onNavigateToDashboard={handleNavigateToDashboard}
          onNavigateToAsk={() => handleNavigateToAsk()}
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
                  onClick={() => setActiveTab('landing')}
                  className="px-3 py-1 rounded-full bg-white/10 hover:bg-white/20 text-xs font-semibold text-slate-200 transition-colors cursor-pointer"
                >
                  Back to Overview
                </button>
                <button
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

      {/* Nebius Minimalist Footer */}
      <footer className="border-t border-slate-200 bg-white py-8 text-xs text-slate-600 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div
              onClick={() => setActiveTab('landing')}
              className="nebius-logo-badge text-xs font-black px-2 py-0.5 cursor-pointer"
            >
              REPOPILOT
            </div>
            <span className="font-semibold text-slate-900">RepoPilot AI</span>
            <span>—</span>
            <span>Autonomous Code Intelligence Platform</span>
          </div>

          <div className="flex items-center gap-4 text-slate-500 font-medium">
            <button
              onClick={() => setActiveTab('landing')}
              className="hover:text-black cursor-pointer"
            >
              Overview
            </button>
            <span>•</span>
            <button
              onClick={handleNavigateToDashboard}
              className="hover:text-black cursor-pointer"
            >
              Repositories
            </button>
            <span>•</span>
            <button
              onClick={() => handleNavigateToAsk()}
              className="hover:text-black cursor-pointer"
            >
              Ask Assistant
            </button>
            <span>•</span>
            <span>Tree-sitter AST</span>
            <span>•</span>
            <span>ChromaDB Vector Store</span>
          </div>
        </div>
      </footer>
    </div>
  )
}

export default App
