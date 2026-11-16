const Stripe = require('stripe');
const { httpError } = require('../utils/httpError');

// Stripe test-mode client (course requirement: Stripe-hosted Checkout).
// The secret key (sk_test_...) lives only in backend/.env, never in React,
// Git or screenshots.
let client = null;

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw httpError(503, 'PAYMENTS_UNAVAILABLE', 'Online payment is not available right now.');
  }
  if (key.startsWith('sk_live_')) {
    // This project must never move real money.
    throw httpError(503, 'PAYMENTS_UNAVAILABLE', 'Online payment is not available right now.');
  }
  if (!client) client = new Stripe(key);
  return client;
}

module.exports = { getStripe };
