// Contract section 4 + 11: only verified Finnish ratings are shown.
// Another country's certification (e.g. "PG-13") becomes null, which the
// frontend displays as "Age rating unavailable".
//
// Finnish ratings come from TMDB as "S", "7", "12", "16", "18"
// (sometimes "K-7", "K-12", "K-16", "K-18"; old ones like "K-11").
function toAgeRating(stored, source) {
  if (!stored) return null;
  const value = String(stored).trim().toUpperCase();

  if (value === 'S' || value === 'K-S') {
    return { country: 'FI', label: 'S', minimumAge: 0, source };
  }
  const match = /^(?:K-?)?(\d{1,2})$/.exec(value);
  if (match) {
    const age = Number(match[1]);
    return { country: 'FI', label: String(age), minimumAge: age, source };
  }
  return null;
}

module.exports = { toAgeRating };
