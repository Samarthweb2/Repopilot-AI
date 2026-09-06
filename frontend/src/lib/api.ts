import {
  FileContentResponse,
  IndexingResult,
  QueryResponse,
  RepoStatus,
  RepoSummary,
  SSEStreamEvent,
} from '../types'

function getApiBase(): string {
  const raw = (import.meta.env.VITE_API_URL as string)?.trim() || ''
  if (!raw) {
    if (typeof window !== 'undefined' && window.location.hostname.includes('onrender.com')) {
      return 'https://repopilot-api-20bm.onrender.com'
    }
    return ''
  }
  if (!raw.startsWith('http://') && !raw.startsWith('https://')) {
    return `https://${raw}`
  }
  return raw.replace(/\/+$/, '')
}

const API_BASE = getApiBase()

export async function checkBackendHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/health`, { signal: AbortSignal.timeout(3000) })
    if (!res.ok) return false
    const data = await res.json()
    return data.status === 'healthy'
  } catch {
    return false
  }
}

export async function getRepos(): Promise<RepoSummary[]> {
  const res = await fetch(`${API_BASE}/repos`)
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Failed to fetch repositories' }))
    throw new Error(err.detail || 'Failed to fetch repositories')
  }
  return res.json()
}

export async function connectRepo(repoUrl: string, branch?: string): Promise<RepoStatus> {
  const res = await fetch(`${API_BASE}/repos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      repo_url: repoUrl.trim(),
      branch: branch?.trim() || null,
    }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Failed to connect repository' }))
    throw new Error(err.detail || 'Failed to connect repository')
  }
  return res.json()
}

export async function indexRepo(repoId: string, force: boolean = false): Promise<IndexingResult> {
  const res = await fetch(`${API_BASE}/repos/${repoId}/index?force=${force}`, {
    method: 'POST',
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Failed to index repository' }))
    throw new Error(err.detail || 'Failed to index repository')
  }
  return res.json()
}

export async function getFileContent(
  repoId: string,
  filePath: string,
  startLine: number = 1,
  endLine: number = 200
): Promise<FileContentResponse> {
  const params = new URLSearchParams({
    file_path: filePath,
    start_line: String(startLine),
    end_line: String(endLine),
  })
  const res = await fetch(`${API_BASE}/repos/${repoId}/file?${params.toString()}`)
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Failed to read file' }))
    throw new Error(err.detail || 'Failed to read file')
  }
  return res.json()
}

export async function askRepoBlocking(
  repoId: string,
  query: string,
  maxSteps: number = 6,
  modelProvider?: string,
  modelName?: string
): Promise<QueryResponse> {
  const res = await fetch(`${API_BASE}/repos/${repoId}/ask`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query,
      max_steps: maxSteps,
      model_provider: modelProvider || null,
      model_name: modelName || null,
    }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Agent inquiry failed' }))
    throw new Error(err.detail || 'Agent inquiry failed')
  }
  return res.json()
}

export async function streamAskRepo(
  repoId: string,
  query: string,
  maxSteps: number = 6,
  modelProvider?: string,
  modelName?: string,
  callbacks?: {
    onEvent?: (event: SSEStreamEvent) => void
    onError?: (error: Error) => void
    onDone?: () => void
  },
  abortSignal?: AbortSignal
): Promise<void> {
  try {
    const response = await fetch(`${API_BASE}/repos/${repoId}/ask/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
      },
      body: JSON.stringify({
        query,
        max_steps: maxSteps,
        model_provider: modelProvider || null,
        model_name: modelName || null,
      }),
      signal: abortSignal,
    })

    if (!response.ok) {
      const err = await response.json().catch(() => ({ detail: 'Streaming connection failed' }))
      throw new Error(err.detail || `Server error: ${response.statusText}`)
    }

    if (!response.body) {
      throw new Error('Response body is null')
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder('utf-8')
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      let currentEvent: string = 'message'
      for (const line of lines) {
        const trimmed = line.trim()
        if (trimmed.startsWith('event:')) {
          currentEvent = trimmed.replace('event:', '').trim()
        } else if (trimmed.startsWith('data:')) {
          const rawData = trimmed.replace('data:', '').trim()
          try {
            const parsed = JSON.parse(rawData)
            callbacks?.onEvent?.({
              event: currentEvent as any,
              data: parsed,
            })
          } catch {
            callbacks?.onEvent?.({
              event: currentEvent as any,
              data: rawData,
            })
          }
        }
      }
    }

    callbacks?.onDone?.()
  } catch (err: any) {
    if (err.name === 'AbortError') {
      callbacks?.onDone?.()
      return
    }
    callbacks?.onError?.(err instanceof Error ? err : new Error(String(err)))
  }
}
