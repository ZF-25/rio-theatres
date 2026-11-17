/*
 * FILE: frontend/src/services/staff.js
 *
 * Configures staff authentication for Rio Theaters.
 *
 * This temporary version supports demo mode only.
 * It will be expanded when cashier services are added.
 */

import { dataMode } from "./catalogue.js";

// Read the staff mode from the environment, defaulting to demo.
export const staffMode =
  import.meta.env.VITE_STAFF_MODE || "demo";

// Prevent unsupported staff authentication modes.
if (staffMode !== "demo") {
  throw new Error(
    "This staff login preview requires VITE_STAFF_MODE=demo.",
  );
}

// Enable staff features only when staff and catalogue modes match.
export const staffEnabled = staffMode === dataMode;