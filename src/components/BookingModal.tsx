import React, { useState, useEffect } from 'react';
import {
  X, Check, Calendar, Users, ArrowRight, ArrowLeft, ShieldCheck,
  Sparkles, Printer, AlertTriangle, Loader2, CheckCircle2,
  Percent, Lock, ExternalLink, Phone, Mail, User, Clock, MapPin,
  ChevronLeft, ChevronRight, Car
} from 'lucide-react';
import { BookingDetails } from '../types';
import { EXPERIENCES, BOOKING_ADDONS } from '../data';
import {
  fetchPaymentConfig,
  createTransactionSession,
  openMidtransSnap,
  triggerSendConfirmationEmail,
  verifyPaymentStatus,
  ensureSnapScriptLoaded,
  PaymentConfig,
  TransactionResponse,
} from '../services/paymentService';

interface BookingModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialExperienceId?: string;
  onBookingSuccess: (booking: BookingDetails) => void;
}

type BookingStep = 'date' | 'guest_info' | 'payment' | 'processing' | 'success';

const INDO_MONTHS = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
];

const INDO_DAY_NAMES = ['MIN', 'SEN', 'SEL', 'RAB', 'KAM', 'JUM', 'SAB'];

const INDO_SHORT_DAYS = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
const INDO_SHORT_MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun',
  'Jul', 'Agt', 'Sep', 'Okt', 'Nov', 'Des'
];

