import { v4 as uuid } from "uuid";
import { hashPassword } from "../src/auth.js";
import { pool } from "../src/db.js";
import { assessRisk } from "../src/riskEngine.js";

const passwordHash = await hashPassword("password123");

async function upsertUser(client, { id, name, email, role, phone }) {
  const result = await client.query(
    `insert into users (id, name, email, password_hash, role, phone, status)
     values ($1, $2, $3, $4, $5, $6, 'active')
     on conflict (email) do update
     set name = excluded.name, role = excluded.role, phone = excluded.phone
     returning id`,
    [id, name, email, passwordHash, role, phone],
  );

  return result.rows[0].id;
}

const users = {
  mother: uuid(),
  mother2: uuid(),
  healthWorker: uuid(),
  doctor: uuid(),
  admin: uuid(),
};

const client = await pool.connect();

try {
  await client.query("begin");

  const sariUserId = await upsertUser(client, { id: users.mother, name: "Sari Aminah", email: "sari@example.com", role: "mother", phone: "081234567890" });
  const dewiUserId = await upsertUser(client, { id: users.mother2, name: "Dewi Lestari", email: "dewi@example.com", role: "mother", phone: "081298765432" });
  await upsertUser(client, { id: users.healthWorker, name: "Bidan Rina", email: "bidan@example.com", role: "health_worker", phone: "082211110000" });
  await upsertUser(client, { id: users.doctor, name: "dr. Maya", email: "dokter@example.com", role: "doctor", phone: "082233330000" });
  await upsertUser(client, { id: users.admin, name: "Admin PrestiBot", email: "admin@example.com", role: "admin", phone: "080000000000" });

  const motherIds = {};
  const sariMother = await client.query(
    `insert into pregnant_mothers (id, user_id, date_of_birth, gestational_age, gravida_parity, address)
     values ($1, $2, '1995-04-12', 30, 'G2P1A0', 'Pulo Bandring, Asahan')
     on conflict (user_id) do update
     set gestational_age = excluded.gestational_age,
         gravida_parity = excluded.gravida_parity,
         address = excluded.address
     returning id`,
    [uuid(), sariUserId],
  );
  const dewiMother = await client.query(
    `insert into pregnant_mothers (id, user_id, date_of_birth, gestational_age, gravida_parity, address)
     values ($1, $2, '1990-11-02', 26, 'G3P2A0', 'Sidomulyo, Asahan')
     on conflict (user_id) do update
     set gestational_age = excluded.gestational_age,
         gravida_parity = excluded.gravida_parity,
         address = excluded.address
     returning id`,
    [uuid(), dewiUserId],
  );
  motherIds.sari = sariMother.rows[0].id;
  motherIds.dewi = dewiMother.rows[0].id;

  const seeded = await client.query("select count(*)::int as count from ai_assessments");

if (seeded.rows[0].count === 0) {
  const examples = [
    {
      motherId: motherIds.sari,
      answers: {
        gestationalAge: 30,
        systolic: 148,
        diastolic: 96,
        symptoms: ["headache", "swelling"],
        riskFactors: ["previous_preeclampsia"],
        ancStatus: "late",
      },
    },
    {
      motherId: motherIds.dewi,
      answers: {
        gestationalAge: 26,
        systolic: 124,
        diastolic: 82,
        symptoms: [],
        riskFactors: ["family_history"],
        ancStatus: "routine",
      },
    },
  ];

  for (const example of examples) {
    const sessionId = uuid();
    const assessment = assessRisk(example.answers);

    await client.query(
      `insert into screening_sessions (id, mother_id, status, answers, completed_at)
       values ($1, $2, 'completed', $3, now())`,
      [sessionId, example.motherId, example.answers],
    );
    await client.query(
      `insert into ai_assessments
       (id, screening_session_id, risk_score, risk_category, triage_recommendation, explanation)
       values ($1, $2, $3, $4, $5, $6)`,
      [
        uuid(),
        sessionId,
        assessment.riskScore,
        assessment.riskCategory,
        assessment.triageRecommendation,
        assessment.explanation,
      ],
    );
  }
}

  await client.query("commit");
} catch (error) {
  await client.query("rollback");
  throw error;
} finally {
  client.release();
}

await pool.end();

console.log("Seed data selesai. Password semua akun demo: password123");
