# PrestiBot

PrestiBot adalah aplikasi web responsive untuk skrining dini risiko preeklamsia, triase rujukan, dashboard tenaga kesehatan, validasi klinis, edukasi, dan export laporan penelitian.

## Jalankan Lokal

1. Install dependency:

```bash
npm install
```

2. Salin konfigurasi:

```bash
cp .env.example .env
```

Opsional untuk daftar dengan Google: isi `GOOGLE_CLIENT_ID` di `.env` memakai OAuth Client ID dari Google Cloud Console. Tambahkan `http://localhost:5173` ke Authorized JavaScript origins, lalu restart backend.

3. Siapkan Postgres khusus proyek:

```bash
npm run db:init
npm run db:setup
```

4. Jalankan frontend dan backend:

```bash
npm run dev
```

Frontend berjalan di `http://localhost:5173`, backend di `http://localhost:4000`.

## Akun Demo

- Ibu hamil: `sari@example.com` / `password123`
- Bidan/Admin: `bidan@example.com` / `password123`
- Admin opsional: `admin@example.com` / `password123`

## Fitur

- Registrasi dan login berbasis JWT dan role.
- Profil ibu hamil.
- Chatbot skrining tekanan darah, gejala, faktor risiko, dan ANC.
- Klasifikasi risiko rule-based dengan penjelasan transparan.
- Dashboard klinis dengan prioritas risiko.
- Validasi dokter/nakes.
- Edukasi tanda bahaya preeklamsia.
- Export CSV laporan skrining.
