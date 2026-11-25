Frontend integration handoff
Current status
The full frontend works in demo mode.

API adapters and Stripe payment views are implemented, and staff reservations and seat holds have been checked in API mode.
Stripe end-to-end verification is pending. Successful lint/build checks do not verify database,
session, authorization or payment behavior.
Running the demo
Create frontend/.env.local:

VITE_API_BASE_URL=/api/v1
VITE_DATA_MODE=demo
VITE_AUTH_MODE=demo
VITE_STAFF_MODE=demo
VITE_BOOKING_MODE=demo
VITE_API_OWNER_OVERVIEW=false
VITE_API_OWNER_SCREENINGS=false
VITE_API_OWNER_BOOKINGS=false
VITE_API_STAFF_RESERVATIONS=false
VITE_API_CUSTOMER_BOOKING=false

Run from frontend:

npm install
npm run dev

Demo payments are simulated. Demo records reset on refresh.
Demo QR codes are not secure admission tickets.
API configuration
The Vite development proxy forwards /api requests to localhost:5000.

For catalogue, authentication and cashier management testing, use:

VITE_DATA_MODE=api
VITE_AUTH_MODE=api
VITE_STAFF_MODE=api
VITE_BOOKING_MODE=demo

Customer booking is intentionally unavailable with this combination.
Restart Vite after changing environment variables.

Never put backend secrets in frontend environment files.
Staff reservations
Implemented backend paths:

GET   /api/v1/staff/reservations
GET   /api/v1/staff/reservations/:id
POST  /api/v1/staff/reservations
PATCH /api/v1/staff/reservations/:id
POST  /api/v1/staff/reservations/:id/cancel

Updates and cancellations send version in the JSON body.
They do not currently use If-Match.

Before testing:
- Confirm migration 008 is applied.
- Confirm future screenings exist.
- Use an active owner or cashier account.
- Set VITE_API_STAFF_RESERVATIONS=true.
Verify:
- Owners can access reservations across theaters.
- Cashiers can access only their current assigned theater.
- Unassigned cashiers receive no screening options.
- Seat conflicts are rejected.
- Outdated edits are rejected.
- Cancellation retains the record and releases seats.
- Customer availability reflects staff reservations.
Customer checkout
API purchases request paymentMethod: "stripe".
Demo purchases continue to use simulated payment.

API views handle:
- Redirecting to Stripe checkout.
- Pending payment status.
- Returning without completing payment.
- Resuming an existing checkout when the backend supplies its URL.
- Confirmation based on backend status, not URL parameters.
Keep VITE_API_CUSTOMER_BOOKING=false until testing is coordinated.

For coordinated checkout testing, all four modes must be api and
VITE_API_CUSTOMER_BOOKING=true.

Verify with Stripe test mode:
- Successful payment and webhook confirmation.
- Cancelled and expired checkout.
- Delayed webhook delivery.
- Retrying a request with the same idempotency key.
- Reloading and returning to checkout.
- No confirmed ticket before payment confirmation.
- Account history and booking ownership.
API pages do not generate demo QR tickets. Secure admission-ticket
generation remains a separate integration requirement.
Backend integration status
The backend includes the registration fix, guest checkout ownership, active
hold transfer on login and registration, CSRF checks on checkout mutations,
and genre import and filtering. End-to-end guest hold transfer still needs
verification.

Remaining work includes releasing holds during logout, validating late payment
and webhook recovery, retaining seat history after cancellation or expiry,
and implementing the owner overview, screening management and booking lookup APIs.
Owner feature flags
Leave these false until their endpoints and adapters are verified:

VITE_API_OWNER_OVERVIEW=false
VITE_API_OWNER_SCREENINGS=false
VITE_API_OWNER_BOOKINGS=false

Feature flags control frontend availability only.
Backend authorization must always enforce access.
Validation
Frontend lint and production build passed during preparation.
Manual API-mode browser checks passed for cashier theater reassignment and
deactivation, reservation editing and cancellation, stale edits, and seat
conflicts. Customer pricing, hold countdown and expiry, competing holds,
and shared availability between customer and staff sessions also passed.
Stripe end-to-end tests are still pending.