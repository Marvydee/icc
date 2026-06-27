/**
 * Questionnaire definition + scoring engine for Ibadan Cruise Connect.
 *
 * Final question set agreed with the team, organized into sections:
 * Basic Info, Community Fit, Behaviour & Accountability, Community Security,
 * Referral Quality Control, Commitment, and a closing open-ended question.
 *
 * Scoring: every closed-ended (select) question is scored numerically.
 * Open-ended (textarea) questions and the interest-areas multi-topic
 * question are NOT auto-scored — they're stored and surfaced to whoever
 * reviews the application, especially useful for borderline scores.
 *
 * Total possible score = 100 (normalized). PASS_MARK = 70 (configurable
 * via .env, see PASS_MARK).
 */

const QUESTIONS = [
  // ---------- Basic Info ----------
  {
    id: 'full_name',
    section: 'Basic Info',
    label: 'Full Name',
    type: 'text',
    required: true,
    scoring: 'manual_signal',
  },
  {
    id: 'whatsapp_number',
    section: 'Basic Info',
    label: 'WhatsApp Number',
    type: 'tel',
    required: true,
    scoring: 'manual_signal',
  },
  {
    id: 'social_profile_link',
    section: 'Basic Info',
    label: 'Social Media Profile Link',
    type: 'text',
    required: true,
    scoring: 'presence',
    points: 9,
  },

  // ---------- Community Fit ----------
  {
    id: 'gain_and_reason',
    section: 'Community Fit',
    label: 'What are you hoping to gain from being a member, and why do you want to join?',
    type: 'textarea',
    required: true,
    scoring: 'manual_signal',
  },
  {
    id: 'value_contribution',
    section: 'Community Fit',
    label: 'What positive value can you contribute to the community?',
    type: 'textarea',
    required: true,
    scoring: 'manual_signal',
  },
  {
    id: 'interest_areas',
    section: 'Community Fit',
    label: 'Which aspects of the community interest you the most?',
    type: 'select',
    required: true,
    options: [
      'Networking', 'Sports', 'Social events', 'Business opportunities',
      'Friendship & connections', 'Volunteering', 'Other',
    ],
    scoring: 'manual_signal',
  },

  // ---------- Behaviour & Accountability ----------
  {
    id: 'disagreement_handling',
    section: 'Behaviour & Accountability',
    label: 'If a disagreement arises within the community, how would you typically handle it?',
    type: 'textarea',
    required: true,
    scoring: 'manual_signal',
  },
  {
    id: 'respect_commitment',
    section: 'Behaviour & Accountability',
    label: 'Are you willing to treat fellow members with respect regardless of age, gender, profession, tribe, religion, or background?',
    type: 'select',
    required: true,
    options: ['Yes', 'No'],
    scoring: { 'Yes': 11, 'No': 0 },
  },
  {
    id: 'sales_intent',
    section: 'Behaviour & Accountability',
    label: 'Do you intend to use the community primarily for promotions or sales?',
    type: 'select',
    required: true,
    options: ['Yes', 'No'],
    scoring: { 'No': 14, 'Yes': 0 }, // strict — no partial credit, by design
  },
  {
    id: 'rules_commitment',
    section: 'Behaviour & Accountability',
    label: 'Are you willing to abide by the community rules and standards?',
    type: 'select',
    required: true,
    options: ['Yes', 'No'],
    scoring: { 'Yes': 9, 'No': 0 },
  },
  {
    id: 'removal_policy_understanding',
    section: 'Behaviour & Accountability',
    label: 'Do you understand that repeated violations of community rules may result in removal without prior notice?',
    type: 'select',
    required: true,
    options: ['Yes', 'No'],
    scoring: { 'Yes': 7, 'No': 0 },
  },

  // ---------- Community Security ----------
  {
    id: 'prior_ban_or_identity_change',
    section: 'Community Security',
    label: 'Have you ever been banned/removed from a community, or rejoined under a different number or identity?',
    type: 'select',
    required: true,
    options: ['Yes', 'No'],
    scoring: { 'No': 14, 'Yes': 0 },
  },
  {
    id: 'applying_for_self',
    section: 'Community Security',
    label: 'Are you applying on behalf of yourself and not another person?',
    type: 'select',
    required: true,
    options: ['Yes', 'No'],
    scoring: { 'Yes': 14, 'No': 0 },
  },

  // ---------- Referral Quality Control ----------
  {
    id: 'referral_source',
    section: 'Referral Quality Control',
    label: 'How did you hear about us?',
    type: 'select',
    required: true,
    options: ['Referred by a current member', 'Social media', 'Search engine', 'Random invite link', 'Other'],
    scoring: {
      'Referred by a current member': 9,
      'Social media': 5,
      'Search engine': 5,
      'Other': 3,
      'Random invite link': 0,
    },
  },
  {
    id: 'referrer_name',
    section: 'Referral Quality Control',
    label: "Referrer's Name (if applicable)",
    type: 'text',
    required: false,
    scoring: 'manual_signal',
  },
  {
    id: 'referrer_closeness',
    section: 'Referral Quality Control',
    label: 'How well do you know the member who referred you?',
    type: 'select',
    required: true,
    options: ['Close friend', 'Friend', 'Acquaintance', 'Met online', 'Not applicable'],
    note: 'This helps identify members who invite random people indiscriminately.',
    scoring: {
      'Close friend': 4,
      'Friend': 3,
      'Not applicable': 3, // no penalty for organic applicants who weren't referred
      'Acquaintance': 2,
      'Met online': 1,
    },
  },

  // ---------- Commitment ----------
  {
    id: 'participation_commitment',
    section: 'Commitment',
    label: 'Will you be willing to introduce yourself after joining and participate positively in community activities when possible?',
    type: 'select',
    required: true,
    options: ['Yes', 'No'],
    scoring: { 'Yes': 9, 'No': 0 },
  },

  // ---------- Finally ----------
  {
    id: 'anything_else',
    section: 'Finally',
    label: "Is there anything we should know about you that would help us determine whether you're a good fit for this community?",
    type: 'textarea',
    required: false,
    note: 'This open-ended question often reveals more than any multiple-choice question.',
    scoring: 'manual_signal',
  },
];

