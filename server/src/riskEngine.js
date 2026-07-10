const symptomLabels = {
  headache: "sakit kepala berat",
  blurred_vision: "pandangan kabur",
  epigastric_pain: "nyeri ulu hati",
  swelling: "bengkak wajah/tangan",
  nausea: "mual berat",
  seizure: "kejang",
  shortness_breath: "sesak napas",
};

const factorLabels = {
  chronic_hypertension: "riwayat hipertensi",
  previous_preeclampsia: "riwayat preeklamsia",
  diabetes: "diabetes",
  kidney_disease: "penyakit ginjal",
  family_history: "riwayat keluarga",
  multiple_pregnancy: "kehamilan ganda",
  age_risk: "usia ibu berisiko",
};

export function assessRisk(payload) {
  const systolic = Number(payload.systolic || 0);
  const diastolic = Number(payload.diastolic || 0);
  const gestationalAge = Number(payload.gestationalAge || 0);
  const symptoms = payload.symptoms || [];
  const riskFactors = payload.riskFactors || [];
  const ancStatus = payload.ancStatus || "unknown";
  const customAnswers = payload.customAnswers || [];
  const reasons = [];

  if (gestationalAge >= 20) {
    reasons.push(`usia kehamilan ${gestationalAge} minggu`);
  }

  if (systolic >= 160 || diastolic >= 110 || symptoms.includes("seizure")) {
    const danger = [];
    if (systolic >= 160 || diastolic >= 110) danger.push(`tekanan darah ${systolic}/${diastolic}`);
    if (symptoms.includes("seizure")) danger.push("kejang");

    return {
      riskScore: 0.96,
      riskCategory: "emergency",
      triageRecommendation:
        "Segera ke IGD atau fasilitas kesehatan rujukan. Jangan menunggu jadwal kontrol berikutnya.",
      explanation: `Tanda bahaya terdeteksi: ${danger.join(", ")}.`,
    };
  }

  let score = 0.08;

  if (gestationalAge >= 20) score += 0.08;
  if (systolic >= 140 || diastolic >= 90) {
    score += 0.34;
    reasons.push(`tekanan darah ${systolic}/${diastolic}`);
  } else if (systolic >= 130 || diastolic >= 85) {
    score += 0.14;
    reasons.push(`tekanan darah mulai meningkat ${systolic}/${diastolic}`);
  }

  const severeSymptoms = symptoms.filter((item) =>
    ["headache", "blurred_vision", "epigastric_pain", "shortness_breath"].includes(item),
  );

  score += Math.min(0.28, severeSymptoms.length * 0.09);
  score += Math.min(0.22, riskFactors.length * 0.055);

  if (ancStatus === "late" || ancStatus === "never") {
    score += 0.08;
    reasons.push("ANC tidak rutin");
  }

  if (severeSymptoms.length) {
    reasons.push(severeSymptoms.map((item) => symptomLabels[item]).join(", "));
  }

  if (riskFactors.length) {
    reasons.push(riskFactors.map((item) => factorLabels[item]).join(", "));
  }

  const customWeight = customAnswers.reduce((total, item) => total + Number(item.weight || 0), 0);

  if (customWeight > 0) {
    score += Math.min(0.3, customWeight);
    const weightedReasons = customAnswers
      .filter((item) => Number(item.weight || 0) > 0)
      .map((item) => item.questionText)
      .filter(Boolean);

    if (weightedReasons.length) {
      reasons.push(`pertanyaan tambahan: ${weightedReasons.join(", ")}`);
    }
  }

  const roundedScore = Math.min(0.94, Number(score.toFixed(2)));

  if (roundedScore >= 0.68) {
    return {
      riskScore: roundedScore,
      riskCategory: "high",
      triageRecommendation:
        "Hubungi bidan/dokter hari ini untuk evaluasi tekanan darah, protein urine, dan kemungkinan rujukan.",
      explanation: reasons.length
        ? `Risiko tinggi karena ${reasons.join("; ")}.`
        : "Risiko tinggi berdasarkan kombinasi input skrining.",
    };
  }

  if (roundedScore >= 0.36) {
    return {
      riskScore: roundedScore,
      riskCategory: "moderate",
      triageRecommendation:
        "Jadwalkan konsultasi dalam 24-48 jam dan ulangi pengukuran tekanan darah dengan alat tervalidasi.",
      explanation: reasons.length
        ? `Perlu pemantauan karena ${reasons.join("; ")}.`
        : "Perlu pemantauan berdasarkan input skrining.",
    };
  }

  return {
    riskScore: roundedScore,
    riskCategory: "low",
    triageRecommendation:
      "Lanjutkan ANC rutin, catat tekanan darah, dan ulangi skrining bila muncul tanda bahaya.",
    explanation: "Belum ada tanda risiko berat dari data yang diinput.",
  };
}
