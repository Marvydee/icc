const express = require('express');
const pool = require('../db/pool');

const router = express.Router();

function requireAdmin(req, res, next) {
  const suppliedPassword = req.query.key || req.body.key || req.headers['x-admin-key'];
  if (suppliedPassword && suppliedPassword === process.env.ADMIN_PASSWORD) {
    return next();
  }
  return res.status(401).render('admin-login', { error: req.query.error || null });
}

router.get('/admin', (req, res) => {
  res.render('admin-login', { error: null });
});

router.post('/admin', (req, res) => {
  const { password } = req.body;
  if (password === process.env.ADMIN_PASSWORD) {
    return res.redirect(`/admin/dashboard?key=${encodeURIComponent(password)}`);
  }
  return res.render('admin-login', { error: 'Incorrect password.' });
});

router.get('/admin/dashboard', requireAdmin, async (req, res) => {
  try {
    const statusFilter = req.query.status || 'all';
    let query = `SELECT id, full_name, phone_number, email, score, status, created_at FROM applicants`;
    const params = [];

    if (statusFilter !== 'all') {
      query += ` WHERE status = ?`;
      params.push(statusFilter);
    }
    query += ` ORDER BY created_at DESC LIMIT 200`;

    const [applicants] = await pool.query(query, params);

    const [counts] = await pool.query(
      `SELECT status, COUNT(*) as count FROM applicants GROUP BY status`
    );

    res.render('admin-dashboard', {
      applicants,
      counts,
      statusFilter,
      adminKey: req.query.key,
    });
  } catch (err) {
    console.error('Admin dashboard error:', err);
    res.status(500).render('error', { message: 'Could not load dashboard.' });
  }
});

router.get('/admin/applicant/:id', requireAdmin, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT a.*, ct.token, ct.used_at, ct.expires_at
       FROM applicants a
       LEFT JOIN claim_tokens ct ON ct.applicant_id = a.id
       WHERE a.id = ?`,
      [req.params.id]
    );

    if (rows.length === 0) {
      return res.status(404).render('error', { message: 'Applicant not found.' });
    }

    const applicant = rows[0];
    applicant.answers = JSON.parse(applicant.answers_json);

    res.render('admin-applicant', { applicant, adminKey: req.query.key });
  } catch (err) {
    console.error('Admin applicant detail error:', err);
    res.status(500).render('error', { message: 'Could not load applicant.' });
  }
});

// Manually block a phone number (e.g. after a scandal/report)
router.post('/admin/block', requireAdmin, async (req, res) => {
  const { phone_number, reason } = req.body;
  try {
    await pool.query(
      `INSERT INTO blocked_phones (phone_number, reason) VALUES (?, ?)
       ON DUPLICATE KEY UPDATE reason = ?`,
      [phone_number, reason || null, reason || null]
    );
    res.redirect(`/admin/dashboard?key=${encodeURIComponent(req.query.key)}`);
  } catch (err) {
    console.error('Block phone error:', err);
    res.status(500).render('error', { message: 'Could not block number.' });
  }
});

module.exports = router;
