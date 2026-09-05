import React from 'react'
import { RepoSummary } from '../types'
import { getRepoDisplayName, truncateHash } from '../lib/utils'
import {
  Compass,
  FolderGit2,
  GitBranch,
  GitFork,
  Layers,
  MessageSquare,
  PlusCircle,
  Search,
  ExternalLink,
} from 'lucide-react'

interface HeaderProps {
  activeTab: 'connect' | 'dashboard' | 'ask'
  setActiveTab: (tab: 'connect' | 'dashboard' | 'ask') => void
  repos: RepoSummary[]
  activeRepoId: string | null
  setActiveRepoId: (repoId: string) => void
  backendHealthy: boolean
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  repos,
  activeRepoId,
  setActiveRepoId,
  backendHealthy,
}) => {
  return (
    <header className="sticky top-0 z-50 w-full bg-white border-b border-slate-200/90 shadow-sm">
      {/* Top Navbar Row */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
        {/* Left: Nebius-style Logo Badge */}
        <div className="flex items-center gap-6">
          <div
            onClick={() => setActiveTab('dashboard')}
            className="cursor-pointer flex items-center gap-2 group"
          >
            <div className="nebius-logo-badge text-sm sm:text-base font-black px-3 py-1 tracking-tight">
              REPOPILOT
            </div>
          </div>

          {/* Primary Nav Links */}
          <nav className="hidden lg:flex items-center gap-6 text-xs sm:text-sm font-medium text-slate-700">
            <button
              id="nav-dashboard"
              onClick={() => setActiveTab('dashboard')}
              className={`hover:text-black transition-colors pb-0.5 cursor-pointer ${
                activeTab === 'dashboard'
                  ? 'text-black font-bold border-b-2 border-black'
                  : 'text-slate-600'
              }`}
            >
              Repositories
              {repos.length > 0 && (
                <span className="ml-1.5 px-1.5 py-0.2 rounded-full bg-slate-100 text-xs font-semibold text-slate-800 border border-slate-200">
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

            <button
              id="nav-ask"
              onClick={() => setActiveTab('ask')}
              className={`hover:text-black transition-colors pb-0.5 cursor-pointer ${
                activeTab === 'ask'
                  ? 'text-black font-bold border-b-2 border-black'
                  : 'text-slate-600'
              }`}
            >
              Ask Assistant
            </button>

            <span className="text-slate-300">|</span>

            <span className="text-slate-500 hover:text-black transition-colors cursor-default">
              ChromaDB Store
            </span>
            <span className="text-slate-500 hover:text-black transition-colors cursor-default">
              Tree-sitter AST
            </span>
          </nav>
        </div>

        {/* Right Actions: Search + Fast Action Pills */}
        <div className="flex items-center gap-3">
          {/* Active Repo Quick Selector */}
          {repos.length > 0 && (
            <div className="hidden sm:flex items-center gap-1.5 bg-slate-100 border border-slate-200 rounded-full px-3 py-1 text-xs">
              <GitFork className="w-3.5 h-3.5 text-slate-700" />
              <select
                id="active-repo-select"
                value={activeRepoId || ''}
                onChange={(e) => setActiveRepoId(e.target.value)}
                className="bg-transparent text-slate-800 border-none outline-none text-xs font-semibold cursor-pointer max-w-[140px] truncate"
              >
                {repos.map((r) => (
                  <option key={r.repo_id} value={r.repo_id}>
                    {getRepoDisplayName(r.url)}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* FastAPI Docs Link Pill */}
          <a
            href="http://localhost:8000/docs"
            target="_blank"
            rel="noopener noreferrer"
            className="hidden md:inline-flex items-center gap-1.5 bg-[#031728] text-white hover:bg-[#072440] text-xs font-semibold px-4 py-1.5 rounded-full transition-all"
          >
            <span>Docs</span>
            <ExternalLink className="w-3 h-3" />
          </a>

          {/* Backend Online Pill */}
          <div
            id="backend-health-indicator"
            className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#031728] text-white text-xs font-medium"
            title={backendHealthy ? 'Backend API connected on http://localhost:8000' : 'Backend offline'}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                backendHealthy ? 'bg-[#D2FE22]' : 'bg-red-400'
              }`}
            />
            <span className="text-[11px] font-semibold">
              {backendHealthy ? 'API Online' : 'API Offline'}
            </span>
          </div>
        </div>
      </div>

      {/* Mobile Sub-Navigation Bar */}
      <div className="lg:hidden flex items-center justify-around border-t border-slate-100 px-4 py-2 bg-slate-50 text-xs font-medium">
        <button
          onClick={() => setActiveTab('dashboard')}
          className={`py-1 ${activeTab === 'dashboard' ? 'text-black font-bold border-b-2 border-black' : 'text-slate-600'}`}
        >
          Repositories ({repos.length})
        </button>
        <button
          onClick={() => setActiveTab('connect')}
          className={`py-1 ${activeTab === 'connect' ? 'text-black font-bold border-b-2 border-black' : 'text-slate-600'}`}
        >
          Connect
        </button>
        <button
          onClick={() => setActiveTab('ask')}
          className={`py-1 ${activeTab === 'ask' ? 'text-black font-bold border-b-2 border-black' : 'text-slate-600'}`}
        >
          Ask Assistant
        </button>
      </div>
    </header>
  )
}
