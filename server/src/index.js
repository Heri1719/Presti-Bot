import cors from "cors";
import express from "express";
import { v4 as uuid } from "uuid";
import { config } from "./config.js";
import { hashPassword, requireAuth, requireRole, signToken, verifyPassword } from "./auth.js";
import { query, withTransaction } from "./db.js";
import { assessRisk } from "./riskEngine.js";

const app = express();

app.use(cors());
app.use(express.json());

app.get("/api/health", async (_req, res) => {
  const db = await query("select now() as time");
  res.json({ ok: true, databaseTime: db.rows[0].time });
});

app.post("/api/auth/register", async (req, res) => {
  const { name, email, password, phone, dateOfBirth, gestationalAge, gravidaParity, address } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ message: "Nama, email, dan password wajib diisi." });
  }

  const passwordHash = await hashPassword(password);
  const userId = uuid();
  const motherId = uuid();

  try {
    const created = await withTransaction(async (client) => {
      const user = await client.query(
      `insert into users (id, name, email, password_hash, role, phone, status)
       values ($1, $2, $3, $4, 'mother', $5, 'active')
       returning id, name, email, role, phone, status`,
        [userId, name, email, passwordHash, phone || ""],
      );
      await client.query(
      `insert into pregnant_mothers
       (id, user_id, date_of_birth, gestational_age, gravida_parity, address)
       values ($1, $2, $3, $4, $5, $6)`,
        [motherId, userId, dateOfBirth || null, gestationalAge || null, gravidaParity || "", address || ""],
      );
      return user.rows[0];
    });

    res.status(201).json({ user: created, token: signToken(created) });
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({ message: "Email sudah terdaftar." });
    }
    throw error;
  }
});

app.post("/api/auth/google/register", async (req, res) => {
  const { credential, phone, dateOfBirth, gestationalAge, address } = req.body;

  if (!config.googleClientId) {
    return res.status(400).json({ message: "Google Sign-In belum dikonfigurasi." });
  }

  if (!credential) {
    return res.status(400).json({ message: "Token Google tidak ditemukan." });
  }

  const googleResponse = await fetch(
    `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`,
  );

  if (!googleResponse.ok) {
    return res.status(401).json({ message: "Token Google tidak valid." });
  }

  const googleUser = await googleResponse.json();

  if (googleUser.aud !== config.googleClientId || googleUser.email_verified !== "true") {
    return res.status(401).json({ message: "Akun Google tidak dapat diverifikasi." });
  }

  const email = googleUser.email;
  const name = googleUser.name || email.split("@")[0];
  const passwordHash = await hashPassword(`google:${googleUser.sub}:${uuid()}`);

  const created = await withTransaction(async (client) => {
    const existing = await client.query(
      "select id, name, email, role, phone, status from users where email = $1",
      [email],
    );

    if (existing.rows[0]) {
      if (existing.rows[0].role !== "mother") {
        const conflict = new Error("Email Google ini sudah terdaftar sebagai bidan/admin.");
        conflict.statusCode = 409;
        throw conflict;
      }

      await client.query(
        `insert into pregnant_mothers
         (id, user_id, date_of_birth, gestational_age, address)
         values ($1, $2, $3, $4, $5)
         on conflict (user_id) do update
         set date_of_birth = coalesce(excluded.date_of_birth, pregnant_mothers.date_of_birth),
             gestational_age = coalesce(excluded.gestational_age, pregnant_mothers.gestational_age),
             address = coalesce(nullif(excluded.address, ''), pregnant_mothers.address),
             updated_at = now()`,
        [uuid(), existing.rows[0].id, dateOfBirth || null, gestationalAge || null, address || ""],
      );

      return existing.rows[0];
    }

    const userId = uuid();
    const motherId = uuid();
    const user = await client.query(
      `insert into users (id, name, email, password_hash, role, phone, status)
       values ($1, $2, $3, $4, 'mother', $5, 'active')
       returning id, name, email, role, phone, status`,
      [userId, name, email, passwordHash, phone || ""],
    );
    await client.query(
      `insert into pregnant_mothers
       (id, user_id, date_of_birth, gestational_age, address)
       values ($1, $2, $3, $4, $5)`,
      [motherId, userId, dateOfBirth || null, gestationalAge || null, address || ""],
    );

    return user.rows[0];
  });

  res.status(201).json({ user: created, token: signToken(created) });
});

