require('dotenv').config();
const app = require('./app');
const { startMovieSync } = require('./src/services/movieSyncService');

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Backend running at http://localhost:${PORT}`);
  startMovieSync();
});