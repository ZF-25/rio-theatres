const crypto = require('crypto');
const pool = require('../config/db');

const SESSION_COOKIE_NAME = 'rio_session';

const authenticateUser = async (req, res, next) => {
  try {
    //  получает токен сессии через cookie
    const sessionToken = req.cookies[SESSION_COOKIE_NAME];

    if (!sessionToken) {
      return res.status(401).json({
        error: 'Authentication required'
      });
    }

    //хаширует токен
    const tokenHash = crypto
      .createHash('sha256')
      .update(sessionToken)
      .digest('hex');

    // находит валидную сессию и юзера этой сессии
    const result = await pool.query(
      `SELECT
          u.user_id,
          u.first_name,
          u.last_name,
          u.email,
          u.role
       FROM sessions s
       JOIN users u ON u.user_id = s.user_id
       WHERE s.token_hash = $1
         AND s.expires_at > NOW()`,
//  Мы объединяем две таблицы:
// - sessions — проверяем существование и срок действия сессии.
// - users — получаем информацию о пользователе и его роли.
      [tokenHash]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        error: 'Invalid or expired session'
      });
    }
    // сохраняет найденного пользователя внутри текущего запроса. Другие маршруты смогут 
    // использовать req.user.role, req.user.email и другие поля.
    req.user = result.rows[0];

    // Continue to the next middleware or endpoint
    next();

  } catch (error) {
    console.error('Authentication error:', error.message);

    return res.status(500).json({
      error: 'Internal server error'
    });
  }
};

module.exports = { authenticateUser };