app.post("/api/auth/login", async (req, res) => {
  const { email, password } = req.body;
  const result = await query("select * from users where email = $1 and status = 'active'", [email]);
  const user = result.rows[0];

  if (!user || !(await verifyPassword(password, user.password_hash))) {
    return res.status(401).json({ message: "Email atau password salah." });
  }

  const safeUser = {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    phone: user.phone,
    status: user.status,
  };

  res.json({ user: safeUser, token: signToken(safeUser) });
});

app.get("/api/me", requireAuth, async (req, res) => {
  let profile = null;

  if (req.user.role === "mother") {
    const result = await query("select * from pregnant_mothers where user_id = $1", [req.user.id]);
    profile = result.rows[0] || null;
  }

  res.json({ user: req.user, profile });
});

app.put("/api/profile/mother", requireAuth, requireRole("mother"), async (req, res) => {
  const { dateOfBirth, gestationalAge, gravidaParity, address, healthFacilityId } = req.body;
  const result = await query(
    `update pregnant_mothers
     set date_of_birth = $1, gestational_age = $2, gravida_parity = $3, address = $4,
         health_facility_id = $5, updated_at = now()
     where user_id = $6
     returning *`,
    [dateOfBirth || null, gestationalAge || null, gravidaParity || "", address || "", healthFacilityId || null, req.user.id],
  );

  res.json({ profile: result.rows[0] });
});

app.post("/api/screening/start", requireAuth, requireRole("mother"), async (req, res) => {
  const mother = await query("select id from pregnant_mothers where user_id = $1", [req.user.id]);

  if (!mother.rows[0]) {
    return res.status(400).json({ message: "Profil ibu hamil belum dibuat." });
  }

  const session = await query(
    `insert into screening_sessions (id, mother_id, status)
     values ($1, $2, 'in_progress')
     returning *`,
    [uuid(), mother.rows[0].id],
  );

  res.status(201).json({ session: session.rows[0] });
});

app.post("/api/screening/complete", requireAuth, requireRole("mother"), async (req, res) => {
  const { sessionId, answers } = req.body;

  if (!sessionId || !answers) {
    return res.status(400).json({ message: "Session dan jawaban wajib diisi." });
  }

  const session = await query(
    `select ss.*
     from screening_sessions ss
     join pregnant_mothers pm on pm.id = ss.mother_id
     where ss.id = $1 and pm.user_id = $2`,
    [sessionId, req.user.id],
  );

  if (!session.rows[0]) {
    return res.status(404).json({ message: "Sesi skrining tidak ditemukan." });
  }

  const assessment = assessRisk(answers);

  const savedAssessment = await withTransaction(async (client) => {
    await client.query(
      `update screening_sessions
       set status = 'completed', answers = $1, completed_at = now()
       where id = $2`,
      [answers, sessionId],
    );
    return client.query(
      `insert into ai_assessments
       (id, screening_session_id, risk_score, risk_category, triage_recommendation, explanation)
       values ($1, $2, $3, $4, $5, $6)
       returning *`,
      [
        uuid(),
        sessionId,
        assessment.riskScore,
        assessment.riskCategory,
        assessment.triageRecommendation,
        assessment.explanation,
      ],
    );
  });

  res.status(201).json({ assessment: savedAssessment.rows[0] });
});

app.get("/api/screening/history", requireAuth, requireRole("mother"), async (req, res) => {
  const result = await query(
    `select ss.id as session_id, ss.created_at, ss.completed_at, ss.answers,
            aa.id as assessment_id, aa.risk_score, aa.risk_category,
            aa.triage_recommendation, aa.explanation
     from screening_sessions ss
     join pregnant_mothers pm on pm.id = ss.mother_id
     left join ai_assessments aa on aa.screening_session_id = ss.id
     where pm.user_id = $1
     order by ss.created_at desc`,
    [req.user.id],
  );

  res.json({ history: result.rows });
});

