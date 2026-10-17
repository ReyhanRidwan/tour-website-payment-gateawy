import React from 'react';
import { Clock, MapPin, Star, Sparkles, ArrowLeft, ArrowRight, Check } from 'lucide-react';
import { Experience } from '../types';
import { EXPERIENCES } from '../data';

interface PackageDetailProps {
  experienceId: string;
  onBack: () => void;
  onBookNow: (expId: string) => void;
}

export default function PackageDetail({ experienceId, onBack, onBookNow }: PackageDetailProps) {
  const exp = EXPERIENCES.find(e => e.id === experienceId) || EXPERIENCES[0];

  return (
    <div className="pt-24 pb-20 px-6 md:px-12 bg-neutral-950 min-h-screen animate-fade-in text-left">
      <div className="max-w-7xl mx-auto">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-gold-300 hover:text-gold-400 font-mono text-xs uppercase tracking-widest mb-8 transition-colors cursor-pointer"
        >
          <ArrowLeft size={16} />
          <span>Kembali ke Katalog</span>
        </button>

        {/* Main Image Header */}
        <div className="relative w-full h-[400px] md:h-[500px] lg:h-[600px] rounded-lg overflow-hidden mb-8 border border-gold-400/20 shadow-2xl">
          <img
            src={exp.bgImage}
            alt={exp.title}
            className="w-full h-full object-cover"
            loading="lazy"
            referrerPolicy="no-referrer"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-neutral-950 via-neutral-950/40 to-transparent" />
          
          <div className="absolute bottom-8 left-8 right-8">
            <span className="inline-block bg-gold-400 text-neutral-950 text-[10px] font-mono font-bold uppercase tracking-widest px-3 py-1 rounded-sm mb-3">
              {exp.tagline}
            </span>
            <h1 className="font-serif text-3xl md:text-5xl text-gold-100 font-medium tracking-wide mb-4">
              {exp.title}
            </h1>
            <div className="flex flex-wrap items-center gap-4 text-gold-200/80 font-mono text-xs">
              <div className="flex items-center gap-1.5">
                <Clock size={14} className="text-gold-400" />
                <span>{exp.duration}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <MapPin size={14} className="text-gold-400" />
                <span>{exp.location}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Star size={14} className="text-gold-400 fill-current" />
                <span>{exp.rating} ({exp.reviewCount} ulasan)</span>
              </div>
            </div>
          </div>
        </div>

        {/* Content Section */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-10">
            {/* Description */}
            <div className="space-y-4">
              <h2 className="font-serif text-2xl text-gold-200 border-b border-gold-900/20 pb-2">
                Tentang Petualangan Ini
              </h2>
              <p className="font-sans text-gold-100/70 leading-relaxed">
                {exp.longDesc}
              </p>
            </div>

            {/* Gallery: 4 Supporting Images */}
            {exp.galleryImages && exp.galleryImages.length === 4 && (
              <div className="space-y-4">
                <h2 className="font-serif text-2xl text-gold-200 border-b border-gold-900/20 pb-2">
                  Galeri Perjalanan
                </h2>
                <div className="grid grid-cols-2 gap-4">
                  {exp.galleryImages.map((img, idx) => (
                    <div key={idx} className="relative h-48 md:h-64 rounded-md overflow-hidden border border-gold-400/10 shadow-lg">
                      <img
                        src={img}
                        alt={`${exp.title} gallery ${idx + 1}`}
                        className="w-full h-full object-cover hover:scale-105 transition-transform duration-700"
                        loading="lazy"
                        referrerPolicy="no-referrer"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Itinerary */}
            <div className="space-y-4">
              <h2 className="font-serif text-2xl text-gold-200 border-b border-gold-900/20 pb-2">
                Jadwal Perjalanan (Itinerary)
              </h2>
              <div className="space-y-6 pl-4 border-l-2 border-gold-900/30">
                {exp.itinerary.map((item, idx) => (
                  <div key={idx} className="relative">
                    <div className="absolute -left-[23px] top-1 w-3 h-3 bg-gold-400 rounded-full shadow-[0_0_10px_rgba(181,141,61,0.5)]" />
                    <div className="space-y-1">
                      <span className="font-mono text-[10px] text-gold-400 font-bold uppercase tracking-widest">{item.time}</span>
                      <h3 className="font-serif text-lg text-gold-100">{item.title}</h3>
                      <p className="font-sans text-sm text-gold-200/60 leading-relaxed">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Sidebar / Booking Card */}
          <div className="lg:col-span-1">
            <div className="bg-neutral-900/60 border border-gold-400/20 rounded-lg p-6 sticky top-28 shadow-xl">
              <div className="mb-6">
                <span className="block text-[10px] font-mono text-gold-300/40 tracking-widest uppercase font-semibold">Mulai</span>
                <span className="font-mono text-4xl font-bold text-gold-300">${exp.pricePerPerson}</span>
                <span className="text-xs text-gold-200/40 font-light"> / orang</span>
              </div>
              
              <div className="space-y-6">
                <div className="space-y-3">
                  <h4 className="font-mono text-xs uppercase tracking-widest text-gold-400 font-bold flex items-center gap-2">
                    <Check size={14} />
                    <span>Sudah Termasuk</span>
                  </h4>
                  <ul className="space-y-2 text-sm text-gold-200/70 font-sans font-light">
                    {exp.inclusions.map((inc, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <span className="text-gold-500 mt-1 text-[10px]">■</span>
                        <span>{inc}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="space-y-3">
                  <h4 className="font-mono text-xs uppercase tracking-widest text-red-400/80 font-bold flex items-center gap-2">
                    <Check size={14} className="opacity-0" />
                    <span>Tidak Termasuk</span>
                  </h4>
                  <ul className="space-y-2 text-sm text-gold-200/50 font-sans font-light">
                    {exp.exclusions.map((exc, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <span className="text-red-900/50 mt-1 text-[10px]">■</span>
                        <span>{exc}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <button
                  onClick={() => onBookNow(exp.id)}
                  className="w-full bg-gold-400 hover:bg-gold-500 text-neutral-950 font-mono text-sm uppercase tracking-widest font-extrabold px-6 py-4 rounded-sm transition-all shadow-md hover:shadow-gold-500/10 flex items-center justify-center gap-2 active:scale-95 cursor-pointer mt-4"
                >
                  <span>Booking Sekarang</span>
                  <ArrowRight size={16} className="stroke-[2.5]" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
