/*
 * FILE: frontend/src/utils/money.js
 *
 * PURPOSE
 * -------
 * Formats booking-service monetary amounts for display.
 *
 * PAGE CONNECTIONS
 * ----------------
 * Seat Selection:
 * - Ticket price information.
 *
 * Checkout:
 * - Server-returned quote and total.
 *
 * Booking Confirmation / History:
 * - Purchase-time prices.
 *
 * IMPORTANT
 * ---------
 * Booking-service amounts are INTEGER CENTS.
 *
 * Examples:
 * 1200 -> EUR 12.00
 *  600 -> EUR 6.00
 *    0 -> EUR 0.00
 *
 * Existing, unmigrated demo pages still use euro amounts.
 * Do not pass those amounts into this formatter.
 *
 * This utility does not calculate discounts or decide prices.
 * The booking service/backend supplies authoritative amounts.
 */


/*
 * SHARED EURO FORMATTER
 *
 * en-FI:
 * Uses English-language formatting conventions for Finland.
 *
 * Exact currency-symbol placement and whitespace can vary
 * slightly between JavaScript runtime implementations.
 */
const euroFormatter = new Intl.NumberFormat(
    "en-FI",
    {
        style: "currency",
        currency: "EUR",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    },
);


/*
 * CHECK AN AMOUNT FROM THE BOOKING CONTRACT
 *
 * Ticket prices and totals in this project must be:
 * - Numbers.
 * - Safe integers.
 * - Zero or greater.
 *
 * Numeric strings, fractions, null, and undefined are rejected.
 *
 * Zero is valid: do not use a truthiness check for prices.
 */
export function isValidMoneyAmount(amountCents) {
    return (
        Number.isSafeInteger(amountCents) &&
        amountCents >= 0
    );
}


/*
 * FORMAT EURO CENTS
 *
 * Examples:
 *
 * formatMoney(1200)
 * formatMoney(600, "EUR")
 *
 * Invalid/missing amounts display an explicit fallback instead
 * of accidentally appearing as EUR 0.00.
 *
 * This project currently supports EUR only.
 * Additional currencies require an explicit contract update.
 */
export function formatMoney(
    amountCents,
    currency = "EUR",
) {
    if (
        currency !== "EUR" ||
        !isValidMoneyAmount(amountCents)
    ) {
        return "Price unavailable";
    }

    return euroFormatter.format(
        amountCents / 100,
    );
}