app.get("/api/screening/result/:id", requireAuth, async (req, res) => {
  const result = await query(
    `select ss.id as session_id, ss.answers, ss.created_at, ss.completed_at,
            u.name as mother_name, u.phone, pm.gestational_age, pm.address,
            aa.*
     from screening_sessions ss
     join pregnant_mothers pm on pm.id = ss.mother_id
     join users u on u.id = pm.user_id
     join ai_assessments aa on aa.screening_session_id = ss.id
     where ss.id = $1`,
    [req.params.id],
  );

  if (!result.rows[0]) {
    return res.status(404).json({ message: "Hasil tidak ditemukan." });
  }

  res.json({ result: result.rows[0] });
});

app.get("/api/screening/questions", requireAuth, async (_req, res) => {
  const result = await query(
    `select id, question_text, yes_label, no_label, yes_weight, no_weight, sort_order, is_active
     from screening_questions
     where is_active = true
     order by sort_order asc, created_at asc`,
  );

  res.json({ questions: result.rows });
});

app.get("/api/admin/screening-questions", requireAuth, requireRole("admin"), async (_req, res) => {
  const result = await query(
    `select id, question_text, yes_label, no_label, yes_weight, no_weight, sort_order, is_active, created_at, updated_at
     from screening_questions
     order by sort_order asc, created_at asc`,
  );

  res.json({ questions: result.rows });
});

app.post("/api/admin/screening-questions", requireAuth, requireRole("admin"), async (req, res) => {
  const { questionText, yesLabel, noLabel, yesWeight, noWeight, sortOrder, isActive } = req.body;

  if (!questionText || !questionText.trim()) {
    return res.status(400).json({ message: "Pertanyaan wajib diisi." });
  }

  const result = await query(
    `insert into screening_questions
     (id, question_text, yes_label, no_label, yes_weight, no_weight, sort_order, is_active, created_by)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     returning *`,
    [
      uuid(),
      questionText.trim(),
      yesLabel?.trim() || "Ya",
      noLabel?.trim() || "Tidak",
      Number(yesWeight || 0),
      Number(noWeight || 0),
      Number(sortOrder || 100),
      isActive !== false,
      req.user.id,
    ],
  );

  res.status(201).json({ question: result.rows[0] });
});

app.put("/api/admin/screening-questions/:id", requireAuth, requireRole("admin"), async (req, res) => {
  const { questionText, yesLabel, noLabel, yesWeight, noWeight, sortOrder, isActive } = req.body;
  const result = await query(
    `update screening_questions
     set question_text = $1,
         yes_label = $2,
         no_label = $3,
         yes_weight = $4,
         no_weight = $5,
         sort_order = $6,
         is_active = $7,
         updated_at = now()
     where id = $8
     returning *`,
    [
      questionText?.trim() || "",
      yesLabel?.trim() || "Ya",
      noLabel?.trim() || "Tidak",
      Number(yesWeight || 0),
      Number(noWeight || 0),
      Number(sortOrder || 100),
      isActive !== false,
      req.params.id,
    ],
  );

  if (!result.rows[0]) {
    return res.status(404).json({ message: "Pertanyaan tidak ditemukan." });
  }

  res.json({ question: result.rows[0] });
});

app.delete("/api/admin/screening-questions/:id", requireAuth, requireRole("admin"), async (req, res) => {
  const result = await query(
    "update screening_questions set is_active = false, updated_at = now() where id = $1 returning id",
    [req.params.id],
  );

  if (!result.rows[0]) {
    return res.status(404).json({ message: "Pertanyaan tidak ditemukan." });
  }

  res.json({ ok: true });
});

