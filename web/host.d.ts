import type { CheckoutSession } from '../shared/contracts.js';
declare global {
  interface Window {
    openai?: {
      requestCheckout?: (session: CheckoutSession) => Promise<unknown>;
      requestClose?: () => void;
    };
  }
}
export {};