export default function BookingModal({
  isOpen,
  onClose,
  initialExperienceId,
  onBookingSuccess,
}: BookingModalProps) {
  // Step state: 'date' | 'guest_info' | 'payment' | 'processing' | 'success'
  const [step, setStep] = useState<BookingStep>('date');

  // Booking fields state
  const [selectedExpId, setSelectedExpId] = useState(initialExperienceId || EXPERIENCES[0].id);

  // Default to tomorrow
  const getInitialDate = () => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().split('T')[0];
  };

  const [date, setDate] = useState(getInitialDate());
  const [guests, setGuests] = useState(2);
  const [selectedAddons, setSelectedAddons] = useState<string[]>([]);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [specialNotes, setSpecialNotes] = useState('');

  // Interactive Calendar State (Month & Year navigation)
  const initialDateObj = new Date(date || Date.now());
  const [calendarYear, setCalendarYear] = useState<number>(initialDateObj.getFullYear());
  const [calendarMonth, setCalendarMonth] = useState<number>(initialDateObj.getMonth());

  // Blocked Dates Warning
  const [dateWarning, setDateWarning] = useState<string | null>(null);

  // Payment & Down Payment (DP) State
  const [paymentType, setPaymentType] = useState<'dp' | 'full'>('dp');
  const [dpPercentage, setDpPercentage] = useState<number>(30);
  const [paymentConfig, setPaymentConfig] = useState<PaymentConfig | null>(null);
  const [isProcessingMidtrans, setIsProcessingMidtrans] = useState<boolean>(false);
  const [midtransError, setMidtransError] = useState<string | null>(null);

  // Confirmed booking state
  const [confirmedBooking, setConfirmedBooking] = useState<any>(null);

  // Load Midtrans config from backend & ensure snap script loaded
  useEffect(() => {
    fetchPaymentConfig().then((cfg) => {
      setPaymentConfig(cfg);
      if (cfg.defaultDpPercentage) {
        setDpPercentage(cfg.defaultDpPercentage);
      }
    });
    ensureSnapScriptLoaded().catch(console.warn);
  }, []);

  // Sync initial experience ID
  useEffect(() => {
    if (initialExperienceId) {
      setSelectedExpId(initialExperienceId);
    }
  }, [initialExperienceId, isOpen]);

  // Sync calendar view when date changes
  useEffect(() => {
    if (date) {
      const parts = date.split('-');
      if (parts.length === 3) {
        const y = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10) - 1;
        if (!isNaN(y) && !isNaN(m)) {
          setCalendarYear(y);
          setCalendarMonth(m);
        }
      }
    }
  }, [isOpen]);

  // Check for fully booked dates
  useEffect(() => {
    if (!date) {
      setDateWarning(null);
      return;
    }
    const selectedDate = new Date(date);
    const dayOfWeek = selectedDate.getDay();

    if (dayOfWeek === 1) {
      setDateWarning('⚠️ Hari Senin adalah jadwal pemeliharaan berkala yacht & area konservasi. Silakan pilih tanggal lain.');
      return;
    }

    const month = selectedDate.getMonth() + 1;
    const day = selectedDate.getDate();
    const year = selectedDate.getFullYear();

    if (year === 2026 && month === 7 && (day === 12 || day === 15 || day === 20)) {
      setDateWarning('⚠️ Tanggal ini sudah dipesan penuh oleh rombongan VIP. Silakan pilih tanggal lain.');
      return;
    }

    setDateWarning(null);
  }, [date]);

  if (!isOpen) return null;

  const currentExp = EXPERIENCES.find((e) => e.id === selectedExpId) || EXPERIENCES[0];

  // Price calculations
  const usdToIdr = paymentConfig?.usdToIdrRate || 16000;
  const basePriceUSD = currentExp.pricePerPerson * guests;
  const addonsPriceUSD = BOOKING_ADDONS.filter((addon) => selectedAddons.includes(addon.id)).reduce(
    (total, addon) => total + addon.price,
    0
  );
  const subtotalUSD = basePriceUSD + addonsPriceUSD;
  const taxUSD = Math.round(subtotalUSD * 0.1);
  const grandTotalUSD = subtotalUSD + taxUSD;
  const grandTotalIDR = grandTotalUSD * usdToIdr;

  // DP Calculations
  const dpAmountUSD = Math.round((grandTotalUSD * dpPercentage) / 100);
  const dpAmountIDR = Math.round((grandTotalIDR * dpPercentage) / 100);
  const remainingBalanceUSD = grandTotalUSD - dpAmountUSD;
  const remainingBalanceIDR = grandTotalIDR - dpAmountIDR;

  const amountToPayUSD = paymentType === 'dp' ? dpAmountUSD : grandTotalUSD;
  const amountToPayIDR = paymentType === 'dp' ? dpAmountIDR : grandTotalIDR;

  // Format date display like the screenshot: "Min, 18 Okt 2026"
  const formatSidebarDate = (dateStr: string) => {
    if (!dateStr) return '-';
    try {
      const [y, m, d] = dateStr.split('-').map(Number);
      const dt = new Date(y, m - 1, d);
      const dayName = INDO_SHORT_DAYS[dt.getDay()];
      const monthName = INDO_SHORT_MONTHS[dt.getMonth()];
      return `${dayName}, ${d} ${monthName} ${y}`;
    } catch {
      return dateStr;
    }
  };

  // Full formal Indonesian date
  const formatFullDate = (dateStr: string) => {
    if (!dateStr) return '-';
    try {
      const [y, m, d] = dateStr.split('-').map(Number);
      const dt = new Date(y, m - 1, d);
      return `${INDO_SHORT_DAYS[dt.getDay()]}, ${d} ${INDO_MONTHS[dt.getMonth()]} ${y}`;
    } catch {
      return dateStr;
    }
  };

  // Calendar Navigation
  const handlePrevMonth = () => {
    if (calendarMonth === 0) {
      setCalendarMonth(11);
      setCalendarYear((prev) => prev - 1);
    } else {
      setCalendarMonth((prev) => prev - 1);
    }
  };

  const handleNextMonth = () => {
    if (calendarMonth === 11) {
      setCalendarMonth(0);
      setCalendarYear((prev) => prev + 1);
    } else {
      setCalendarMonth((prev) => prev + 1);
    }
  };

  // Calendar Days Grid Generation
  const generateCalendarDays = () => {
    const firstDayIndex = new Date(calendarYear, calendarMonth, 1).getDay(); // 0 is Sunday
    const daysInCurrentMonth = new Date(calendarYear, calendarMonth + 1, 0).getDate();

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    const days: Array<{
      dayNum: number | null;
      dateStr: string;
      isPast: boolean;
      isSelected: boolean;
      isToday: boolean;
      isSunday: boolean;
    }> = [];

    // Blank cells before first day
    for (let i = 0; i < firstDayIndex; i++) {
      days.push({
        dayNum: null,
        dateStr: '',
        isPast: true,
        isSelected: false,
        isToday: false,
        isSunday: i === 0,
      });
    }

    // Days in current month
    for (let d = 1; d <= daysInCurrentMonth; d++) {
      const dateStr = `${calendarYear}-${String(calendarMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const dayDate = new Date(calendarYear, calendarMonth, d);
      dayDate.setHours(0, 0, 0, 0);

      const isPast = dayDate < today;
      const isSelected = date === dateStr;
      const isToday = dateStr === todayStr;
      const isSunday = dayDate.getDay() === 0;

      days.push({
        dayNum: d,
        dateStr,
        isPast,
        isSelected,
        isToday,
        isSunday,
      });
    }

    return days;
  };

  const calendarDays = generateCalendarDays();

  // Navigation Handlers
  const handleProceedToGuests = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!date) {
      alert('Mohon tentukan tanggal perjalanan Anda terlebih dahulu.');
      return;
    }
    if (dateWarning) {
      alert('Tanggal yang Anda pilih saat ini sedang penuh. Silakan tentukan tanggal lain.');
      return;
    }
    setStep('guest_info');
  };

  const handleProceedToPayment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim()) {
      alert('Mohon isi nama lengkap pemesan.');
      return;
    }
    if (!phone.trim()) {
      alert('Mohon isi nomor telepon / WhatsApp aktif untuk konfirmasi penjemputan.');
      return;
    }
    if (!email.trim() || !email.includes('@')) {
      alert('Mohon isi alamat email yang valid.');
      return;
    }
    if (!guests || guests < 1) {
      alert('Jumlah peserta minimal 1 orang.');
      return;
    }
    setStep('payment');
  };

  // Finalize Success
  const finalizeSuccess = (session: TransactionResponse, paymentMethodLabel: string) => {
    const bookingObj = {
      id: `booking-${Date.now()}`,
      experienceId: selectedExpId,
      date,
      guests,
      addons: selectedAddons,
      fullName,
      email,
      phone,
      specialNotes,
      totalPrice: grandTotalUSD,
      totalAmountIDR: grandTotalIDR,
      amountToPayIDR: session.grossAmountIDR,
      amountPaid: session.grossAmountIDR,
      remainingBalance: session.remainingBalanceIDR,
      remainingBalanceIDR: session.remainingBalanceIDR,
      paymentType: session.paymentType,
      dpPercentage: session.dpPercentage,
      bookingCode: session.orderId || `HHB-DP-${Date.now().toString().slice(-6)}`,
      paymentMethod: paymentMethodLabel,
      paymentStatus: session.paymentType === 'dp' ? 'DP_PAID' : 'SETTLEMENT',
      createdAt: new Date().toISOString(),
      snapToken: session.snapToken,
      isSimulation: session.isSimulation,
    };

    setConfirmedBooking(bookingObj);
    triggerSendConfirmationEmail(session.orderId).catch(console.error);
    setIsProcessingMidtrans(false);
    setStep('success');
    onBookingSuccess(bookingObj as any);
  };

  // Midtrans Trigger
  const handlePayWithMidtrans = async () => {
    setIsProcessingMidtrans(true);
    setMidtransError(null);

    try {
      const session = await createTransactionSession({
        bookingType: 'tour',
        itemId: selectedExpId,
        quantity: guests,
        addons: selectedAddons,
        customer: {
          name: fullName,
          email,
          phone,
          notes: specialNotes,
        },
        paymentType,
        dpPercentage,
        startDate: date,
        specialNotes,
      });

      if (session.isSimulation) {
        setIsProcessingMidtrans(false);
        finalizeSuccess(session, 'Midtrans Sandbox Gateway (Simulasi)');
        return;
      }

      await openMidtransSnap(session.snapToken, {
        onSuccess: async (result: any) => {
          setIsProcessingMidtrans(true);
          let verifiedStatus = paymentType === 'dp' ? 'DP_PAID' : 'SETTLEMENT';
          try {
            const verifyRes = await verifyPaymentStatus(session.orderId, {
              customerName: fullName,
              customerEmail: email,
              customerPhone: phone,
              itemName: currentExp.title,
              startDate: date,
              quantity: guests,
              specialNotes: specialNotes,
            });
            if (verifyRes.success && verifyRes.record) {
              verifiedStatus = verifyRes.record.status;
            }
          } catch (vErr) {
            console.warn('Backend status check error:', vErr);
          }

          if (verifiedStatus === 'SETTLEMENT' || verifiedStatus === 'DP_PAID') {
            finalizeSuccess(session, `Midtrans Snap (${result?.payment_type?.toUpperCase() || 'Verified'})`);
          } else {
            finalizeSuccess(session, `Midtrans Pending (${result?.payment_type?.toUpperCase() || 'VA'})`);
          }
        },
        onPending: async (result: any) => {
          setIsProcessingMidtrans(true);
          let verifiedStatus = 'PENDING';
          try {
            const verifyRes = await verifyPaymentStatus(session.orderId);
            if (verifyRes.success && verifyRes.record) {
              verifiedStatus = verifyRes.record.status;
            }
          } catch (vErr) {
            console.warn('Pending verification check:', vErr);
          }

          if (verifiedStatus === 'SETTLEMENT' || verifiedStatus === 'DP_PAID') {
            finalizeSuccess(session, `Midtrans Snap (${result?.payment_type?.toUpperCase() || 'Verified'})`);
          } else {
            finalizeSuccess(session, `Midtrans Pending (${result?.payment_type?.toUpperCase() || 'VA'})`);
          }
        },
        onError: (err: any) => {
          setIsProcessingMidtrans(false);
          setMidtransError('Pembayaran dibatalkan atau terjadi gangguan jaringan.');
        },
        onClose: () => {
          setIsProcessingMidtrans(false);
        },
      });
    } catch (err: any) {
      console.error('Midtrans trigger failed:', err);
      setIsProcessingMidtrans(false);
      setMidtransError(err.message || 'Gagal terhubung dengan server payment backend.');
    }
  };

  const handleAddonToggle = (addonId: string) => {
    if (selectedAddons.includes(addonId)) {
      setSelectedAddons(selectedAddons.filter((id) => id !== addonId));
    } else {
      setSelectedAddons([...selectedAddons, addonId]);
    }
  };

  const handleReset = () => {
    setStep('date');
    setDate(getInitialDate());
    setGuests(2);
    setSelectedAddons([]);
    setFullName('');
    setEmail('');
    setPhone('');
    setSpecialNotes('');
    setConfirmedBooking(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 md:p-6 overflow-y-auto bg-black/90 backdrop-blur-md animate-fade-in text-gold-100 font-sans">
      <div
        id="booking-modal-container"
        className="relative bg-neutral-950 border border-gold-400/30 w-full max-w-5xl rounded-2xl shadow-2xl overflow-hidden flex flex-col my-auto max-h-[96vh]"
      >
        {/* ==================================================================== */}
        {/* MODAL MAIN CONTENT (2-COLUMN ARCHITECTURE AS SHOWN IN SCREENSHOT) */}
        {/* ==================================================================== */}
        {step !== 'processing' && step !== 'success' ? (
          <div className="grid grid-cols-1 lg:grid-cols-12 flex-grow overflow-y-auto">
            
            {/* ------------------------------------------------------------------ */}
            {/* LEFT COLUMN: INTERACTIVE CALENDAR & FORM WORKFLOW                   */}
            {/* ------------------------------------------------------------------ */}
            <div className="lg:col-span-7 p-6 sm:p-8 flex flex-col justify-between border-b lg:border-b-0 lg:border-r border-gold-400/20 bg-neutral-950 text-left">
              <div>
                {/* Header Title Bar */}
                <div className="flex items-start justify-between pb-4 border-b border-gold-900/20">
                  <div>
                    <span className="text-[11px] font-mono uppercase tracking-[0.2em] text-gold-400 font-bold block mb-1">
                      RESERVASI PRIVATE TOUR
                    </span>
                    <h2 className="font-serif text-xl sm:text-2xl text-gold-100 font-bold tracking-wide uppercase">
                      {currentExp.title}
                    </h2>
                  </div>

                  <button
                    onClick={handleReset}
                    className="w-9 h-9 rounded-full bg-neutral-900 border border-gold-400/20 text-gold-300 hover:text-white hover:bg-neutral-800 transition-colors flex items-center justify-center cursor-pointer flex-shrink-0"
                    aria-label="Tutup"
                  >
                    <X size={18} />
                  </button>
                </div>

                {/* Stepper Tabs Bar (Exact layout as screenshot) */}
                <div className="flex items-center gap-6 pt-4 border-b border-gold-900/20 text-xs font-mono">
                  {/* Tab 1 */}
                  <button
                    type="button"
                    onClick={() => setStep('date')}
                    className={`pb-3 font-bold flex items-center gap-2 cursor-pointer transition-colors relative ${
                      step === 'date'
                        ? 'text-gold-400'
                        : 'text-gold-200/50 hover:text-gold-200'
                    }`}
                  >
                    <Calendar size={15} />
                    <span>1. Tanggal & Waktu</span>
                    {step === 'date' && (
                      <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-gold-400 rounded-full" />
                    )}
                  </button>

                  {/* Tab 2 */}
                  <button
                    type="button"
                    onClick={() => {
                      if (date) setStep('guest_info');
                    }}
                    className={`pb-3 font-bold flex items-center gap-2 transition-colors relative ${
                      step === 'guest_info'
                        ? 'text-gold-400 cursor-pointer'
                        : date
                        ? 'text-gold-200/50 hover:text-gold-200 cursor-pointer'
                        : 'text-neutral-700 cursor-not-allowed'
                    }`}
                  >
                    <Users size={15} />
                    <span>2. Data Peserta</span>
                    {step === 'guest_info' && (
                      <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-gold-400 rounded-full" />
                    )}
                  </button>

                  {/* Tab 3 */}
                  <button
                    type="button"
                    onClick={() => {
                      if (date && fullName && phone) setStep('payment');
                    }}
                    className={`pb-3 font-bold flex items-center gap-2 transition-colors relative ${
                      step === 'payment'
                        ? 'text-gold-400 cursor-pointer'
                        : date && fullName && phone
                        ? 'text-gold-200/50 hover:text-gold-200 cursor-pointer'
                        : 'text-neutral-700 cursor-not-allowed'
                    }`}
                  >
                    <Lock size={15} />
                    <span>3. Pembayaran</span>
                    {step === 'payment' && (
                      <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-gold-400 rounded-full" />
                    )}
                  </button>
                </div>

                {/* -------------------------------------------------------------- */}
                {/* TAB 1: INTERACTIVE CALENDAR VIEW (MATCHING THE SCREENSHOT)      */}
                {/* -------------------------------------------------------------- */}
                {step === 'date' && (
                  <div className="py-5 space-y-5 animate-fade-in">
                    
                    {/* Month & Year Navigation Row */}
                    <div className="flex items-center justify-between px-2">
                      <button
                        type="button"
                        onClick={handlePrevMonth}
                        className="p-2 rounded-lg bg-neutral-900 border border-gold-400/20 text-gold-300 hover:text-white hover:border-gold-400 transition-colors cursor-pointer"
                        aria-label="Bulan Sebelumnya"
                      >
                        <ChevronLeft size={18} />
                      </button>

                      <div className="text-center font-serif text-lg font-bold text-gold-200 tracking-wider">
                        {INDO_MONTHS[calendarMonth]} {calendarYear}
                      </div>

                      <button
                        type="button"
                        onClick={handleNextMonth}
                        className="p-2 rounded-lg bg-neutral-900 border border-gold-400/20 text-gold-300 hover:text-white hover:border-gold-400 transition-colors cursor-pointer"
                        aria-label="Bulan Berikutnya"
                      >
                        <ChevronRight size={18} />
                      </button>
                    </div>

                    {/* Calendar Days Table */}
                    <div className="bg-neutral-900/40 rounded-xl p-3 border border-gold-400/15">
                      {/* Day of Week Headers */}
                      <div className="grid grid-cols-7 gap-1 text-center font-mono text-[11px] font-bold pb-3 border-b border-gold-900/20">
                        {INDO_DAY_NAMES.map((dayName, idx) => (
                          <div
                            key={dayName}
                            className={idx === 0 ? 'text-gold-400 font-extrabold' : 'text-gold-200/60'}
                          >
                            {dayName}
                          </div>
                        ))}
                      </div>

                      {/* Day Cells Grid */}
                      <div className="grid grid-cols-7 gap-1 pt-3 text-center">
                        {calendarDays.map((cDay, idx) => {
                          if (cDay.dayNum === null) {
                            return <div key={`empty-${idx}`} className="h-10 sm:h-11" />;
                          }

                          const { dayNum, dateStr, isPast, isSelected, isToday, isSunday } = cDay;

                          return (
                            <button
                              key={dateStr}
                              type="button"
                              disabled={isPast}
                              onClick={() => setDate(dateStr)}
                              className={`h-10 sm:h-11 w-full rounded-xl font-mono text-sm font-semibold flex items-center justify-center transition-all cursor-pointer relative ${
                                isSelected
                                  ? 'bg-gold-400 text-neutral-950 font-bold shadow-lg shadow-gold-500/25 ring-2 ring-gold-300 scale-105 z-10'
                                  : isPast
                                  ? 'text-neutral-700 cursor-not-allowed select-none'
                                  : 'text-gold-100 hover:bg-gold-500/15 hover:text-gold-300 hover:border hover:border-gold-400/30'
                              } ${isSunday && !isSelected && !isPast ? 'text-gold-400/90' : ''}`}
                            >
                              <span>{dayNum}</span>

                              {/* Dot for today */}
                              {isToday && !isSelected && (
                                <span className="absolute bottom-1 w-1 h-1 rounded-full bg-gold-400" />
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Date Warning blockouts */}
                    {dateWarning && (
                      <div className="bg-red-950/50 border border-red-500/40 p-3.5 rounded-lg text-xs text-red-200 flex items-start gap-2.5 animate-pulse">
                        <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                        <p className="leading-relaxed">{dateWarning}</p>
                      </div>
                    )}
                  </div>
                )}

                {/* -------------------------------------------------------------- */}
                {/* TAB 2: DATA PESERTA FORM (NO KTP / PASSPORT)                    */}
                {/* -------------------------------------------------------------- */}
                {step === 'guest_info' && (
                  <form onSubmit={handleProceedToPayment} id="form-tab-guest-info" className="py-5 space-y-4 animate-fade-in">
                    
                    <div className="space-y-1">
                      <h3 className="font-serif text-lg text-gold-200 font-bold">
                        Informasi Pemesan & Penjemputan
                      </h3>
                      <p className="text-xs text-gold-200/60 font-sans">
                        Cukup isi kontak utama dan jumlah orang. Tanpa perlu mengisi data KTP / Paspor.
                      </p>
                    </div>

                    <div className="space-y-3.5 pt-2">
                      {/* Nama Lengkap */}
                      <div className="space-y-1">
                        <label className="block text-[11px] uppercase font-mono font-bold text-gold-300/80">
                          Nama Lengkap Pemesan *
                        </label>
                        <input
                          type="text"
                          required
                          placeholder="Contoh: Budi Santoso"
                          value={fullName}
                          onChange={(e) => setFullName(e.target.value)}
                          className="w-full bg-neutral-900 border border-gold-400/25 focus:border-gold-400 px-4 py-2.5 text-sm text-gold-100 rounded-lg focus:outline-none placeholder-gold-300/20 font-sans"
                        />
                      </div>

                      {/* No WhatsApp & Email */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <label className="block text-[11px] uppercase font-mono font-bold text-gold-300/80">
                            No. WhatsApp Aktif *
                          </label>
                          <input
                            type="tel"
                            required
                            placeholder="Contoh: 081234567890"
                            value={phone}
                            onChange={(e) => setPhone(e.target.value)}
                            className="w-full bg-neutral-900 border border-gold-400/25 focus:border-gold-400 px-4 py-2.5 text-sm text-gold-100 rounded-lg focus:outline-none placeholder-gold-300/20 font-mono"
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="block text-[11px] uppercase font-mono font-bold text-gold-300/80">
                            Alamat Email *
                          </label>
                          <input
                            type="email"
                            required
                            placeholder="Contoh: budi@gmail.com"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="w-full bg-neutral-900 border border-gold-400/25 focus:border-gold-400 px-4 py-2.5 text-sm text-gold-100 rounded-lg focus:outline-none placeholder-gold-300/20 font-sans"
                          />
                        </div>
                      </div>

                      {/* Jumlah Orang / Pax Counter */}
                      <div className="space-y-1">
                        <label className="block text-[11px] uppercase font-mono font-bold text-gold-300/80">
                          Jumlah Orang / Pax *
                        </label>
                        <div className="flex items-center border border-gold-400/30 rounded-lg bg-neutral-900 overflow-hidden">
                          <button
                            type="button"
                            onClick={() => setGuests(Math.max(1, guests - 1))}
                            className="px-4 py-2.5 bg-neutral-800 hover:bg-neutral-700 text-gold-300 hover:text-white font-bold font-mono transition-colors cursor-pointer"
                          >
                            -
                          </button>
                          <div className="flex-grow text-center py-2">
                            <span className="text-sm font-bold text-gold-100 font-mono">
                              {guests} Orang (Pax)
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => setGuests(Math.min(30, guests + 1))}
                            className="px-4 py-2.5 bg-neutral-800 hover:bg-neutral-700 text-gold-300 hover:text-white font-bold font-mono transition-colors cursor-pointer"
                          >
                            +
                          </button>
                        </div>
                      </div>

                      {/* Lokasi Penjemputan */}
                      <div className="space-y-1">
                        <label className="block text-[11px] uppercase font-mono font-bold text-gold-300/80">
                          Lokasi Penjemputan / Catatan Hotel (Opsional)
                        </label>
                        <input
                          type="text"
                          placeholder="Nama Hotel / Villa di Bali (e.g. Ayana Resort Jimbaran)"
                          value={specialNotes}
                          onChange={(e) => setSpecialNotes(e.target.value)}
                          className="w-full bg-neutral-900 border border-gold-400/25 focus:border-gold-400 px-4 py-2.5 text-sm text-gold-100 rounded-lg focus:outline-none placeholder-gold-300/20 font-sans"
                        />
                      </div>
                    </div>
                  </form>
                )}

                {/* -------------------------------------------------------------- */}
                {/* TAB 3: PEMBAYARAN MIDTRANS GATEWAY                              */}
                {/* -------------------------------------------------------------- */}
                {step === 'payment' && (
                  <div className="py-5 space-y-5 animate-fade-in">
                    
                    {/* Skema DP vs Full */}
                    <div className="space-y-2">
                      <span className="text-[11px] uppercase font-mono font-bold text-gold-300/80 block">
                        Pilihan Skema Pembayaran
                      </span>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div
                          onClick={() => setPaymentType('dp')}
                          className={`p-3.5 rounded-xl border cursor-pointer transition-all flex flex-col justify-between ${
                            paymentType === 'dp'
                              ? 'bg-gold-500/10 border-gold-400 ring-1 ring-gold-400'
                              : 'bg-neutral-900/60 border-gold-900/20 hover:border-gold-400/30'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-serif font-bold text-gold-200">Down Payment (DP 30%)</span>
                            {paymentType === 'dp' && <Check size={14} className="text-gold-400" />}
                          </div>
                          <p className="text-[10px] text-gold-200/60 leading-relaxed">
                            Kunci slot sekarang. Sisa 70% dilunasi santai saat dijemput di Bali.
                          </p>
                          <span className="text-xs font-mono font-bold text-gold-300 mt-2 block">
                            Rp {dpAmountIDR.toLocaleString('id-ID')}
                          </span>
                        </div>

                        <div
                          onClick={() => setPaymentType('full')}
                          className={`p-3.5 rounded-xl border cursor-pointer transition-all flex flex-col justify-between ${
                            paymentType === 'full'
                              ? 'bg-gold-500/10 border-gold-400 ring-1 ring-gold-400'
                              : 'bg-neutral-900/60 border-gold-900/20 hover:border-gold-400/30'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-serif font-bold text-gold-200">Pelunasan Penuh (100%)</span>
                            {paymentType === 'full' && <Check size={14} className="text-gold-400" />}
                          </div>
                          <p className="text-[10px] text-gold-200/60 leading-relaxed">
                            Bayar lunas tanpa perlu transaksi tambahan saat liburan di Bali.
                          </p>
                          <span className="text-xs font-mono font-bold text-gold-300 mt-2 block">
                            Rp {grandTotalIDR.toLocaleString('id-ID')}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Midtrans Snap Card */}
                    <div className="bg-neutral-900/80 border border-gold-400/30 rounded-xl p-5 space-y-4">
                      <div className="flex items-center justify-between border-b border-gold-900/20 pb-3">
                        <span className="font-serif text-sm font-bold text-gold-200">
                          Official Midtrans Snap Gateway
                        </span>
                        <span className="text-[9px] font-mono px-2 py-0.5 rounded bg-emerald-950/60 border border-emerald-500/30 text-emerald-400 font-semibold">
                          ✓ SSL 256-Bit
                        </span>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[10px] font-mono">
                        <div className="bg-neutral-950 p-2 rounded border border-gold-900/20 text-center text-gold-300 font-bold">QRIS</div>
                        <div className="bg-neutral-950 p-2 rounded border border-gold-900/20 text-center text-gold-300 font-bold">BCA VA</div>
                        <div className="bg-neutral-950 p-2 rounded border border-gold-900/20 text-center text-gold-300 font-bold">Mandiri Bill</div>
                        <div className="bg-neutral-950 p-2 rounded border border-gold-900/20 text-center text-gold-300 font-bold">Visa / Master</div>
                      </div>

                      {midtransError && (
                        <div className="p-2.5 bg-red-950/40 border border-red-500/40 text-red-300 rounded text-xs">
                          {midtransError}
                        </div>
                      )}
                    </div>

                  </div>
                )}
              </div>

              {/* Bottom Action Bar for Left Column */}
              <div className="pt-4 mt-auto">
                {step === 'date' && (
                  <button
                    type="button"
                    disabled={!date || !!dateWarning}
                    onClick={() => handleProceedToGuests()}
                    className={`w-full py-4 rounded-xl font-mono text-sm uppercase tracking-widest font-extrabold flex items-center justify-center gap-2 transition-all cursor-pointer shadow-lg ${
                      !date || dateWarning
                        ? 'bg-neutral-800 text-neutral-500 cursor-not-allowed border border-neutral-700'
                        : 'bg-gold-400 hover:bg-gold-500 text-neutral-950 shadow-gold-500/20 active:scale-95'
                    }`}
                  >
                    <span>Lanjut: Data Peserta & Kontak →</span>
                  </button>
                )}

                {step === 'guest_info' && (
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setStep('date')}
                      className="px-5 py-3.5 rounded-xl border border-neutral-700 hover:border-gold-400 text-xs font-mono uppercase tracking-wider text-neutral-300 hover:text-gold-200 transition-colors cursor-pointer flex items-center gap-2"
                    >
                      <ArrowLeft size={14} />
                      <span>Ubah Tanggal</span>
                    </button>
                    <button
                      type="button"
                      onClick={(e) => handleProceedToPayment(e as any)}
                      className="flex-grow py-3.5 rounded-xl font-mono text-xs uppercase tracking-widest font-extrabold bg-gold-400 hover:bg-gold-500 text-neutral-950 flex items-center justify-center gap-2 transition-all cursor-pointer shadow-md shadow-gold-500/10 active:scale-95"
                    >
                      <span>Lanjut ke Pembayaran →</span>
                    </button>
                  </div>
                )}

                {step === 'payment' && (
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setStep('guest_info')}
                      className="px-5 py-3.5 rounded-xl border border-neutral-700 hover:border-gold-400 text-xs font-mono uppercase tracking-wider text-neutral-300 hover:text-gold-200 transition-colors cursor-pointer flex items-center gap-2"
                    >
                      <ArrowLeft size={14} />
                      <span>Kembali</span>
                    </button>
                    <button
                      type="button"
                      disabled={isProcessingMidtrans}
                      onClick={handlePayWithMidtrans}
                      className="flex-grow py-3.5 rounded-xl font-mono text-xs uppercase tracking-widest font-extrabold bg-gold-400 hover:bg-gold-500 text-neutral-950 flex items-center justify-center gap-2 transition-all cursor-pointer shadow-lg shadow-gold-500/20 active:scale-95 disabled:opacity-50"
                    >
                      {isProcessingMidtrans ? (
                        <>
                          <Loader2 size={16} className="animate-spin" />
                          <span>Menghubungi Midtrans...</span>
                        </>
                      ) : (
                        <>
                          <Lock size={14} />
                          <span>Bayar Rp {amountToPayIDR.toLocaleString('id-ID')} via Snap</span>
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>

            </div>

            {/* ------------------------------------------------------------------ */}
            {/* RIGHT COLUMN: STICKY ORDER SUMMARY ("RINGKASAN PESANAN")           */}
            {/* Exactly structured and styled like the screenshot in image.png      */}
            {/* ------------------------------------------------------------------ */}
            <div className="lg:col-span-5 p-6 sm:p-7 bg-neutral-900/90 flex flex-col justify-between text-left space-y-6">
              <div className="space-y-4">
                
                {/* Header: RINGKASAN PESANAN */}
                <h3 className="text-xs font-mono uppercase tracking-[0.2em] text-gold-400 font-extrabold">
                  RINGKASAN PESANAN
                </h3>

                {/* Tour Banner Card Image */}
                <div className="relative rounded-xl overflow-hidden border border-gold-400/30 aspect-video shadow-md">
                  <img
                    src={currentExp.cardImage}
                    alt={currentExp.title}
                    loading="lazy"
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
                  <div className="absolute bottom-2.5 left-3 right-3 text-left">
                    <span className="text-[10px] uppercase font-mono font-semibold text-gold-300">
                      {currentExp.location}
                    </span>
                    <h4 className="font-serif text-sm text-gold-100 font-bold leading-tight">
                      {currentExp.title}
                    </h4>
                  </div>
                </div>

                {/* Specs Table List (Matching screenshot exactly) */}
                <div className="bg-neutral-950/70 border border-gold-900/20 rounded-xl p-4 space-y-2.5 text-xs font-mono">
                  <div className="flex justify-between items-center">
                    <span className="text-gold-200/50">Tanggal:</span>
                    <span className="text-gold-300 font-bold">
                      {formatSidebarDate(date)}
                    </span>
                  </div>

                  <div className="flex justify-between items-center">
                    <span className="text-gold-200/50">Peserta:</span>
                    <span className="text-gold-100 font-bold">
                      {guests} Orang
                    </span>
                  </div>

                  <div className="flex justify-between items-center">
                    <span className="text-gold-200/50">Mobil Privat:</span>
                    <span className="text-gold-100 font-bold">
                      1 Mobil AC VIP
                    </span>
                  </div>

                  <div className="flex justify-between items-center">
                    <span className="text-gold-200/50">Durasi:</span>
                    <span className="text-gold-100 font-bold">
                      {currentExp.duration || 'Hingga 10 Jam (Full Day)'}
                    </span>
                  </div>
                </div>

                {/* Green Inclusion Box (Matching screenshot exactly) */}
                <div className="bg-emerald-950/40 border border-emerald-500/30 rounded-xl p-3.5 text-left space-y-0.5">
                  <div className="flex items-center gap-1.5 text-emerald-400 font-mono text-xs font-bold">
                    <CheckCircle2 size={14} className="flex-shrink-0" />
                    <span>Private AC Car, Driver & BBM</span>
                  </div>
                  <p className="text-[10px] text-emerald-300/70 font-sans pl-5">
                    Hotel/villa pick-up & drop-off included se-Bali.
                  </p>
                </div>

              </div>

              {/* Price Calculation Footer & Action Button (Matching screenshot) */}
              <div className="pt-4 border-t border-gold-900/20 space-y-3">
                <div className="text-left space-y-1">
                  <span className="text-[10px] uppercase font-mono tracking-wider text-gold-200/50 block">
                    {paymentType === 'dp' && step === 'payment' ? 'Wajib Bayar Sekarang (DP 30%)' : 'Total Biaya'}
                  </span>
                  
                  <div className="flex items-baseline gap-2">
                    <span className="font-mono text-2xl sm:text-3xl font-extrabold text-gold-400">
                      USD ${amountToPayUSD}
                    </span>
                    <span className="text-xs font-mono text-gold-200/60 font-semibold">
                      (Rp {amountToPayIDR.toLocaleString('id-ID')})
                    </span>
                  </div>

                  <span className="text-[10px] font-mono text-gold-200/40 block">
                    (1 mobil s.d 10 jam • All-Inclusive)
                  </span>
                </div>

                {/* Secondary CTA button in sidebar (Matching screenshot) */}
                {step === 'date' && (
                  <button
                    type="button"
                    disabled={!date || !!dateWarning}
                    onClick={() => handleProceedToGuests()}
                    className={`w-full py-3.5 rounded-xl font-mono text-xs uppercase tracking-widest font-extrabold flex items-center justify-center gap-2 transition-all cursor-pointer shadow-md ${
                      !date || dateWarning
                        ? 'bg-neutral-800 text-neutral-500 cursor-not-allowed'
                        : 'bg-gold-400 hover:bg-gold-500 text-neutral-950 shadow-gold-500/10 active:scale-95'
                    }`}
                  >
                    <span>Lanjut ke Data →</span>
                  </button>
                )}

                {step === 'guest_info' && (
                  <button
                    type="button"
                    onClick={(e) => handleProceedToPayment(e as any)}
                    className="w-full py-3.5 rounded-xl font-mono text-xs uppercase tracking-widest font-extrabold bg-gold-400 hover:bg-gold-500 text-neutral-950 flex items-center justify-center gap-2 transition-all cursor-pointer shadow-md shadow-gold-500/10 active:scale-95"
                  >
                    <span>Lanjut ke Pembayaran →</span>
                  </button>
                )}

                {step === 'payment' && (
                  <button
                    type="button"
                    disabled={isProcessingMidtrans}
                    onClick={handlePayWithMidtrans}
                    className="w-full py-3.5 rounded-xl font-mono text-xs uppercase tracking-widest font-extrabold bg-gold-400 hover:bg-gold-500 text-neutral-950 flex items-center justify-center gap-2 transition-all cursor-pointer shadow-md shadow-gold-500/10 active:scale-95 disabled:opacity-50"
                  >
                    {isProcessingMidtrans ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <Lock size={14} />
                    )}
                    <span>Bayar via Midtrans Snap</span>
                  </button>
                )}
              </div>

            </div>

          </div>
        ) : null}

        {/* ==================================================================== */}
        {/* STEP 4: PROCESSING STATE                                             */}
        {/* ==================================================================== */}
        {step === 'processing' && (
          <div className="py-24 text-center space-y-6 flex flex-col items-center justify-center animate-fade-in p-8" id="payment-processing-spinner">
            <Loader2 className="w-16 h-16 text-gold-400 animate-spin" />
            <div className="space-y-2 max-w-sm">
              <h3 className="font-serif text-2xl text-gold-200">Menghubungkan Midtrans Snap</h3>
              <p className="text-gold-100/50 text-xs md:text-sm font-sans leading-relaxed">
                Sedang memverifikasi sesi transaksi aman. Mohon tidak menutup halaman ini...
              </p>
            </div>
          </div>
        )}

        {/* ==================================================================== */}
        {/* STEP 5: SUCCESS OFFICIAL E-VOUCHER TICKET                            */}
        {/* ==================================================================== */}
        {step === 'success' && confirmedBooking && (
          <div className="p-6 md:p-8 space-y-6 text-left animate-fade-in overflow-y-auto">
            
            <div className="bg-emerald-950/30 border border-emerald-500/30 rounded-xl p-6 text-center space-y-2 flex flex-col items-center">
              <div className="w-12 h-12 rounded-full bg-emerald-400 text-neutral-950 flex items-center justify-center shadow-lg shadow-emerald-500/20">
                <Check size={24} className="stroke-[3]" />
              </div>
              <h3 className="font-serif text-2xl text-gold-200 font-bold">
                Pembayaran Berhasil & Terverifikasi
              </h3>
              <p className="text-gold-200/70 text-xs md:text-sm font-sans max-w-lg mx-auto">
                E-Tiket resmi telah dikirim ke email: <strong className="text-gold-300">{confirmedBooking.email}</strong>.
              </p>
            </div>

            {/* Voucher Card */}
            <div
              id="printable-luxury-voucher"
              className="bg-neutral-900 border border-gold-400/30 rounded-xl p-6 relative overflow-hidden space-y-5"
            >
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-gold-900/20 pb-4">
                <div>
                  <span className="font-serif text-xl text-gold-200 font-bold uppercase tracking-wider">
                    HOOLA HOLIDAY BALI
                  </span>
                  <span className="block text-[9px] font-mono tracking-widest text-gold-400 uppercase font-semibold">
                    OFFICIAL VIP TOUR & TRAVEL CHARTER
                  </span>
                </div>

                <div className="bg-neutral-950 px-3.5 py-2 rounded-lg border border-gold-400/40 text-left sm:text-right font-mono">
                  <span className="text-[8px] text-gold-200/50 block uppercase">ORDER ID / KODE RESERVASI</span>
                  <span className="text-xs text-gold-200 font-bold block">{confirmedBooking.bookingCode}</span>
                  <span className="text-[10px] text-emerald-400 font-bold block">
                    ✓ {confirmedBooking.paymentType === 'dp' ? 'DP 30% TERVERIFIKASI' : '100% LUNAS'}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
                <div className="bg-neutral-950 p-3 rounded border border-gold-900/20">
                  <span className="text-gold-400/60 text-[9px] block uppercase">PAKET WISATA</span>
                  <span className="text-gold-100 font-serif font-bold text-xs truncate block">{currentExp.title}</span>
                </div>
                <div className="bg-neutral-950 p-3 rounded border border-gold-900/20">
                  <span className="text-gold-400/60 text-[9px] block uppercase">TANGGAL TRIP</span>
                  <span className="text-gold-100 text-xs font-bold block">{formatSidebarDate(confirmedBooking.date)}</span>
                </div>
                <div className="bg-neutral-950 p-3 rounded border border-gold-900/20">
                  <span className="text-gold-400/60 text-[9px] block uppercase">NAMA PEMESAN</span>
                  <span className="text-gold-100 text-xs font-bold truncate block">{confirmedBooking.fullName}</span>
                </div>
                <div className="bg-neutral-950 p-3 rounded border border-gold-900/20">
                  <span className="text-gold-400/60 text-[9px] block uppercase">PESERTA</span>
                  <span className="text-gold-300 text-xs font-bold block">{confirmedBooking.guests} Orang</span>
                </div>
              </div>

              {/* Status Pembayaran */}
              <div className="bg-neutral-950 p-4 rounded-lg border border-gold-400/20">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 font-mono text-xs">
                  <div>
                    <span className="text-gold-200/50 block text-[10px]">TOTAL NILAI PAKET:</span>
                    <span className="text-gold-100 font-bold block">
                      Rp {(confirmedBooking.totalAmountIDR || grandTotalIDR).toLocaleString('id-ID')} (${confirmedBooking.totalPrice})
                    </span>
                  </div>
                  <div className="sm:border-l sm:border-gold-900/20 sm:pl-3">
                    <span className="text-emerald-400 block text-[10px] font-bold">SUDAH DIBAYAR:</span>
                    <span className="text-emerald-400 font-bold block">
                      Rp {(confirmedBooking.amountToPayIDR || amountToPayIDR).toLocaleString('id-ID')}
                    </span>
                  </div>
                  <div className="sm:border-l sm:border-gold-900/20 sm:pl-3">
                    <span className="text-gold-300 block text-[10px]">SISA PELUNASAN:</span>
                    <span className="text-gold-300 font-bold block">
                      Rp {(confirmedBooking.remainingBalanceIDR !== undefined ? confirmedBooking.remainingBalanceIDR : remainingBalanceIDR).toLocaleString('id-ID')}
                    </span>
                  </div>
                </div>
              </div>

              <div className="bg-neutral-950/70 p-4 rounded-lg border border-gold-900/20 text-xs font-sans text-gold-200/70 leading-relaxed">
                <p>• Tim Hoola Holiday Bali akan menghubungi WhatsApp <strong>{confirmedBooking.phone}</strong> H-1 sebelum tur untuk konfirmasi jam penjemputan dan nama supir VIP Anda.</p>
              </div>
            </div>

            <div className="flex gap-3 justify-center">
              <button
                type="button"
                onClick={() => window.print()}
                className="bg-gold-400 hover:bg-gold-500 text-neutral-950 font-mono text-xs uppercase tracking-widest font-bold px-6 py-3 rounded-lg transition-all shadow-md flex items-center gap-2 cursor-pointer active:scale-95"
              >
                <Printer size={15} />
                <span>Cetak E-Tiket</span>
              </button>
              <button
                type="button"
                onClick={handleReset}
                className="bg-neutral-900 border border-gold-400/25 hover:border-gold-400 text-gold-300 hover:text-white font-mono text-xs uppercase tracking-widest px-6 py-3 rounded-lg transition-colors cursor-pointer"
              >
                Selesai
              </button>
            </div>

          </div>
        )}

      </div>
    </div>
  );
}
