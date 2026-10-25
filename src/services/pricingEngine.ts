// ============================================================================
// HOOLA HOLIDAY BALI - SERVER-SIDE PRICING ENGINE & STATUS RESOLVER
// Shared between Express (server.ts) and Cloudflare Pages Functions (functions/api/*)
// Mencegah manipulasi nominal harga oleh inspect element frontend.
// ============================================================================

export const USD_TO_IDR_RATE = 16000;

export const OFFICIAL_TOUR_PRICES: Record<string, { title: string; priceUSD: number }> = {
  'nusa-penida': { title: 'Nusa Penida Golden Beach', priceUSD: 195 },
  'ocean-escape': { title: 'Ocean Luxury Escape', priceUSD: 290 },
  'bali-volcano': { title: 'Mount Batur Sunrise Trek', priceUSD: 145 },
  'atv-jungle': { title: 'ATV Jungle Mud Ride', priceUSD: 110 },
  'river-tubing': { title: 'River Tubing Adventure', priceUSD: 95 },
  'bali-swing': { title: 'Ubud Jungle Swing & Bird Nest', priceUSD: 85 },
  'bedugul-tour': { title: 'Bedugul & Beratan Temple Tour', priceUSD: 135 },
  'lempuyang': { title: 'Lempuyang Gate of Heaven Tour', priceUSD: 140 },
  'uluwatu': { title: 'Uluwatu Sunset & Kecak Dance', priceUSD: 130 },
  'jungle-retreat': { title: 'Serene Jungle Retreat Ubud', priceUSD: 175 },
  'jeep-adventure': { title: 'Sewa Mobil Kijang Innova', priceUSD: 50 },
};

export const OFFICIAL_ADDON_PRICES: Record<string, number> = {
  'photo-pro': 120,
  'drone-4k': 180,
  'champagne': 250,
  'heli-transfer': 450,
};

export const OFFICIAL_VEHICLE_PRICES: Record<string, { name: string; withDriver: number; withoutDriver: number }> = {
  'toyota-avanza': { name: 'New Avanza', withDriver: 450000, withoutDriver: 300000 },
  'toyota-innova': { name: 'Innova Reborn', withDriver: 600000, withoutDriver: 450000 },
  'innova-zenix': { name: 'Innova Zenix Type Q', withDriver: 1200000, withoutDriver: 1200000 },
  'toyota-alphard': { name: 'Toyota Alphard', withDriver: 2500000, withoutDriver: 2500000 },
  'hiace-commuter': { name: 'Hiace Commuter', withDriver: 1000000, withoutDriver: 1000000 },
  'bus-29': { name: 'Bus 29 Seat', withDriver: 2000000, withoutDriver: 2000000 },
  'honda-brio': { name: 'Honda Brio Satya RS', withDriver: 550000, withoutDriver: 350000 },
  'yamaha-nmax': { name: 'Yamaha NMAX 155 Connected', withDriver: 250000, withoutDriver: 150000 },
  'honda-scoopy': { name: 'Honda Scoopy Prestige', withDriver: 195000, withoutDriver: 95000 },
};

export interface PricingResult {
  itemName: string;
  totalAmountUSD: number;
  totalAmountIDR: number;
  effectiveDpPercent: number;
  grossAmountIDR: number;
  remainingBalanceIDR: number;
}

