/* Demo features remain available. Enable API features only after integration checks. */
function apiFeature(name) {
  return import.meta.env[name] === "true";
}

export const apiFeatures = Object.freeze({
  ownerOverview: apiFeature("VITE_API_OWNER_OVERVIEW"),
  ownerScreenings: apiFeature("VITE_API_OWNER_SCREENINGS"),
  ownerBookings: apiFeature("VITE_API_OWNER_BOOKINGS"),
  staffReservations: apiFeature("VITE_API_STAFF_RESERVATIONS"),
});

export function ownerFeatureAvailable(tab, mode) {
  if (mode === "demo") return true;
  switch (tab) {
    case "overview": return apiFeatures.ownerOverview;
    case "screenings": return apiFeatures.ownerScreenings;
    case "bookings": return apiFeatures.ownerBookings;
    case "seats": return apiFeatures.staffReservations;
    case "cashiers": return true;
    default: return false;
  }
}
