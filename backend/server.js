const express = require('express');

const app = express();
const PORT = 5000;

app.get('/', (req, res) => {
  res.send('Hello World from Rio Theaters Backend!');
});

app.listen(PORT, () => {
  console.log(`Backend running at http://localhost:${PORT}`);
});