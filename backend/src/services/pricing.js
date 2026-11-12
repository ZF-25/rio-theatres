// Ticket pricing (contract section 6). All money is integer euro cents,
// calculated on the backend; clients never send prices or totals.
//
// The adult price is the screening's ticket_price set by the owner.
// Children pay 50 % of the adult price, rounded to the nearest cent with
// halves rounded up, using integer arithmetic only.

function eurosToCents(value) {
  // ticket_price is NUMERIC(8,2) and arrives from pg as a string like "12.00"
  const [whole, fraction = ''] = String(value).split('.');
  return Number(whole) * 100 + Number((fraction + '00').slice(0, 2));
}

function childPriceCents(adultCents) {
  return Math.floor((adultCents + 1) / 2);
}

function buildQuote(adultUnitPriceCents, tickets) {
  const childUnitPriceCents = childPriceCents(adultUnitPriceCents);
  const adultSubtotalCents = adultUnitPriceCents * tickets.adult;
  const childSubtotalCents = childUnitPriceCents * tickets.child;
  return {
    currency: 'EUR',
    adultUnitPriceCents,
    childUnitPriceCents,
    adultSubtotalCents,
    childSubtotalCents,
    totalCents: adultSubtotalCents + childSubtotalCents,
  };
}

module.exports = { eurosToCents, childPriceCents, buildQuote };
