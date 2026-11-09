// Returns a warning text for age-restricted movies, otherwise null.
// Works with ratings like "16", "K-16", "18", "K18".
function getAgeWarning(ageRating) {
  if (!ageRating) return null;
  const match = String(ageRating).match(/\d+/);
  if (!match) return null;
  const age = Number(match[0]);
  if (age >= 15) {
    return `This movie is rated ${age}+.`;
  }
  return null;
}

module.exports = { getAgeWarning };
