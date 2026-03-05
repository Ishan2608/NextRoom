const db = require("../db/database");

const createUser = (username, email, password) => {
  const stmt = db.prepare(
    `INSERT INTO users (username, email, password) VALUES (?, ?, ?) RETURNING *`,
  );
  // Use .get() instead of .run() to capture the returned row object
  return stmt.get(username, email, password);
};

const findUserByEmail = (email) => {
  const stmt = db.prepare("SELECT * FROM users WHERE email = ?");
  return stmt.get(email);
};

module.exports = {
  createUser,
  findUserByEmail,
};
