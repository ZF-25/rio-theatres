// One SQL expression for a seat's status in a screening, shared by the
// seat map and the screening's availableSeatCount so they always agree.
//
// Order (contract section 5, SeatMap):
//   owner_blocked  - the seat labelled 1 (first seat of the front row),
//                    a seat flagged as the owner's, or a blocked seat
//   booked         - in a confirmed (paid) booking
//   held           - in an active hold that has not expired,
//                    or in a booking still waiting for payment
//   staff_reserved - (no staff reservations table yet)
//   available      - everything else
//
// Expired holds are ignored, so their seats become available again
// without any clean-up job (contract section 7).
function seatStatusSql(screeningRef, seatRef) {
  return `
    CASE
      WHEN ${seatRef}.is_owner_seat
        OR ${seatRef}.status = 'blocked'
        OR (${seatRef}.seat_number = 1 AND ${seatRef}.row_number =
              (SELECT MIN(f.row_number) FROM seats f WHERE f.room_id = ${seatRef}.room_id))
      THEN 'owner_blocked'
      WHEN EXISTS (
        SELECT 1 FROM booking_seats bs
          JOIN bookings b ON b.booking_id = bs.booking_id
         WHERE bs.screening_id = ${screeningRef}
           AND bs.seat_id = ${seatRef}.seat_id
           AND b.booking_status = 'confirmed'
      ) THEN 'booked'
      WHEN EXISTS (
        SELECT 1 FROM booking_seats bs
          JOIN bookings b ON b.booking_id = bs.booking_id
         WHERE bs.screening_id = ${screeningRef}
           AND bs.seat_id = ${seatRef}.seat_id
           AND b.booking_status = 'pending'
      ) OR EXISTS (
        SELECT 1 FROM seat_holds h
         WHERE h.screening_id = ${screeningRef}
           AND h.seat_id = ${seatRef}.seat_id
           AND h.hold_status = 'active'
           AND h.expires_at > NOW()
      ) THEN 'held'
      ELSE 'available'
    END`;
}

module.exports = { seatStatusSql };
