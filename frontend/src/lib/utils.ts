import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatTimeAgo(isoString?: string | null): string {
  if (!isoString) return 'Unknown date'
  try {
    const date = new Date(isoString)
    const now = new Date()
    const diffSeconds = Math.floor((now.getTime() - date.getTime()) / 1000)

    if (diffSeconds < 60) return `${diffSeconds}s ago`
    const diffMinutes = Math.floor(diffSeconds / 60)
    if (diffMinutes < 60) return `${diffMinutes}m ago`
    const diffHours = Math.floor(diffMinutes / 60)
    if (diffHours < 24) return `${diffHours}h ago`
    const diffDays = Math.floor(diffHours / 24)
    if (diffDays < 30) return `${diffDays}d ago`
    return date.toLocaleDateString()
  } catch {
    return isoString
  }
}

export function truncateHash(hash?: string | null, length: number = 7): string {
  if (!hash) return ''
  return hash.slice(0, length)
}

export function getRepoDisplayName(urlOrId: string): string {
  if (!urlOrId) return 'Repository'
  try {
    const clean = urlOrId.trim().replace(/\/+$/, '')
    const parts = clean.split('/')
    if (parts.length >= 2) {
      const last = parts[parts.length - 1].replace(/\.git$/, '')
      const prev = parts[parts.length - 2]
      return `${prev}/${last}`
    }
    return parts[parts.length - 1]
  } catch {
    return urlOrId
  }
}
