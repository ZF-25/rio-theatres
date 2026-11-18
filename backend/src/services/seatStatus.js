
// One SQL expression for a seat's status in a screening, shared by the
// seat map and availableSeatCount.
//
// Order:
//   owner_blocked  - owner seat or blocked seat
//   booked         - confirmed customer booking
//   held           - active hold or pending customer checkout
//   staff_reserved - active staff reservation
//   available      - everything else

function seatStatusSql(screeningRef, seatRef) {
  return `
    CASE
      WHEN ${seatRef}.is_owner_seat
        OR ${seatRef}.status = 'blocked'
        OR (
          ${seatRef}.seat_number = 1
          AND ${seatRef}.row_number = (
            SELECT MIN(f.row_number)
            FROM seats f
            WHERE f.room_id = ${seatRef}.room_id
          )
        )
      THEN 'owner_blocked'

      WHEN EXISTS (
        SELECT 1
        FROM booking_seats bs
        JOIN bookings b ON b.booking_id = bs.booking_id
        WHERE bs.screening_id = ${screeningRef}
          AND bs.seat_id = ${seatRef}.seat_id
          AND b.booking_status = 'confirmed'
      )
      THEN 'booked'

      WHEN EXISTS (
        SELECT 1
        FROM booking_seats bs
        JOIN bookings b ON b.booking_id = bs.booking_id
        WHERE bs.screening_id = ${screeningRef}
          AND bs.seat_id = ${seatRef}.seat_id
          AND b.booking_status = 'pending'
          AND (
            b.expires_at IS NULL
            OR b.expires_at + INTERVAL '10 minutes' > NOW()
          )
      )
      OR EXISTS (
        SELECT 1
        FROM seat_holds h
        WHERE h.screening_id = ${screeningRef}
          AND h.seat_id = ${seatRef}.seat_id
          AND h.hold_status = 'active'
          AND h.expires_at > NOW()
      )
      THEN 'held'

      WHEN EXISTS (
        SELECT 1
        FROM staff_reservation_seats srs
        JOIN staff_reservations sr
          ON sr.reservation_id = srs.reservation_id
        WHERE srs.screening_id = ${screeningRef}
          AND srs.seat_id = ${seatRef}.seat_id
          AND srs.is_active = TRUE
          AND sr.status = 'active'
      )
      THEN 'staff_reserved'

      ELSE 'available'
    END`;
}

module.exports = { seatStatusSql };
