import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Activity,
  AlertTriangle,
  Baby,
  BookOpen,
  CheckCircle2,
  ClipboardCheck,
  Download,
  HeartPulse,
  LogOut,
  MessageCircle,
  Plus,
  ShieldCheck,
  SlidersHorizontal,
  Stethoscope,
  UserRound,
} from "lucide-react";
import "./styles.css";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4000/api";

const riskCopy = {
  emergency: { label: "Darurat", className: "risk-emergency" },
  high: { label: "Risiko Tinggi", className: "risk-high" },
  moderate: { label: "Risiko Sedang", className: "risk-moderate" },
  low: { label: "Risiko Rendah", className: "risk-low" },
};

const symptoms = [
  ["headache", "Sakit kepala berat"],
  ["blurred_vision", "Pandangan kabur"],
  ["epigastric_pain", "Nyeri ulu hati"],
  ["swelling", "Bengkak wajah/tangan"],
  ["shortness_breath", "Sesak napas"],
  ["seizure", "Kejang"],
];

const riskFactors = [
  ["chronic_hypertension", "Hipertensi kronis"],
  ["previous_preeclampsia", "Pernah preeklamsia"],
  ["diabetes", "Diabetes"],
  ["kidney_disease", "Penyakit ginjal"],
  ["family_history", "Riwayat keluarga"],
  ["multiple_pregnancy", "Kehamilan ganda"],
  ["age_risk", "Usia <20 atau >35"],
];

