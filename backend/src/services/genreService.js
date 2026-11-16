// Contract section 4: GET /genres lists genres in the local catalogue.
// The database has no genres table yet, so the catalogue has no genres
// and this list is empty. When Marina adds a genres table, query it here.
async function listGenres() {
  return { items: [], totalItems: 0 };
}

async function genreExists() {
  return false;
}

module.exports = { listGenres, genreExists };
