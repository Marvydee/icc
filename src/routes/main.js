const express = require('express');
const { nanoid } = require('nanoid');
const pool = require('../db/pool');
const { QUESTIONS, scoreApplication } = require('../scoring');

const router = express.Router();

const PASS_MARK = parseInt(process.env.PASS_MARK || '70', 10);
const TOKEN_TTL_HOURS = 72; // claim link expires if unused after this long

// Note: communityName, instagramUrl, and telegramUrl are set once on
// app.locals in server.js and are automatically available in every
// template render below — no need to pass them through individually.

// ---------- Landing page ----------
router.get('/', (req, res) => {
  res.render('landing');
});

// ---------- Agreement page (must accept before seeing the form) ----------
router.get('/apply', (req, res) => {
  res.render('agreement');
});

router.post('/apply/agree', (req, res) => {
  const { agree } = req.body;
  if (agree !== 'on' && agree !== 'true') {
    return res.render('agreement', {
      error: 'You must accept the agreement to continue.',
    });
  }
  // Stash acceptance in a short-lived signed cookie-free way: pass through as hidden field on next form.
  res.render('questionnaire', {
    questions: QUESTIONS,
    agreementAcceptedAt: new Date().toISOString(),
    error: null,
    formData: {},
  });
});

// ---------- Questionnaire submission ----------
router.post('/apply/submit', async (req, res) => {
  const body = req.body;
  const agreementAcceptedAt = body.agreement_accepted_at;

  if (!agreementAcceptedAt) {
    return res.redirect('/apply');
  }

  const fullName = (body.full_name || '').trim();
  const phoneNumber = (body.whatsapp_number || '').trim();
  const socialHandle = (body.social_profile_link || '').trim();

  // Basic required-field validation
  if (!fullName || !phoneNumber) {
    return res.render('questionnaire', {
      questions: QUESTIONS,
      agreementAcceptedAt,
      error: 'Full name and WhatsApp number are required.',
      formData: body,
    });
  }

  for (const q of QUESTIONS) {
    if (q.required && !body[q.id]) {
      return res.render('questionnaire', {
        questions: QUESTIONS,
        agreementAcceptedAt,
        error: `Please answer: "${q.label}"`,
        formData: body,
      });
    }
  }

  try {
    // Check blocklist first
    const [blocked] = await pool.query(
      'SELECT id FROM blocked_phones WHERE phone_number = ?',
      [phoneNumber]
    );
    if (blocked.length > 0) {
      return res.render('result', {
        passed: false,
        reason: 'blocked',
      });
    }

    const answers = {};
    for (const q of QUESTIONS) {
      answers[q.id] = body[q.id] || '';
    }

    const { score, flags } = scoreApplication(answers);
    const status = score >= PASS_MARK ? 'passed' : 'failed';

    const ipAddress = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
    const userAgent = req.headers['user-agent'] || '';

    const [insertResult] = await pool.query(
      `INSERT INTO applicants
        (full_name, phone_number, email, social_handle, answers_json, score, status, agreement_accepted_at, agreement_version, ip_address, user_agent)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        fullName,
        phoneNumber,
        null,
        socialHandle || null,
        JSON.stringify({ ...answers, _flags: flags }),
        score,
        status,
        new Date(agreementAcceptedAt),
        'v1',
        ipAddress,
        userAgent,
      ]
    );

    const applicantId = insertResult.insertId;

    if (status === 'failed') {
      return res.render('result', {
        passed: false,
        reason: 'score',
      });
    }

    // Generate single-use claim token
    const token = nanoid(24);
    const expiresAt = new Date(Date.now() + TOKEN_TTL_HOURS * 60 * 60 * 1000);

    await pool.query(
      `INSERT INTO claim_tokens (applicant_id, token, expires_at) VALUES (?, ?, ?)`,
      [applicantId, token, expiresAt]
    );

    const claimUrl = `${process.env.APP_BASE_URL}/join/${token}`;

    return res.render('result', {
      passed: true,
      claimUrl,
    });
  } catch (err) {
    console.error('Error processing application:', err);
    return res.status(500).render('error', { message: 'Something went wrong processing your application. Please try again shortly.' });
  }
});

// ---------- Claim page: single-use token redemption ----------
router.get('/join/:token', async (req, res) => {
  const { token } = req.params;

  try {
    const [rows] = await pool.query(
      `SELECT ct.id, ct.used_at, ct.expires_at, a.full_name
       FROM claim_tokens ct
       JOIN applicants a ON a.id = ct.applicant_id
       WHERE ct.token = ?`,
      [token]
    );

    if (rows.length === 0) {
      return res.render('claim', { state: 'invalid' });
    }

    const record = rows[0];

    if (record.used_at) {
      return res.render('claim', { state: 'used' });
    }

    if (new Date(record.expires_at) < new Date()) {
      return res.render('claim', { state: 'expired' });
    }

    // Mark as used atomically — only succeeds if still unused (prevents race conditions
    // from double-clicks or two tabs claiming simultaneously)
    const ipAddress = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
    const [updateResult] = await pool.query(
      `UPDATE claim_tokens SET used_at = NOW(), used_ip = ? WHERE id = ? AND used_at IS NULL`,
      [ipAddress, record.id]
    );

    if (updateResult.affectedRows === 0) {
      // Someone else claimed it in the split second between our SELECT and UPDATE
      return res.render('claim', { state: 'used' });
    }

    return res.render('claim', {
      state: 'success',
      whatsappLink: process.env.WHATSAPP_GROUP_LINK,
      name: record.full_name,
    });
  } catch (err) {
    console.error('Error redeeming claim token:', err);
    return res.status(500).render('error', { message: 'Something went wrong. Please contact an admin.' });
  }
});

module.exports = router;