app.get("/api/dashboard/patients", requireAuth, requireRole("health_worker", "doctor", "admin"), async (_req, res) => {
  const result = await query(
    `select distinct on (pm.id)
            pm.id as mother_id, u.name, u.phone, u.email, pm.gestational_age,
            pm.gravida_parity, pm.address, ss.id as session_id, ss.completed_at,
            aa.id as assessment_id, aa.risk_score, aa.risk_category,
            aa.triage_recommendation, aa.explanation,
            cv.clinical_risk_category, cv.is_match, cv.notes as validation_notes
     from pregnant_mothers pm
     join users u on u.id = pm.user_id
     left join screening_sessions ss on ss.mother_id = pm.id
     left join ai_assessments aa on aa.screening_session_id = ss.id
     left join clinical_validations cv on cv.ai_assessment_id = aa.id
     order by pm.id, ss.completed_at desc nulls last`,
  );

  const priority = { emergency: 0, high: 1, moderate: 2, low: 3 };
  const patients = result.rows.sort(
    (a, b) => (priority[a.risk_category] ?? 9) - (priority[b.risk_category] ?? 9),
  );

  res.json({ patients });
});

app.post("/api/validation/submit", requireAuth, requireRole("health_worker", "doctor", "admin"), async (req, res) => {
  const { assessmentId, clinicalRiskCategory, isMatch, notes } = req.body;

  if (!assessmentId || !clinicalRiskCategory) {
    return res.status(400).json({ message: "Assessment dan kategori klinis wajib diisi." });
  }

  const validation = await query(
    `insert into clinical_validations
     (id, ai_assessment_id, validator_id, clinical_risk_category, is_match, notes)
     values ($1, $2, $3, $4, $5, $6)
     returning *`,
    [uuid(), assessmentId, req.user.id, clinicalRiskCategory, Boolean(isMatch), notes || ""],
  );

  res.status(201).json({ validation: validation.rows[0] });
});

app.get("/api/resources", (_req, res) => {
  res.json({
    resources: [
      {
        title: "Tanda Bahaya Preeklamsia",
        category: "Darurat",
        body: "Segera cari pertolongan bila mengalami sakit kepala berat, pandangan kabur, nyeri ulu hati, sesak, kejang, atau tekanan darah sangat tinggi.",
      },
      {
        title: "Cara Mencatat Tekanan Darah",
        category: "Skrining",
        body: "Ukur setelah duduk tenang 5 menit, gunakan manset sesuai ukuran lengan, dan catat angka sistolik/diastolik beserta waktu pengukuran.",
      },
      {
        title: "ANC Rutin",
        category: "Pencegahan",
        body: "Pemeriksaan antenatal rutin membantu mendeteksi tekanan darah meningkat, protein urine, pertumbuhan janin, dan keluhan ibu lebih awal.",
      },
    ],
  });
});

app.get("/api/reports/export", requireAuth, requireRole("health_worker", "doctor", "admin"), async (_req, res) => {
  const result = await query(
    `select u.name, u.email, u.phone, pm.gestational_age, pm.gravida_parity,
            aa.risk_category, aa.risk_score, aa.triage_recommendation,
            ss.completed_at, cv.clinical_risk_category, cv.is_match
     from ai_assessments aa
     join screening_sessions ss on ss.id = aa.screening_session_id
     join pregnant_mothers pm on pm.id = ss.mother_id
     join users u on u.id = pm.user_id
     left join clinical_validations cv on cv.ai_assessment_id = aa.id
     order by ss.completed_at desc`,
  );

  const headers = [
    "name",
    "email",
    "phone",
    "gestational_age",
    "gravida_parity",
    "risk_category",
    "risk_score",
    "triage_recommendation",
    "completed_at",
    "clinical_risk_category",
    "is_match",
  ];
  const csv = [
    headers.join(","),
    ...result.rows.map((row) =>
      headers.map((header) => JSON.stringify(row[header] ?? "")).join(","),
    ),
  ].join("\n");

  res.header("Content-Type", "text/csv");
  res.attachment("prestibot-report.csv");
  res.send(csv);
});

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(error.statusCode || 500).json({ message: error.statusCode ? error.message : "Terjadi kesalahan server." });
});

app.listen(config.port, () => {
  console.log(`PrestiBot API berjalan di http://localhost:${config.port}`);
});
