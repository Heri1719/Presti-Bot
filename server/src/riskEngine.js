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

const referralFacilities = [
  {
    keywords: ["asahan", "kisaran", "pulo bandring", "air batu", "tanjung balai", "tanjungbalai"],
    name: "RSUD H. Abdul Manan Simatupang Kisaran",
    address: "Jl. Cipto 13, Kisaran Kota, Kec. Kota Kisaran Barat, Kabupaten Asahan",
    phone: "0821-8461-4936",
  },
];

function findReferral(address = "") {
  const normalizedAddress = address.toLowerCase();
  const facility = referralFacilities.find((item) =>
    item.keywords.some((keyword) => normalizedAddress.includes(keyword)),
  );

  if (facility) {
    return {
      label: `Rujukan terdekat berdasarkan alamat Ibu: ${facility.name}`,
      contact: `Alamat: ${facility.address}. Telepon: ${facility.phone}.`,
    };
  }

  return {
    label: "Rujukan terdekat: IGD rumah sakit atau puskesmas PONED terdekat dari lokasi Ibu.",
    contact: "Hubungi PSC 119 untuk bantuan ambulans/rujukan medis. Jika 119 tidak tersambung, hubungi 112.",
  };
}

function buildRecommendation(category, address = "") {
  const referral = findReferral(address);

  if (category === "emergency") {
    return [
      "Segera berangkat ke IGD sekarang. Jangan menunggu jadwal kontrol berikutnya dan jangan menyetir sendiri.",
      referral.label,
      referral.contact,
      "Minta keluarga atau bidan mendampingi, bawa buku KIA/BPJS/hasil pemeriksaan, dan posisikan Ibu miring kiri bila lemas atau setelah kejang.",
    ].join("\n");
  }

  if (category === "high") {
    return [
      "Hubungi bidan atau dokter hari ini untuk evaluasi tekanan darah, protein urine, dan tanda bahaya.",
      referral.label,
      referral.contact,
      "Bila muncul kejang, sakit kepala berat, pandangan kabur, nyeri ulu hati, sesak, atau tekanan darah mencapai 160/110, langsung ke IGD.",
    ].join("\n");
  }

  if (category === "moderate") {
    return [
      "Jadwalkan pemeriksaan dalam 24-48 jam dan ulangi pengukuran tekanan darah dengan alat tervalidasi.",
      "Catat hasil tekanan darah, usia kehamilan, keluhan, dan obat yang sedang diminum.",
      "Jika keluhan memburuk atau ada tanda bahaya, gunakan rujukan: " + referral.label.replace("Rujukan terdekat berdasarkan alamat Ibu: ", ""),
      referral.contact,
    ].join("\n");
  }

  return [
    "Lanjutkan ANC rutin dan catat tekanan darah secara berkala.",
    "Hubungi bidan bila muncul sakit kepala berat, pandangan kabur, bengkak wajah/tangan, nyeri ulu hati, sesak, atau gerak janin berkurang.",
    "Untuk kondisi darurat, hubungi PSC 119 atau datang ke IGD terdekat.",
  ].join("\n");
}

export function assessRisk(payload) {
  const systolic = Number(payload.systolic || 0);
  const diastolic = Number(payload.diastolic || 0);
  const gestationalAge = Number(payload.gestationalAge || 0);
  const symptoms = payload.symptoms || [];
  const riskFactors = payload.riskFactors || [];
  const ancStatus = payload.ancStatus || "unknown";
  const customAnswers = payload.customAnswers || [];
  const address = payload.address || "";
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
      triageRecommendation: buildRecommendation("emergency", address),
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
      triageRecommendation: buildRecommendation("high", address),
      explanation: reasons.length
        ? `Risiko tinggi karena ${reasons.join("; ")}.`
        : "Risiko tinggi berdasarkan kombinasi input skrining.",
    };
  }

  if (roundedScore >= 0.36) {
    return {
      riskScore: roundedScore,
      riskCategory: "moderate",
      triageRecommendation: buildRecommendation("moderate", address),
      explanation: reasons.length
        ? `Perlu pemantauan karena ${reasons.join("; ")}.`
        : "Perlu pemantauan berdasarkan input skrining.",
    };
  }

  return {
    riskScore: roundedScore,
    riskCategory: "low",
    triageRecommendation: buildRecommendation("low", address),
    explanation: "Belum ada tanda risiko berat dari data yang diinput.",
  };
}
