
import { loadStripe, Stripe } from '@stripe/stripe-js';

let stripePromise: Promise<Stripe | null>;

export const getStripe = () => {
  if (!stripePromise) {
    /**
     * CHAVE PÚBLICA OFICIAL (LIVE) - AtriosWork
     * Esta chave é segura para uso em frontend. 
     * Certifique-se de que o domínio da aplicação está autorizado no Dashboard da Stripe.
     */
    stripePromise = loadStripe('pk_live_51Sf5hkP8uJW17aRIIXkKcZQrPrZmMnU4NCQuM4diyf8nND8ERnNQOqdwDyOAZZg2h8NGlRfxsTBBVKXYIDEonCVz00ohwAVAXr');
  }
  return stripePromise;
};
