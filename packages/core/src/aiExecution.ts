/**
 * Provider-agnostic contract for running a single AI task.
 *
 * Today the only implementation shells out to `claude -p` (the cheapest option),
 * but no caller should know that: enrichment and the auto-implement runner both
 * talk to this port, so swapping in another provider (Anthropic API, OpenAI, an
 * agent SDK) is a new adapter plus a config change — never an edit to the call
 * sites. The adapter lives in its own module and registers itself here.
 */

export type AiExecutionStatus = 'ok' | 'error' | 'timeout' | 'cancelled'

export interface AiExecutionRequest {
  /** Full prompt / instructions handed to the model. */
  prompt: string
  /**
   * Directory the task runs in — a project checkout for enrichment, an isolated
   * git worktree for the runner. The provider explores and edits relative to it.
   */
  cwd: string
  /**
   * Tool names the provider must refuse — e.g. subagent-spawning tools, to keep a
   * run bounded. Advisory for providers that have no tool layer.
   */
  disallowedTools?: string[]
  /** Hard ceiling; past it the job is cancelled and reported as `timeout`. */
  timeoutMs?: number
  /** Provider model id; the adapter picks a sensible default when omitted. */
  model?: string
}

export interface AiExecutionResult {
  status: AiExecutionStatus
  /** The model's final textual output; `''` when it produced none. */
  text: string
  /** Process exit code for process-based providers; null/undefined otherwise. */
  exitCode?: number | null
}

export interface AiExecutionHandle {
  /**
   * Opaque id to reference or cancel this job. It must stay valid across process
   * restarts for providers keyed on an OS resource — the claude adapter uses the
   * pid — so another process or a boot-time sweep can still cancel an orphan.
   */
  jobId: string
  /**
   * Settles when the job finishes. Never rejects — failures surface as a result
   * with a non-`ok` status, so callers map status without a try/catch.
   */
  result: Promise<AiExecutionResult>
}

export interface AiExecutionService {
  /**
   * Start a job and return its handle immediately, without waiting for the run to
   * finish, so the caller can persist `jobId` (for later cancel/reconcile) and
   * await `result` independently.
   */
  start(request: AiExecutionRequest): Promise<AiExecutionHandle>
  /**
   * Cancel a job by id. Must tolerate an unknown or already-finished id (no-op)
   * and a job started by another process — the claude adapter falls back to
   * `process.kill(pid)` — so a boot sweep can reap orphans from a dead process.
   */
  cancel(jobId: string | null): void | Promise<void>
}

type AiProviderFactory = () => AiExecutionService

const providers = new Map<string, AiProviderFactory>()
// Memoized so a provider's process-global state (the claude adapter's registry of
// live subprocesses) is shared across calls — otherwise cancel-by-jobId within the
// same process couldn't find the job it just started.
const instances = new Map<string, AiExecutionService>()

/**
 * Register an adapter under a provider name. Each adapter module calls this once
 * at import — before any instance is built — so there is never a live memoized
 * instance to invalidate here.
 */
export function registerAiProvider(name: string, factory: AiProviderFactory): void {
  providers.set(name, factory)
}

/** The provider used when a caller doesn't pin one. */
export const DEFAULT_AI_PROVIDER = 'claude-cli'

/** Pinned name → `CO_AI_PROVIDER` → the built-in default. */
export function resolveAiProviderName(explicit?: string | null): string {
  return explicit?.trim() || process.env.CO_AI_PROVIDER?.trim() || DEFAULT_AI_PROVIDER
}

/**
 * The AI execution service for the given provider, or the resolved default.
 * Throws when no adapter is registered under that name — a misconfiguration we
 * want loud at the call site, not a silent run that never happens.
 */
export function getAiExecutionService(provider?: string | null): AiExecutionService {
  const name = resolveAiProviderName(provider)
  let instance = instances.get(name)
  if (!instance) {
    const factory = providers.get(name)
    if (!factory) {
      const known = [...providers.keys()].join(', ') || '(none)'
      throw new Error(
        `No AI execution provider registered under "${name}". Registered: ${known}.`
      )
    }
    instance = factory()
    instances.set(name, instance)
  }
  return instance
}