const MAX_SCORE = 100;

/**
 * Scores a submitted application against the questionnaire.
 * @param {Object} answers - key/value map of question id -> submitted answer
 * @returns {{ score: number, maxScore: number, flags: string[] }}
 */
function scoreApplication(answers) {
  let score = 0;
  const flags = [];

  for (const q of QUESTIONS) {
    const answer = answers[q.id];

    if (q.scoring === 'manual_signal') continue;

    if (q.scoring === 'presence') {
      const looksLikeUrl = typeof answer === 'string' && /^https?:\/\/.+\..+/.test(answer.trim());
      if (looksLikeUrl) {
        score += q.points;
      } else {
        flags.push(`No valid social profile link provided for "${q.label}"`);
      }
      continue;
    }

    if (typeof q.scoring === 'object') {
      const points = q.scoring[answer];
      if (typeof points === 'number') {
        score += points;
      } else {
        flags.push(`Unrecognized or missing answer for "${q.label}"`);
      }
    }
  }

  // Cross-field signal: heavy red flags worth surfacing explicitly to the reviewer
  if (answers.applying_for_self === 'No') {
    flags.push('Applicant indicated they are applying on behalf of someone else.');
  }
  if (answers.prior_ban_or_identity_change === 'Yes') {
    flags.push('Applicant indicated prior ban/removal or rejoining under a different identity.');
  }
  if (answers.sales_intent === 'Yes') {
    flags.push('Applicant indicated primary intent is promotions/sales.');
  }

  return { score, maxScore: MAX_SCORE, flags };
}

module.exports = { QUESTIONS, MAX_SCORE, scoreApplication };
