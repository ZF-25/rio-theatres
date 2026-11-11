const pool = require('../config/db');
const { toApiId } = require('../utils/validate');

const TIME_ZONE = 'Europe/Helsinki';

function toCinema(row) {
  return {
    id: toApiId(row.theater_id),
    city: row.city,
    name: `${row.name} ${row.city}`,
    address: row.address || '', // contract: string, empty if unknown
    email: null,
    phone: null,
    openingHours: [],
    timeZone: TIME_ZONE,
  };
}

function toRoom(row) {
  return {
    id: toApiId(row.room_id),
    cinemaId: toApiId(row.theater_id),
    name: row.room_name,
    capacity: row.capacity,
  };
}

// Sorted by city, then ID (contract: ID ascending as final tie-breaker).
async function listCinemas({ pageSize, offset }) {
  const [rows, count] = await Promise.all([
    pool.query(
      `SELECT theater_id, name, city, address FROM theaters
        ORDER BY city, theater_id LIMIT $1 OFFSET $2`,
      [pageSize, offset]
    ),
    pool.query('SELECT COUNT(*)::int AS n FROM theaters'),
  ]);
  return { items: rows.rows.map(toCinema), totalItems: count.rows[0].n };
}

async function cinemaExists(cinemaId) {
  const { rows } = await pool.query('SELECT 1 FROM theaters WHERE theater_id = $1', [cinemaId]);
  return rows.length > 0;
}

async function roomExists(roomId) {
  const { rows } = await pool.query('SELECT 1 FROM rooms WHERE room_id = $1', [roomId]);
  return rows.length > 0;
}

async function listRooms(cinemaId, { pageSize, offset }) {
  const [rows, count] = await Promise.all([
    pool.query(
      `SELECT room_id, theater_id, room_name, capacity FROM rooms
        WHERE theater_id = $1
        ORDER BY room_name, room_id LIMIT $2 OFFSET $3`,
      [cinemaId, pageSize, offset]
    ),
    pool.query('SELECT COUNT(*)::int AS n FROM rooms WHERE theater_id = $1', [cinemaId]),
  ]);
  return { items: rows.rows.map(toRoom), totalItems: count.rows[0].n };
}

module.exports = { listCinemas, cinemaExists, roomExists, listRooms, TIME_ZONE };
