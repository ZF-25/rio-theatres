/*
 * FILE: frontend/src/hooks/useStaffScreening.js
 *
 * PURPOSE
 * -------
 * Loads screening details and seat availability for staff views.
 *
 * USED BY
 * -------
 * The upcoming shared owner/cashier reservation editor.
 *
 * HOW IT WORKS
 * ------------
 * Reuses useBookingScreening's polling, cancellation, retry,
 * and background-refresh behaviour.
 *
 * Supplies:
 * - staffScreenings as the read service.
 * - Staff/catalogue compatibility.
 * - Active owner/cashier access.
 *
 * IMPORTANT
 * ---------
 * Staff seat-map reads do not depend on customer booking mode.
 *
 * This hook does not create or edit reservations.
 * Those operations use staffService.
 */

import {
  useBookingScreening,
} from "./useBookingScreening.js";

import {
  useStaffSession,
} from "./useStaffSession.js";

import {
  staffScreenings,
} from "../services/staffScreenings.js";

import {
  staffEnabled,
} from "../services/staff.js";


/*
 * PARAMETERS
 *
 * screeningId:
 * The selected screening's service ID.
 *
 * enabled:
 * Optional caller-controlled flag.
 * For example, suspend reads while another required record loads.
 */
export function useStaffScreening(
  screeningId,
  { enabled = true } = {},
) {
  const {
    staff,
    status,
    isSessionLoading,
  } = useStaffSession();


  /*
   * REQUIRE CONFIRMED STAFF IDENTITY
   *
   * A signed-in customer is not a staff member.
   * Failed session restoration must not trigger protected UI reads.
   *
   * Backend mutation permissions remain authoritative.
   */
  const hasStaffAccess = Boolean(
    !isSessionLoading &&
    status === "authenticated" &&
    (
      staff?.role === "owner" ||
      staff?.role === "cashier"
    ),
  );


  /*
   * ALWAYS CALL THE SHARED HOOK
   *
   * Hooks must not be called conditionally.
   * The enabled flag prevents requests when access is unavailable.
   */
  return useBookingScreening(
    screeningId,
    {
      enabled:
        enabled && hasStaffAccess,

      service:
        staffScreenings,

      sourceEnabled:
        staffEnabled,
    },
  );
}