function loadGoogleIdentityScript() {
  if (window.google?.accounts?.id) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const existing = document.querySelector("script[data-google-identity]");

    if (existing) {
      existing.addEventListener("load", resolve, { once: true });
      existing.addEventListener("error", reject, { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.dataset.googleIdentity = "true";
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

function useApi(token, onUnauthorized) {
  return useMemo(() => {
    async function request(path, options = {}) {
      const response = await fetch(`${API_URL}${path}`, {
        ...options,
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(options.headers || {}),
        },
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ message: "Request gagal." }));
        const message = response.status === 401 && token
          ? "Sesi login sudah berakhir. Silakan masuk kembali sebelum melanjutkan skrining."
          : error.message || "Request gagal.";
        const requestError = new Error(message);
        requestError.status = response.status;

        if (response.status === 401 && token && onUnauthorized) {
          onUnauthorized(message);
        }

        throw requestError;
      }

      if (response.headers.get("content-type")?.includes("text/csv")) {
        return response.text();
      }

      return response.json();
    }

    return { request };
  }, [onUnauthorized, token]);
}

function App() {
  const [token, setToken] = useState(localStorage.getItem("prestibot_token") || "");
  const [user, setUser] = useState(() => {
    const raw = localStorage.getItem("prestibot_user");
    return raw ? JSON.parse(raw) : null;
  });
  const [sessionMessage, setSessionMessage] = useState("");
  const [view, setView] = useState(user?.role === "mother" ? "screening" : "dashboard");

  const clearSession = useCallback((message = "") => {
    localStorage.removeItem("prestibot_token");
    localStorage.removeItem("prestibot_user");
    setToken("");
    setUser(null);
    setView("home");
    setSessionMessage(message);
  }, []);

  const api = useApi(token, clearSession);

  useEffect(() => {
    if (!token || !user) return;

    api.request("/me").catch((error) => {
      if (error.status !== 401) {
        console.error(error);
      }
    });
  }, [api, token, user]);

  function handleAuth(payload) {
    localStorage.setItem("prestibot_token", payload.token);
    localStorage.setItem("prestibot_user", JSON.stringify(payload.user));
    setToken(payload.token);
    setUser(payload.user);
    setSessionMessage("");
    setView(payload.user.role === "mother" ? "screening" : "dashboard");
  }

  function logout() {
    clearSession("");
  }

  if (!user) {
    return <AuthScreen api={api} onAuth={handleAuth} initialMessage={sessionMessage} />;
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">
            <HeartPulse size={22} />
          </div>
          <div>
            <strong>PrestiBot</strong>
            <span>Clinical AI Triage</span>
          </div>
        </div>

        <nav>
          {user.role === "mother" && (
            <>
              <button className={view === "screening" ? "active" : ""} onClick={() => setView("screening")}>
                <MessageCircle size={18} /> Skrining
              </button>
              <button className={view === "history" ? "active" : ""} onClick={() => setView("history")}>
                <Activity size={18} /> Riwayat
              </button>
            </>
          )}
          {user.role !== "mother" && (
            <button className={view === "dashboard" ? "active" : ""} onClick={() => setView("dashboard")}>
              <ClipboardCheck size={18} /> Dashboard
            </button>
          )}
          {user.role === "admin" && (
            <button className={view === "questions" ? "active" : ""} onClick={() => setView("questions")}>
              <SlidersHorizontal size={18} /> Pertanyaan
            </button>
          )}
          <button className={view === "education" ? "active" : ""} onClick={() => setView("education")}>
            <BookOpen size={18} /> Edukasi
          </button>
        </nav>

        <div className="account">
          <UserRound size={18} />
          <div>
            <strong>{user.name}</strong>
            <span>{roleLabel(user.role)}</span>
          </div>
          <button className="icon-button" aria-label="Logout" title="Logout" onClick={logout}>
            <LogOut size={18} />
          </button>
        </div>
      </aside>

      <main className="main-content">
        {view === "screening" && <Screening api={api} />}
        {view === "history" && <History api={api} />}
        {view === "dashboard" && <Dashboard api={api} />}
        {view === "questions" && <QuestionManager api={api} />}
        {view === "education" && <Education api={api} />}
      </main>
    </div>
  );
}

function AuthScreen({ api, onAuth, initialMessage = "" }) {
  const [mode, setMode] = useState("login");
  const googleButtonRef = useRef(null);
  const formRef = useRef(null);
  const [googleConfig, setGoogleConfig] = useState({ checked: false, enabled: false, clientId: "" });
  const [form, setForm] = useState({
    name: "",
    email: "sari@example.com",
    password: "password123",
    phone: "",
    dateOfBirth: "",
    gestationalAge: 28,
    address: "Pulo Bandring, Asahan",
  });
  const [error, setError] = useState(initialMessage);

  useEffect(() => {
    setError(initialMessage);
  }, [initialMessage]);

  useEffect(() => {
    formRef.current = form;
  }, [form]);

  useEffect(() => {
    api.request("/auth/google/config")
      .then((data) => setGoogleConfig({ checked: true, enabled: data.enabled, clientId: data.clientId || "" }))
      .catch(() => setGoogleConfig({ checked: true, enabled: false, clientId: "" }));
  }, [api]);

  useEffect(() => {
    if (mode !== "register" || !googleConfig.enabled || !googleConfig.clientId || !googleButtonRef.current) {
      return;
    }

    let cancelled = false;

    loadGoogleIdentityScript()
      .then(() => {
        if (cancelled || !googleButtonRef.current) return;
        googleButtonRef.current.innerHTML = "";
        window.google.accounts.id.initialize({
          client_id: googleConfig.clientId,
          callback: async ({ credential }) => {
            setError("");
            try {
              const payload = await api.request("/auth/google/register", {
                method: "POST",
                body: JSON.stringify({
                  credential,
                  phone: formRef.current.phone,
                  dateOfBirth: formRef.current.dateOfBirth,
                  gestationalAge: formRef.current.gestationalAge,
                  address: formRef.current.address,
                }),
              });
              onAuth(payload);
            } catch (err) {
              setError(err.message);
            }
          },
        });
        window.google.accounts.id.renderButton(googleButtonRef.current, {
          theme: "outline",
          size: "large",
          text: "signup_with",
          width: googleButtonRef.current.offsetWidth,
        });
      })
      .catch(() => {
        setError("Tombol Google belum bisa dimuat. Coba refresh halaman.");
      });

    return () => {
      cancelled = true;
    };
  }, [api, googleConfig.clientId, googleConfig.enabled, mode, onAuth]);

  async function submit(event) {
    event.preventDefault();
    setError("");
    try {
      const path = mode === "login" ? "/auth/login" : "/auth/register";
      const payload = await api.request(path, {
        method: "POST",
        body: JSON.stringify(form),
      });
      onAuth(payload);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="auth-page">
      <section className="hero">
        <div className="hero-overlay">
          <div className="hero-copy">
            <div className="eyebrow">
              <ShieldCheck size={18} /> Research prototype
            </div>
            <h1>PrestiBot</h1>
            <p>
              Chatbot AI untuk deteksi dini risiko preeklamsia, rekomendasi triase rujukan, dan dashboard validasi klinis.
            </p>
            <div className="hero-stats">
              <span><strong>90%</strong> target akurasi</span>
              <span><strong>24/7</strong> skrining mandiri</span>
              <span><strong>RBAC</strong> role klinis</span>
            </div>
          </div>
        </div>
      </section>

      <section className="auth-panel">
        <div className="panel-header">
          <HeartPulse size={28} />
          <div>
            <h2>{mode === "login" ? "Masuk" : "Daftar Ibu Hamil"}</h2>
            <p>Masuk sebagai ibu hamil atau bidan/admin.</p>
          </div>
        </div>

        <div className="segmented">
          <button className={mode === "login" ? "selected" : ""} onClick={() => setMode("login")}>Login</button>
          <button className={mode === "register" ? "selected" : ""} onClick={() => setMode("register")}>Register</button>
        </div>

        <form onSubmit={submit} className="form-grid">
          {mode === "register" && (
            <>
              <Field label="Nama" value={form.name} onChange={(name) => setForm({ ...form, name })} />
              <Field label="Nomor HP" value={form.phone} onChange={(phone) => setForm({ ...form, phone })} />
            </>
          )}
          <Field label="Email" type="email" value={form.email} onChange={(email) => setForm({ ...form, email })} />
          <Field label={mode === "register" ? "Password (buat password)" : "Password"} type="password" value={form.password} onChange={(password) => setForm({ ...form, password })} />
          {mode === "register" && (
            <>
              <Field label="Tanggal lahir" type="date" value={form.dateOfBirth} onChange={(dateOfBirth) => setForm({ ...form, dateOfBirth })} />
              <Field label="Usia kehamilan" type="number" value={form.gestationalAge} onChange={(gestationalAge) => setForm({ ...form, gestationalAge })} />
              <Field label="Alamat" value={form.address} onChange={(address) => setForm({ ...form, address })} />
            </>
          )}
          {error && <div className="error-banner">{error}</div>}
          <button className="primary-button" type="submit">
            {mode === "login" ? "Masuk ke PrestiBot" : "Buat akun"}
          </button>
          {mode === "register" && googleConfig.enabled && (
            <>
              <div className="auth-divider"><span>atau</span></div>
              <div className="google-button-slot" ref={googleButtonRef} />
            </>
          )}
        </form>

        {mode === "login" && (
          <div className="demo-logins">
            <button onClick={() => setForm({ ...form, email: "sari@example.com", password: "password123" })}>Ibu</button>
            <button onClick={() => setForm({ ...form, email: "bidan@example.com", password: "password123" })}>Bidan/Admin</button>
          </div>
        )}
      </section>
    </div>
  );
}

function getScreeningStep(stepId) {
  const yesNo = (yesLabel = "Ya", noLabel = "Tidak") => [
    { label: yesLabel, value: "yes" },
    { label: noLabel, value: "no" },
  ];

  const steps = {
    gestationalAge: {
      type: "number",
      answerKey: "gestationalAge",
      inputLabel: "Usia kehamilan",
      placeholder: "Contoh: 28",
      suffix: "minggu",
    },
    bpKnown: {
      type: "choice",
      question: "Apakah Ibu mengetahui tekanan darah terakhir?",
      choices: [
        { label: "Ya, saya tahu", value: "yes" },
        { label: "Belum tahu", value: "no" },
      ],
    },
    systolic: {
      type: "number",
      answerKey: "systolic",
      inputLabel: "Angka atas / sistolik",
      placeholder: "Contoh: 120",
      suffix: "mmHg",
    },
    diastolic: {
      type: "number",
      answerKey: "diastolic",
      inputLabel: "Angka bawah / diastolik",
      placeholder: "Contoh: 80",
      suffix: "mmHg",
    },
    headache: {
      type: "choice",
      question: "Apakah Ibu mengalami sakit kepala berat yang tidak biasa?",
      choices: [
        { label: "Ya, sakit kepala berat", value: "yes", symptom: "headache" },
        { label: "Tidak", value: "no" },
      ],
      next: (value, answers) => {
        if (answers.systolic >= 160 || answers.diastolic >= 110) return "seizure";
        return value === "yes" ? "blurredVision" : "swelling";
      },
    },
    blurredVision: {
      type: "choice",
      question: "Apakah pandangan Ibu kabur, berkunang-kunang, atau melihat kilatan cahaya?",
      choices: [
        { label: "Ya, pandangan terganggu", value: "yes", symptom: "blurred_vision" },
        { label: "Tidak", value: "no" },
      ],
      next: () => "epigastricPain",
    },
    epigastricPain: {
      type: "choice",
      question: "Apakah ada nyeri ulu hati atau nyeri perut kanan atas yang mengganggu?",
      choices: [
        { label: "Ya, ada nyeri", value: "yes", symptom: "epigastric_pain" },
        { label: "Tidak", value: "no" },
      ],
      next: () => "shortnessBreath",
    },
    shortnessBreath: {
      type: "choice",
      question: "Apakah Ibu merasa sesak napas berat atau sangat lemas?",
      choices: [
        { label: "Ya, sesak/lemas berat", value: "yes", symptom: "shortness_breath" },
        { label: "Tidak", value: "no" },
      ],
      next: () => "seizure",
    },
    seizure: {
      type: "choice",
      question: "Apakah Ibu mengalami kejang atau hampir pingsan?",
      choices: [
        { label: "Ya, ada kejang/hampir pingsan", value: "yes", symptom: "seizure" },
        { label: "Tidak", value: "no" },
      ],
      next: (value, answers) => {
        if (value === "yes") return "complete";
        if (answers.systolic >= 160 || answers.diastolic >= 110) return "complete";
        return "swelling";
      },
    },
    swelling: {
      type: "choice",
      question: "Apakah wajah atau tangan Ibu bengkak mendadak?",
      choices: [
        { label: "Ya, bengkak mendadak", value: "yes", symptom: "swelling" },
        { label: "Tidak", value: "no" },
      ],
      next: (value, answers) => {
        const symptomCount = answers.symptoms.length + (value === "yes" ? 1 : 0);
        if ((answers.systolic >= 140 || answers.diastolic >= 90) && symptomCount >= 2) return "ancStatus";
        return "chronicHypertension";
      },
    },
    chronicHypertension: {
      type: "choice",
      question: "Sebelum hamil, apakah Ibu pernah punya tekanan darah tinggi atau minum obat hipertensi?",
      choices: [
        { label: "Ya, pernah hipertensi", value: "yes", factor: "chronic_hypertension" },
        { label: "Tidak", value: "no" },
      ],
      next: () => "previousPreeclampsia",
    },
    previousPreeclampsia: {
      type: "choice",
      question: "Pada kehamilan sebelumnya, apakah Ibu pernah diberi tahu mengalami preeklamsia atau keracunan kehamilan?",
      choices: [
        { label: "Ya, pernah", value: "yes", factor: "previous_preeclampsia" },
        { label: "Tidak / belum pernah hamil", value: "no" },
      ],
      next: () => "diabetesKidney",
    },
    diabetesKidney: {
      type: "choice",
      question: "Apakah Ibu punya diabetes atau penyakit ginjal?",
      choices: [
        { label: "Ya, ada salah satu", value: "yes", factor: "diabetes" },
        { label: "Tidak", value: "no" },
      ],
      next: () => "familyHistory",
    },
    familyHistory: {
      type: "choice",
      question: "Apakah ibu kandung atau saudara perempuan pernah mengalami hipertensi saat hamil/preeklamsia?",
      choices: [
        { label: "Ya, ada riwayat keluarga", value: "yes", factor: "family_history" },
        { label: "Tidak tahu / tidak ada", value: "no" },
      ],
      next: () => "customQuestions",
    },
    ancStatus: {
      type: "choice",
      question: "Terakhir, bagaimana pemeriksaan kehamilan atau ANC Ibu?",
      choices: [
        { label: "Rutin sesuai jadwal", value: "routine" },
        { label: "Terlambat kontrol", value: "late" },
        { label: "Belum pernah kontrol", value: "never" },
      ],
    },
  };

  return steps[stepId];
}

function Screening({ api }) {
  const chatEndRef = useRef(null);
  const [customQuestions, setCustomQuestions] = useState([]);
  const [answers, setAnswers] = useState({
    gestationalAge: null,
    systolic: null,
    diastolic: null,
    symptoms: [],
    riskFactors: [],
    customAnswers: [],
    ancStatus: "unknown",
  });
  const [messages, setMessages] = useState([
    {
      from: "bot",
      text: "Halo, saya PrestiBot. Saya akan bertanya pelan-pelan untuk membantu menilai risiko awal preeklamsia. Hasil ini bukan diagnosis, tapi bisa membantu menentukan apakah perlu segera diperiksa.",
    },
    { from: "bot", text: "Pertama, berapa usia kehamilan Ibu saat ini dalam minggu?" },
  ]);
  const [stepId, setStepId] = useState("gestationalAge");
  const [inputValue, setInputValue] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, stepId, result]);

  useEffect(() => {
    api.request("/screening/questions")
      .then((data) => setCustomQuestions(data.questions || []))
      .catch(() => setCustomQuestions([]));
  }, [api]);

  function getCurrentStep() {
    if (stepId.startsWith("custom:")) {
      const index = Number(stepId.split(":")[1]);
      const question = customQuestions[index];

      if (!question) return null;

      return {
        type: "choice",
        question: question.question_text,
        choices: [
          {
            label: question.yes_label,
            value: "yes",
            customAnswer: {
              questionId: question.id,
              questionText: question.question_text,
              answer: "yes",
              weight: Number(question.yes_weight || 0),
            },
          },
          {
            label: question.no_label,
            value: "no",
            customAnswer: {
              questionId: question.id,
              questionText: question.question_text,
              answer: "no",
              weight: Number(question.no_weight || 0),
            },
          },
        ],
      };
    }

    return getScreeningStep(stepId);
  }

  const currentStep = getCurrentStep();

  function addMessages(...items) {
    setMessages((current) => [...current, ...items]);
  }

  function appendAnswer(key, value) {
    setAnswers((current) => ({
      ...current,
      [key]: current[key].includes(value) ? current[key] : [...current[key], value],
    }));
  }

  function updateAnswer(key, value) {
    setAnswers((current) => ({ ...current, [key]: value }));
  }

  function appendCustomAnswer(answer) {
    setAnswers((current) => ({
      ...current,
      customAnswers: [
        ...current.customAnswers.filter((item) => item.questionId !== answer.questionId),
        answer,
      ],
    }));
  }

  function moveTo(nextStepId, botText) {
    setStepId(nextStepId);
    if (botText) {
      addMessages({ from: "bot", text: botText });
    }
  }

  function isEmergencySnapshot(nextAnswers = answers) {
    return (
      Number(nextAnswers.systolic || 0) >= 160 ||
      Number(nextAnswers.diastolic || 0) >= 110 ||
      nextAnswers.symptoms.includes("seizure")
    );
  }

  function submitNumber() {
    if (!currentStep || currentStep.type !== "number") return;
    const value = Number(inputValue);

    if (!Number.isFinite(value) || value <= 0) {
      setError("Masukkan angka yang valid.");
      return;
    }

    setError("");
    setInputValue("");
    addMessages({ from: "user", text: `${value}${currentStep.suffix ? ` ${currentStep.suffix}` : ""}` });

    const nextAnswers = { ...answers, [currentStep.answerKey]: value };
    updateAnswer(currentStep.answerKey, value);

    if (currentStep.answerKey === "gestationalAge") {
      moveTo("bpKnown", "Apakah Ibu mengetahui tekanan darah terakhir?");
      return;
    }

    if (currentStep.answerKey === "systolic") {
      moveTo("diastolic", "Berapa angka bawahnya? Ini biasa disebut diastolik.");
      return;
    }

    if (currentStep.answerKey === "diastolic") {
      if (isEmergencySnapshot(nextAnswers)) {
        moveTo(
          "seizure",
          "Tekanan darah Ibu termasuk sangat tinggi. Saya perlu cek tanda bahaya dulu agar rekomendasinya tepat. Apakah Ibu mengalami kejang atau hampir pingsan?",
        );
        return;
      }

      moveTo("headache", "Apakah Ibu mengalami sakit kepala berat yang tidak biasa?");
    }
  }

  function handleChoice(choice) {
    setError("");
    addMessages({ from: "user", text: choice.label });

    if (stepId === "bpKnown") {
      if (choice.value === "yes") {
        moveTo("systolic", "Berapa angka atasnya? Ini biasa disebut sistolik.");
      } else {
        updateAnswer("systolic", 0);
        updateAnswer("diastolic", 0);
        moveTo("headache", "Tidak apa-apa. Kita lanjut dari gejala dulu. Apakah Ibu mengalami sakit kepala berat yang tidak biasa?");
      }
      return;
    }

    if (choice.symptom && choice.value === "yes") {
      appendAnswer("symptoms", choice.symptom);
    }

    if (choice.factor && choice.value === "yes") {
      appendAnswer("riskFactors", choice.factor);
    }

    const nextAnswers = {
      ...answers,
      symptoms: choice.symptom && choice.value === "yes"
        ? [...new Set([...answers.symptoms, choice.symptom])]
        : answers.symptoms,
      riskFactors: choice.factor && choice.value === "yes"
        ? [...new Set([...answers.riskFactors, choice.factor])]
        : answers.riskFactors,
      customAnswers: choice.customAnswer
        ? [
          ...answers.customAnswers.filter((item) => item.questionId !== choice.customAnswer.questionId),
          choice.customAnswer,
        ]
        : answers.customAnswers,
      ancStatus: stepId === "ancStatus" ? choice.value : answers.ancStatus,
    };

    if (choice.customAnswer) {
      appendCustomAnswer(choice.customAnswer);
      const currentCustomIndex = Number(stepId.split(":")[1]);
      const nextCustomIndex = currentCustomIndex + 1;

      if (customQuestions[nextCustomIndex]) {
        moveTo(`custom:${nextCustomIndex}`, customQuestions[nextCustomIndex].question_text);
      } else {
        moveTo("ancStatus", "Terakhir, bagaimana pemeriksaan kehamilan atau ANC Ibu?");
      }
      return;
    }

    if (stepId === "seizure" && choice.value === "yes") {
      moveTo("complete", "Kejang adalah tanda bahaya. Data sudah cukup untuk memberi rekomendasi segera.");
      setTimeout(() => completeScreening(nextAnswers), 250);
      return;
    }

    if (stepId === "ancStatus") {
      updateAnswer("ancStatus", choice.value);
      moveTo("complete", "Terima kasih. Data sudah cukup, saya simpulkan hasil skriningnya sekarang.");
      setTimeout(() => completeScreening(nextAnswers), 250);
      return;
    }

    const nextStepId = currentStep.next(choice.value, nextAnswers);

    if (nextStepId === "complete") {
      moveTo("complete", "Terima kasih. Data sudah cukup, saya simpulkan hasil skriningnya sekarang.");
      setTimeout(() => completeScreening(nextAnswers), 250);
      return;
    }

    if (nextStepId === "customQuestions") {
      if (customQuestions.length) {
        moveTo("custom:0", customQuestions[0].question_text);
      } else {
        moveTo("ancStatus", "Terakhir, bagaimana pemeriksaan kehamilan atau ANC Ibu?");
      }
      return;
    }

    const nextStep = getScreeningStep(nextStepId);
    moveTo(nextStepId, nextStep.question);
  }

  async function completeScreening(finalAnswers = answers) {
    setLoading(true);
    setError("");
    try {
      const started = await api.request("/screening/start", { method: "POST", body: "{}" });
      const completed = await api.request("/screening/complete", {
        method: "POST",
        body: JSON.stringify({ sessionId: started.session.id, answers: finalAnswers }),
      });
      setResult(completed.assessment);
      addMessages({
        from: "bot",
        text: `Hasil skrining Ibu adalah ${riskCopy[completed.assessment.risk_category].label}. ${completed.assessment.triage_recommendation}`,
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="screen-layout">
      <div className="content-header">
        <div>
          <span className="eyebrow"><MessageCircle size={16} /> Chatbot Skrining</span>
          <h2>Skrining risiko preeklamsia</h2>
          <p>PrestiBot akan bertanya satu per satu dan menyesuaikan pertanyaan berdasarkan jawaban Ibu.</p>
        </div>
      </div>

      <div className="chat-screen">
        <div className="chat-column">
          <div className="conversation-log">
            {messages.map((message, index) => (
              <ChatBubble key={`${message.from}-${index}`} bot={message.from === "bot"}>{message.text}</ChatBubble>
            ))}
            {loading && <ChatBubble bot>Mohon tunggu, saya sedang menghitung risiko...</ChatBubble>}
            <div ref={chatEndRef} />
          </div>

          {!result && currentStep?.type === "number" && (
            <div className="chat-composer">
              <label>
                <span>{currentStep.inputLabel}</span>
                <input
                  type="number"
                  min="1"
                  inputMode="numeric"
                  value={inputValue}
                  placeholder={currentStep.placeholder}
                  onChange={(event) => setInputValue(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") submitNumber();
                  }}
                />
              </label>
              <button className="primary-button" onClick={submitNumber}>Kirim</button>
            </div>
          )}

          {!result && currentStep?.type === "choice" && (
            <div className="choice-grid">
              {currentStep.choices.map((choice) => (
                <button key={choice.label} onClick={() => handleChoice(choice)}>{choice.label}</button>
              ))}
            </div>
          )}

          {error && <div className="error-banner">{error}</div>}
          {result && (
            <button
              className="secondary-button"
              onClick={() => {
                setAnswers({ gestationalAge: null, systolic: null, diastolic: null, symptoms: [], riskFactors: [], customAnswers: [], ancStatus: "unknown" });
                setMessages([
                  {
                    from: "bot",
                    text: "Halo, saya PrestiBot. Saya akan bertanya pelan-pelan untuk membantu menilai risiko awal preeklamsia. Hasil ini bukan diagnosis, tapi bisa membantu menentukan apakah perlu segera diperiksa.",
                  },
                  { from: "bot", text: "Pertama, berapa usia kehamilan Ibu saat ini dalam minggu?" },
                ]);
                setStepId("gestationalAge");
                setInputValue("");
                setResult(null);
                setError("");
              }}
            >
              Mulai Skrining Baru
            </button>
          )}
        </div>

        <aside className="result-panel">
          {result ? <RiskResult assessment={result} /> : <EmptyResult />}
        </aside>
      </div>
    </section>
  );
}

function Dashboard({ api }) {
  const [patients, setPatients] = useState([]);
  const [selected, setSelected] = useState(null);
  const [validation, setValidation] = useState({ clinicalRiskCategory: "moderate", isMatch: true, notes: "" });
  const [message, setMessage] = useState("");

  useEffect(() => {
    api.request("/dashboard/patients").then((data) => {
      setPatients(data.patients);
      setSelected(data.patients[0] || null);
    });
  }, [api]);

  async function submitValidation() {
    if (!selected?.assessment_id) return;
    await api.request("/validation/submit", {
      method: "POST",
      body: JSON.stringify({ assessmentId: selected.assessment_id, ...validation }),
    });
    setMessage("Validasi klinis tersimpan.");
  }

  async function exportCsv() {
    const csv = await api.request("/reports/export", { headers: { Accept: "text/csv" } });
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "prestibot-report.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  const counts = patients.reduce((acc, patient) => {
    acc[patient.risk_category || "none"] = (acc[patient.risk_category || "none"] || 0) + 1;
    return acc;
  }, {});

  return (
    <section className="dashboard-layout">
      <div className="content-header row">
        <div>
          <span className="eyebrow"><Stethoscope size={16} /> Dashboard Klinis</span>
          <h2>Prioritas pemantauan ibu hamil</h2>
          <p>Daftar diurutkan berdasarkan kategori triase terbaru.</p>
        </div>
        <button className="secondary-button" onClick={exportCsv}><Download size={18} /> Export CSV</button>
      </div>

      <div className="metric-grid">
        <Metric label="Darurat" value={counts.emergency || 0} tone="danger" />
        <Metric label="Risiko Tinggi" value={counts.high || 0} tone="warning" />
        <Metric label="Sedang" value={counts.moderate || 0} tone="caution" />
        <Metric label="Rendah" value={counts.low || 0} tone="safe" />
      </div>

      <div className="dashboard-grid">
        <div className="patient-list">
          {patients.map((patient) => (
            <button
              key={patient.mother_id}
              className={`patient-row ${selected?.mother_id === patient.mother_id ? "selected" : ""}`}
              onClick={() => {
                setSelected(patient);
                setMessage("");
              }}
            >
              <span className={`risk-dot ${riskCopy[patient.risk_category]?.className || ""}`} />
              <div>
                <strong>{patient.name}</strong>
                <span>{patient.gestational_age || "-"} minggu · {patient.phone}</span>
              </div>
              <RiskPill category={patient.risk_category} />
            </button>
          ))}
        </div>

        <div className="clinical-detail">
          {selected ? (
            <>
              <div className="detail-top">
                <div>
                  <h3>{selected.name}</h3>
                  <p>{selected.address || "Alamat belum diisi"}</p>
                </div>
                <RiskPill category={selected.risk_category} />
              </div>
              <div className="detail-grid">
                <Info label="Usia kehamilan" value={`${selected.gestational_age || "-"} minggu`} />
                <Info label="Gravida/paritas" value={selected.gravida_parity || "-"} />
                <Info label="Skor AI" value={selected.risk_score ? Number(selected.risk_score).toFixed(2) : "-"} />
                <Info label="Validasi" value={selected.clinical_risk_category || "Belum divalidasi"} />
              </div>
              <div className="clinical-note">
                <strong>Rekomendasi triase</strong>
                <p>{selected.triage_recommendation || "Belum ada skrining selesai."}</p>
              </div>
              <div className="clinical-note">
                <strong>Penjelasan AI</strong>
                <p>{selected.explanation || "Belum ada penjelasan."}</p>
              </div>
              {selected.assessment_id && (
                <div className="validation-box">
                  <h4>Validasi klinis</h4>
                  <select value={validation.clinicalRiskCategory} onChange={(event) => setValidation({ ...validation, clinicalRiskCategory: event.target.value })}>
                    <option value="low">Risiko rendah</option>
                    <option value="moderate">Risiko sedang</option>
                    <option value="high">Risiko tinggi</option>
                    <option value="emergency">Darurat</option>
                  </select>
                  <label className="checkbox-line">
                    <input type="checkbox" checked={validation.isMatch} onChange={(event) => setValidation({ ...validation, isMatch: event.target.checked })} />
                    Sesuai dengan penilaian klinis
                  </label>
                  <textarea placeholder="Catatan tindak lanjut" value={validation.notes} onChange={(event) => setValidation({ ...validation, notes: event.target.value })} />
                  <button className="primary-button" onClick={submitValidation}>Simpan Validasi</button>
                  {message && <div className="success-banner">{message}</div>}
                </div>
              )}
            </>
          ) : (
            <EmptyResult />
          )}
        </div>
      </div>
    </section>
  );
}

function QuestionManager({ api }) {
  const emptyForm = {
    id: "",
    questionText: "",
    yesLabel: "Ya",
    noLabel: "Tidak",
    yesWeight: 0.08,
    noWeight: 0,
    sortOrder: 100,
    isActive: true,
  };
  const [questions, setQuestions] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function loadQuestions() {
    const data = await api.request("/admin/screening-questions");
    setQuestions(data.questions || []);
  }

  useEffect(() => {
    loadQuestions().catch((err) => setError(err.message));
  }, [api]);

  async function submitQuestion(event) {
    event.preventDefault();
    setError("");
    setMessage("");

    try {
      const payload = {
        questionText: form.questionText,
        yesLabel: form.yesLabel,
        noLabel: form.noLabel,
        yesWeight: Number(form.yesWeight),
        noWeight: Number(form.noWeight),
        sortOrder: Number(form.sortOrder),
        isActive: form.isActive,
      };
      const path = form.id ? `/admin/screening-questions/${form.id}` : "/admin/screening-questions";
      await api.request(path, {
        method: form.id ? "PUT" : "POST",
        body: JSON.stringify(payload),
      });
      setForm(emptyForm);
      setMessage(form.id ? "Pertanyaan berhasil diperbarui." : "Pertanyaan berhasil ditambahkan.");
      await loadQuestions();
    } catch (err) {
      setError(err.message);
    }
  }

  function editQuestion(question) {
    setForm({
      id: question.id,
      questionText: question.question_text,
      yesLabel: question.yes_label,
      noLabel: question.no_label,
      yesWeight: Number(question.yes_weight),
      noWeight: Number(question.no_weight),
      sortOrder: question.sort_order,
      isActive: question.is_active,
    });
    setMessage("");
    setError("");
  }

  async function toggleQuestion(question) {
    setError("");
    setMessage("");
    try {
      await api.request(`/admin/screening-questions/${question.id}`, {
        method: "PUT",
        body: JSON.stringify({
          questionText: question.question_text,
          yesLabel: question.yes_label,
          noLabel: question.no_label,
          yesWeight: Number(question.yes_weight),
          noWeight: Number(question.no_weight),
          sortOrder: question.sort_order,
          isActive: !question.is_active,
        }),
      });
      await loadQuestions();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <section>
      <div className="content-header">
        <span className="eyebrow"><SlidersHorizontal size={16} /> Admin Skrining</span>
        <h2>Kelola pertanyaan dan bobot</h2>
        <p>Pertanyaan aktif akan muncul di chat skrining setelah pertanyaan risiko dasar. Bobot positif menaikkan skor risiko.</p>
      </div>

      <div className="question-admin-grid">
        <form className="question-form" onSubmit={submitQuestion}>
          <h3>{form.id ? "Edit pertanyaan" : "Tambah pertanyaan"}</h3>
          <Field
            label="Pertanyaan"
            value={form.questionText}
            onChange={(questionText) => setForm({ ...form, questionText })}
          />
          <div className="two-column">
            <Field label="Label jawaban Ya" value={form.yesLabel} onChange={(yesLabel) => setForm({ ...form, yesLabel })} />
            <Field label="Label jawaban Tidak" value={form.noLabel} onChange={(noLabel) => setForm({ ...form, noLabel })} />
          </div>
          <div className="two-column">
            <Field label="Bobot Ya" type="number" step="0.01" value={form.yesWeight} onChange={(yesWeight) => setForm({ ...form, yesWeight })} />
            <Field label="Bobot Tidak" type="number" step="0.01" value={form.noWeight} onChange={(noWeight) => setForm({ ...form, noWeight })} />
          </div>
          <Field label="Urutan" type="number" value={form.sortOrder} onChange={(sortOrder) => setForm({ ...form, sortOrder })} />
          <label className="checkbox-line">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(event) => setForm({ ...form, isActive: event.target.checked })}
            />
            Aktif di skrining
          </label>
          {error && <div className="error-banner">{error}</div>}
          {message && <div className="success-banner">{message}</div>}
          <div className="form-actions">
            <button className="primary-button" type="submit"><Plus size={18} /> {form.id ? "Simpan" : "Tambah"}</button>
            {form.id && <button className="secondary-button" type="button" onClick={() => setForm(emptyForm)}>Batal</button>}
          </div>
        </form>

        <div className="question-list">
          {questions.map((question) => (
            <article className="question-row" key={question.id}>
              <div>
                <div className="question-title">
                  <strong>{question.question_text}</strong>
                  <span className={`status-chip ${question.is_active ? "active" : ""}`}>{question.is_active ? "Aktif" : "Nonaktif"}</span>
                </div>
                <p>
                  {question.yes_label}: +{Number(question.yes_weight).toFixed(3)} · {question.no_label}: +{Number(question.no_weight).toFixed(3)} · Urutan {question.sort_order}
                </p>
              </div>
              <div className="row-actions">
                <button className="secondary-button" onClick={() => editQuestion(question)}>Edit</button>
                <button className="secondary-button" onClick={() => toggleQuestion(question)}>
                  {question.is_active ? "Nonaktifkan" : "Aktifkan"}
                </button>
              </div>
            </article>
          ))}
          {!questions.length && (
            <div className="empty-result compact">
              <SlidersHorizontal size={36} />
              <h3>Belum ada pertanyaan tambahan</h3>
              <p>Tambahkan pertanyaan untuk memperkaya skrining dan memberi bobot risiko khusus.</p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function History({ api }) {
  const [history, setHistory] = useState([]);

  useEffect(() => {
    api.request("/screening/history").then((data) => setHistory(data.history));
  }, [api]);

  return (
    <section>
      <div className="content-header">
        <span className="eyebrow"><Activity size={16} /> Riwayat</span>
        <h2>Riwayat skrining pribadi</h2>
        <p>Gunakan riwayat ini saat konsultasi dengan bidan atau dokter.</p>
      </div>
      <div className="history-list">
        {history.map((item) => (
          <article key={item.session_id} className="history-item">
            <div>
              <strong>{new Date(item.created_at).toLocaleString("id-ID")}</strong>
              <p>{item.explanation || "Sesi belum selesai."}</p>
            </div>
            <RiskPill category={item.risk_category} />
          </article>
        ))}
      </div>
    </section>
  );
}

function Education({ api }) {
  const [resources, setResources] = useState([]);

  useEffect(() => {
    api.request("/resources").then((data) => setResources(data.resources));
  }, [api]);

  return (
    <section>
      <div className="content-header">
        <span className="eyebrow"><BookOpen size={16} /> Edukasi</span>
        <h2>Panduan singkat preeklamsia</h2>
        <p>Materi edukasi ringkas untuk ibu hamil dan tenaga kesehatan.</p>
      </div>
      <div className="resource-grid">
        {resources.map((item) => (
          <article className="resource-card" key={item.title}>
            <span>{item.category}</span>
            <h3>{item.title}</h3>
            <p>{item.body}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function Field({ label, value, onChange, type = "text", step }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input type={type} step={step} value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function NumberPair({ first, second, onFirst, onSecond }) {
  return (
    <div className="number-pair">
      <label>
        <span>{first.label}</span>
        <input type="number" value={first.value} onChange={(event) => onFirst(Number(event.target.value))} />
        <small>{first.suffix}</small>
      </label>
      {second && (
        <label>
          <span>{second.label}</span>
          <input type="number" value={second.value} onChange={(event) => onSecond(Number(event.target.value))} />
          <small>{second.suffix}</small>
        </label>
      )}
    </div>
  );
}

function ChoiceGrid({ options, selected, onToggle }) {
  return (
    <div className="choice-grid">
      {options.map(([value, label]) => (
        <button key={value} className={selected.includes(value) ? "selected" : ""} onClick={() => onToggle(value)}>
          {label}
        </button>
      ))}
    </div>
  );
}

function ChatBubble({ bot, children }) {
  return <div className={`chat-bubble ${bot ? "bot" : "user"}`}>{children}</div>;
}

function RiskResult({ assessment }) {
  const copy = riskCopy[assessment.risk_category];
  return (
    <div className={`risk-card ${copy.className}`}>
      <div className="risk-card-header">
        {assessment.risk_category === "emergency" ? <AlertTriangle size={28} /> : <CheckCircle2 size={28} />}
        <div>
          <span>Hasil Skrining</span>
          <h3>{copy.label}</h3>
        </div>
      </div>
      <div className="score-ring">
        <strong>{Math.round(Number(assessment.risk_score) * 100)}%</strong>
        <span>skor risiko</span>
      </div>
      <p>{assessment.explanation}</p>
      <div className="triage-box">
        <strong>Rekomendasi</strong>
        <p>{assessment.triage_recommendation}</p>
      </div>
    </div>
  );
}

function EmptyResult() {
  return (
    <div className="empty-result">
      <Baby size={42} />
      <h3>Belum ada hasil</h3>
      <p>Lengkapi skrining untuk melihat kategori risiko dan rekomendasi triase.</p>
    </div>
  );
}

function RiskPill({ category }) {
  if (!category) return <span className="risk-pill">Belum skrining</span>;
  const copy = riskCopy[category];
  return <span className={`risk-pill ${copy.className}`}>{copy.label}</span>;
}

function Metric({ label, value, tone }) {
  return (
    <div className={`metric ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function Info({ label, value }) {
  return (
    <div className="info">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function roleLabel(role) {
  return {
    mother: "Ibu hamil",
    health_worker: "Bidan/Admin",
    doctor: "Bidan/Admin",
    admin: "Bidan/Admin",
  }[role];
}

createRoot(document.getElementById("root")).render(<App />);
