export class PaymentError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export function safeError(error: unknown): PaymentError {
  return error instanceof PaymentError
    ? error
    : new PaymentError(
        'internal_error',
        'We could not complete this request. Please try again.',
        500,
      );
}
