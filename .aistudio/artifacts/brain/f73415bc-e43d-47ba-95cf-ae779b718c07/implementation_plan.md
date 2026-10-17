# Rencana Implementasi: Otomatisasi Email Konfirmasi Reservasi via Gmail SMTP (Nodemailer)

## 1. Arsitektur Alur Notifikasi Email
Begitu pembayaran dinyatakan **Settlement / Berhasil** (baik lewat Webhook Midtrans maupun Callback resmi Midtrans Snap):

```
                     [Pembayaran Berhasil di Midtrans]
                                    │
                                    ▼
                      [Backend `server.ts` Verifikasi]
                                    │
              ┌─────────────────────┴─────────────────────┐
              ▼                                           ▼
   [Email 1: Ke Pelanggan]                    [Email 2: Ke Admin Hoola Holiday]
- Judul: E-Voucher Resmi Reservasi          - Judul: NOTIFIKASI BOOKING BARU (DP/Lunas)
- E-Voucher digital berformat HTML rapi     - Rincian lengkap pemesan (Nama, Email, WA)
- Kode Booking, Tanggal, Sisa Bayar         - Armada / Tur yang dipesan
- Panduan penjemputan di Bali               - Tombol cepat: "Hubungi Tamu via WhatsApp"
```

---

## 2. Rincian Desain Email (HTML Template Mewah & Profesional)

### A. Email untuk Pelanggan (Customer E-Voucher):
- **Branding Hoola Holiday Bali** (Gold & Emerald Luxury Theme).
- **Badge Status**: "PEMBAYARAN DP 30% TERVERIFIKASI" atau "LUNAS 100%".
- **Kartu Rincian**:
  - Kode Booking Unik (misal `HL-RENT-XXXX` / `HL-TOUR-XXXX`).
  - Item: Nama Mobil / Paket Tur + Pilihan Supir / Addon.
  - Tanggal Pemakaian & Lokasi Antar/Jemput (Bandara Ngurah Rai / Hotel).
  - Rincian Keuangan: Total Biaya, Nominal yang Sudah Dibayar, dan **Sisa Pelunasan di Lokasi**.
- **Catatan Operasional**: Tim Hoola Holiday akan segera menghubungi nomor WhatsApp Anda untuk konfirmasi nomor penerbangan dan plat mobil.

### B. Email untuk Tim Operasional Hoola Holiday Bali (`hoolaholidaybali@gmail.com` / Email Admin):
- **Notifikasi Aksi Cepat**: Detail tamu siap follow-up.
- **Data Tamu**: Nama Lengkap, Nomor WhatsApp aktif (bisa langsung diklik buka WhatsApp Web/App), Email, Lokasi Penjemputan, dan Catatan Khusus.
- **Status Pembayaran**: Nominal DP masuk via Midtrans (BCA VA / QRIS / CC).

---

## 3. Komponen Teknis yang Akan Ditambahkan:
1. **Instalasi Package**: `nodemailer` dan `@types/nodemailer`.
2. **Konfigurasi Environment (`.env.example` & `.env`)**:
   - `SMTP_USER`: Email Gmail pengirim (misal `hoolaholidaybali@gmail.com`).
   - `SMTP_PASS`: 16 karakter Google App Password (bukan password login biasa).
   - `ADMIN_EMAIL`: Email admin penerima notifikasi order baru.
3. **Modul Email Service (`server/emailService.ts` atau langsung di `server.ts`)**:
   - Fungsi `sendBookingConfirmationEmails(transaction)` yang mengirimkan kedua email secara asynchronous tanpa menghambat respons webhook/API.
4. **Trigger Otomatis**:
   - Dipanggil saat Webhook Midtrans menerima `transaction_status === 'settlement' | 'capture'`.
   - Juga dipanggil saat callback verifikasi pembayaran selesai di modal booking / sewa kendaraan.

---

## 4. Keamanan & Keandalan:
- Jika SMTP belum dikonfigurasi / password salah, sistem tidak akan crash (menggunakan `try/catch` dengan logging jelas) dan transaksi tetap tersimpan dengan aman.
- Mendukung mode preview / simulation agar kita bisa menguji format email tanpa membocorkan kredensial.
