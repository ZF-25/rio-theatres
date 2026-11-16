const { getStripe } = require('../services/stripeClient');
const { handleStripeEvent } = require('../services/bookingService');

// POST /api/stripe/webhook
// Stripe calls this after a Checkout payment. The request body must be the
// RAW bytes (express.raw in app.js), because the signature is checked
// against exactly what Stripe sent. Only a verified event can confirm a
// booking; the success page in the browser never does.
async function stripeWebhook(req, res) {
  let event;
  try {
    event = getStripe().webhooks.constructEvent(
      req.body,
      req.get('stripe-signature'),
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('Stripe webhook signature verification failed:', err.message);
    return res.status(400).json({
      error: { code: 'INVALID_SIGNATURE', message: 'Invalid webhook signature.', fieldErrors: {}, details: {} },
    });
  }

  // Errors here become 500, so Stripe retries the event later.
  const result = await handleStripeEvent(event);
  res.json({ received: true, result });
}

module.exports = { stripeWebhook };
