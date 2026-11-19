// Deployment configuration. Leave values null on GitHub Pages (no backend).
// See README → "Serveur" for the backend that enables background monitoring and Web Push.
export const CONFIG = {
  /** HTTPS endpoint that stores Web Push subscriptions (POST JSON). Never put a private key here. */
  pushEndpoint: null,
  /** VAPID *public* key (base64url). The private key lives only on the server. */
  vapidPublicKey: null,
  /** Optional authorised price feed (JSON: [{productId, price, currency, retailer, sourceUrl, ts}]). */
  priceFeedUrl: null,
};
