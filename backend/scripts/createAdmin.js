
require('dotenv').config({
  path: require('path').resolve(__dirname, '../.env')
});
const bcrypt = require('bcrypt');
const readline = require('readline');
const pool = require('../src/config/db');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const ask = (question) => {
  return new Promise((resolve) => {
    rl.question(question, resolve);
  });
};

const createAdmin = async () => {
  try {
    console.log('\nCreate Rio Theatres administrator\n');

    const firstName = (await ask('First name: ')).trim();
    const lastName = (await ask('Last name: ')).trim();
    const email = (await ask('Email: ')).trim().toLowerCase();
    const password = await ask('Password: ');

    if (!firstName || !email || !password) {
      throw new Error('First name, email and password are required.');
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new Error('Please enter a valid email address.');
    }

    if (password.length < 8) {
      throw new Error('Password must contain at least 8 characters.');
    }

    const existingUser = await pool.query(
      'SELECT user_id FROM users WHERE email = $1',
      [email]
    );

    if (existingUser.rows.length > 0) {
      throw new Error('An account with this email already exists.');
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const result = await pool.query(
      `INSERT INTO users
       (first_name, last_name, email, password_hash, role, active)
       VALUES ($1, $2, $3, $4, 'admin', TRUE)
       RETURNING user_id, first_name, last_name, email, role, active`,
      [firstName, lastName || null, email, passwordHash]
    );

    console.log('\nAdministrator created successfully:');
    console.log(result.rows[0]);

  } catch (error) {
    console.error('\nError:', error.message);
    process.exitCode = 1;
  } finally {
    rl.close();
    await pool.end();
  }
};

createAdmin();
