/**
 * Run with: npm run init-db
 * Creates all tables needed for the screening gateway.
 * Safe to re-run — uses CREATE TABLE IF NOT EXISTS.
 */
require('dotenv').config();
const pool = require('./pool');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS applicants (
  id INT AUTO_INCREMENT PRIMARY KEY,
  full_name VARCHAR(255) NOT NULL,
  phone_number VARCHAR(50) NOT NULL,
  email VARCHAR(255) NULL,
  social_handle VARCHAR(255) NULL,
  answers_json JSON NOT NULL,
  score INT NOT NULL DEFAULT 0,
  status ENUM('pending','passed','failed') NOT NULL DEFAULT 'pending',
  agreement_accepted_at DATETIME NOT NULL,
  agreement_version VARCHAR(20) NOT NULL DEFAULT 'v1',
  ip_address VARCHAR(64) NULL,
  user_agent VARCHAR(512) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_phone (phone_number),
  INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS claim_tokens (
  id INT AUTO_INCREMENT PRIMARY KEY,
  applicant_id INT NOT NULL,
  token VARCHAR(64) NOT NULL UNIQUE,
  used_at DATETIME NULL,
  used_ip VARCHAR(64) NULL,
  expires_at DATETIME NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (applicant_id) REFERENCES applicants(id) ON DELETE CASCADE,
  INDEX idx_token (token)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS blocked_phones (
  id INT AUTO_INCREMENT PRIMARY KEY,
  phone_number VARCHAR(50) NOT NULL UNIQUE,
  reason VARCHAR(512) NULL,
  blocked_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
`;

async function init() {
  try {
    const statements = SCHEMA.split(';').map(s => s.trim()).filter(Boolean);
    for (const stmt of statements) {
      await pool.query(stmt);
    }
    console.log('✅ Database initialized successfully.');
  } catch (err) {
    console.error('❌ Failed to initialize database:', err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

init();
