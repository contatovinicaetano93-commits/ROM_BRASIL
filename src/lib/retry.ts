export interface RetryOptions {
  maxAttempts?: number
  initialDelayMs?: number
  maxDelayMs?: number
  backoffMultiplier?: number
  onRetry?: (attempt: number, error: Error, nextDelayMs: number) => void
  /** Retorna false para desistir sem repetir (ex.: erro 4xx que retry não resolve). Default: sempre repete. */
  shouldRetry?: (error: Error) => boolean
}

export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const {
    maxAttempts = 3,
    initialDelayMs = 1000,
    maxDelayMs = 30000,
    backoffMultiplier = 2,
    onRetry,
    shouldRetry,
  } = options

  let lastError: Error | null = null
  let delayMs = initialDelayMs

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e))

      if (attempt === maxAttempts || (shouldRetry && !shouldRetry(lastError))) {
        break
      }

      const nextDelayMs = Math.min(delayMs * backoffMultiplier, maxDelayMs)
      onRetry?.(attempt, lastError, nextDelayMs)

      await new Promise((resolve) => setTimeout(resolve, delayMs))
      delayMs = nextDelayMs
    }
  }

  throw lastError || new Error('Max retry attempts reached')
}

export function createRetryableFunction<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
): () => Promise<T> {
  return () => retryWithBackoff(fn, options)
}
