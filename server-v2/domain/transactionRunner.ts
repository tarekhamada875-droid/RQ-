export class RetryableTransactionError extends Error {
  readonly retryable = true;
  constructor(message = 'Transaction conflict') {
    super(message);
    this.name = 'RetryableTransactionError';
  }
}

export async function runBoundedTransaction<T>(work: () => Promise<T>, maxRetries = 3): Promise<T> {
  if (!Number.isInteger(maxRetries) || maxRetries < 0 || maxRetries > 10) throw new Error('Invalid retry limit');
  let attempts = 0;
  while (true) {
    try {
      return await work();
    } catch (error) {
      if (!(error instanceof RetryableTransactionError) || attempts >= maxRetries) throw error;
      attempts += 1;
    }
  }
}
