import { type ChildProcess, spawn } from 'child_process'

import {
  type AiExecutionHandle,
  type AiExecutionRequest,
  type AiExecutionResult,
  type AiExecutionService,
  DEFAULT_AI_PROVIDER,
  registerAiProvider
} from './aiExecution'

// The `claude -p` adapter — the one place that still knows about the CLI. Other
// providers (Anthropic API, OpenAI, an agent SDK) would be sibling modules
// registering under their own name.
const DEFAULT_MODEL = 'claude-sonnet-4-6'

interface RunningJob {
  proc: ChildProcess
  // Why the process was killed, so `close` can report the right status: a
  // watchdog timeout and a caller cancel both exit non-zero but mean different
  // things to the caller.
  timedOut: boolean
  cancelled: boolean
}

class ClaudeCliExecutionService implements AiExecutionService {
  // Alive within one process lifetime, keyed by pid. A cancel from elsewhere in
  // this process finds the child here; a cancel from another process can't, and
  // falls back to process.kill(pid).
  private readonly running = new Map<string, RunningJob>()

  async start(request: AiExecutionRequest): Promise<AiExecutionHandle> {
    const {
      prompt,
      cwd,
      disallowedTools = [],
      timeoutMs,
      model = DEFAULT_MODEL,
      permissionMode = 'default'
    } = request

    // Prompt via stdin (not argv): avoids process-table exposure and OS
    // arg-length limits. --disallowed-tools lets a caller bound the run (e.g.
    // block subagent-spawning tools) so the model works directly instead of
    // fanning out. --permission-mode lifts the interactive approval gate so an
    // unattended run can write files (headless has no approver, so the default
    // mode silently blocks every edit). `bypassPermissions` is refused when the
    // CLI runs as root, so the runner uses `acceptEdits`.
    const args = ['-p']
    if (disallowedTools.length > 0) args.push('--disallowed-tools', ...disallowedTools)
    if (permissionMode !== 'default') args.push('--permission-mode', permissionMode)
    args.push('--model', model)

    const proc = spawn('claude', args, { cwd, stdio: ['pipe', 'pipe', 'inherit'] })

    let settle: (r: AiExecutionResult) => void = () => {}
    const result = new Promise<AiExecutionResult>((resolve) => {
      settle = resolve
    })
    let settled = false
    const finish = (r: AiExecutionResult) => {
      if (settled) return
      settled = true
      settle(r)
    }

    // A spawn failure (e.g. the claude binary is missing) surfaces as an async
    // 'error' on the child and its stdin pipe; an unhandled one is rethrown by
    // Node and crashes the process. Catch both and report a failed run instead.
    proc.on('error', () => finish({ status: 'error', text: '', exitCode: null }))
    proc.stdin?.on('error', () => {})
    proc.stdin?.end(prompt)

    if (!proc.pid) {
      finish({ status: 'error', text: '', exitCode: null })
      return { jobId: '', result }
    }

    const jobId = String(proc.pid)
    const job: RunningJob = { proc, timedOut: false, cancelled: false }
    this.running.set(jobId, job)

    // Watchdog: terminate a hung or runaway run; the 'close' handler then reports
    // 'timeout'. Only armed when the caller set a positive ceiling.
    let watchdog: ReturnType<typeof setTimeout> | null = null
    if (timeoutMs && timeoutMs > 0) {
      watchdog = setTimeout(() => {
        job.timedOut = true
        proc.kill('SIGTERM')
      }, timeoutMs)
    }

    let stdout = ''
    proc.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString()
    })

    proc.on('close', (code) => {
      if (watchdog) clearTimeout(watchdog)
      this.running.delete(jobId)
      const status: AiExecutionResult['status'] = job.timedOut
        ? 'timeout'
        : job.cancelled
          ? 'cancelled'
          : code === 0
            ? 'ok'
            : 'error'
      finish({ status, text: stdout.trim(), exitCode: code ?? null })
    })

    return { jobId, result }
  }

  cancel(jobId: string | null): void {
    if (!jobId) return
    const job = this.running.get(jobId)
    if (job) {
      job.cancelled = true
      job.proc.kill('SIGTERM')
      return
    }
    // Not in this process's registry — spawned by another process, or lost to a
    // hot-reload. Best-effort kill by pid; that process's 'close' reports it.
    try {
      process.kill(parseInt(jobId, 10), 'SIGTERM')
    } catch {
      // Process already gone — fine.
    }
  }
}

// Registered under DEFAULT_AI_PROVIDER (not a separate string literal) so the
// default-provider name and the adapter that backs it can never drift apart.
registerAiProvider(DEFAULT_AI_PROVIDER, () => new ClaudeCliExecutionService())