export function calculateOrderPricing(params: {
  bookingType: 'tour' | 'rental';
  itemId: string;
  quantity: number;
  addons?: string[];
  driverOption?: 'with' | 'without';
  paymentType: 'dp' | 'full';
  dpPercentage?: number;
}): PricingResult {
  const { bookingType, itemId, quantity, addons, driverOption = 'with', paymentType, dpPercentage } = params;

  const qty = Math.floor(Number(quantity));
  if (isNaN(qty) || qty < 1 || qty > 50) {
    throw new Error('Jumlah pax atau durasi sewa harus berupa angka positif antara 1 dan 50.');
  }

  if (paymentType !== 'dp' && paymentType !== 'full') {
    throw new Error('Tipe pembayaran tidak valid. Harus "dp" atau "full".');
  }

  let itemName = '';
  let officialTotalUSD = 0;
  let officialTotalIDR = 0;

  if (bookingType === 'rental') {
    const vehicle = OFFICIAL_VEHICLE_PRICES[itemId];
    if (!vehicle) {
      throw new Error(`Armada rental dengan ID "${itemId}" tidak terdaftar dalam sistem resmi.`);
    }

    const isWithoutDriver = driverOption === 'without';
    itemName = `${vehicle.name} (${isWithoutDriver ? 'Lepas Kunci' : 'Dengan Supir'})`;
    const ratePerDay = isWithoutDriver ? vehicle.withoutDriver : vehicle.withDriver;
    const subtotalIDR = ratePerDay * qty;
    const taxIDR = Math.round(subtotalIDR * 0.1);
    officialTotalIDR = subtotalIDR + taxIDR;
    officialTotalUSD = Math.round(officialTotalIDR / USD_TO_IDR_RATE);
  } else {
    const tour = OFFICIAL_TOUR_PRICES[itemId];
    if (!tour) {
      throw new Error(`Paket wisata dengan ID "${itemId}" tidak terdaftar dalam katalog resmi.`);
    }

    itemName = tour.title;
    const baseUSD = tour.priceUSD * qty;

    let addonUSD = 0;
    if (Array.isArray(addons)) {
      for (const addonId of addons) {
        if (typeof addonId === 'string' && OFFICIAL_ADDON_PRICES[addonId]) {
          addonUSD += OFFICIAL_ADDON_PRICES[addonId];
        }
      }
    }

    const subtotalUSD = baseUSD + addonUSD;
    const taxUSD = Math.round(subtotalUSD * 0.1);
    officialTotalUSD = subtotalUSD + taxUSD;
    officialTotalIDR = officialTotalUSD * USD_TO_IDR_RATE;
  }

  const effectiveDpPercent = paymentType === 'dp'
    ? Math.min(100, Math.max(10, Math.floor(Number(dpPercentage) || 30)))
    : 100;

  let grossAmountIDR = officialTotalIDR;
  let remainingBalanceIDR = 0;

  if (paymentType === 'dp') {
    grossAmountIDR = Math.round((officialTotalIDR * effectiveDpPercent) / 100);
    remainingBalanceIDR = officialTotalIDR - grossAmountIDR;
  }

  return {
    itemName,
    totalAmountUSD: officialTotalUSD,
    totalAmountIDR: officialTotalIDR,
    effectiveDpPercent,
    grossAmountIDR,
    remainingBalanceIDR,
  };
}

export function verifyGrossAmountMatches(expected: number, actual: string | number): boolean {
  const parsed = Math.round(Number(actual));
  return !isNaN(parsed) && parsed === Math.round(expected);
}

export function resolveMidtransStatus(
  transactionStatus: string,
  fraudStatus?: string,
  paymentType?: 'dp' | 'full'
): {
  status: 'PENDING' | 'DP_PAID' | 'SETTLEMENT' | 'CANCELLED' | 'EXPIRED' | 'DENIED' | 'REFUNDED';
  isSuccess: boolean;
} {
  const normStatus = (transactionStatus || '').toLowerCase();
  const normFraud = (fraudStatus || '').toLowerCase();

  if (normStatus === 'capture') {
    if (normFraud === 'challenge') {
      return { status: 'PENDING', isSuccess: false };
    }
    if (normFraud === 'accept') {
      return { status: paymentType === 'dp' ? 'DP_PAID' : 'SETTLEMENT', isSuccess: true };
    }
    return { status: 'DENIED', isSuccess: false };
  }

  if (normStatus === 'settlement') {
    return { status: paymentType === 'dp' ? 'DP_PAID' : 'SETTLEMENT', isSuccess: true };
  }

  if (normStatus === 'pending') {
    return { status: 'PENDING', isSuccess: false };
  }

  if (normStatus === 'deny') {
    return { status: 'DENIED', isSuccess: false };
  }

  if (normStatus === 'expire') {
    return { status: 'EXPIRED', isSuccess: false };
  }

  if (normStatus === 'cancel') {
    return { status: 'CANCELLED', isSuccess: false };
  }

  if (normStatus === 'refund' || normStatus === 'partial_refund') {
    return { status: 'REFUNDED', isSuccess: false };
  }

  return { status: 'PENDING', isSuccess: false };
}
