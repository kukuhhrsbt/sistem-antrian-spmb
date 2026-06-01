'use client';

import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';

export default function DisplayMonitor() {
  const [antrianBerjalan, setAntrianBerjalan] = useState({ pembuatan_akun: null, verifikasi_akun: null, khusus: null });
  const [izinSuaraDiberikan, setIzinSuaraDiberikan] = useState(false);
  const [daftarSuara, setDaftarSuara] = useState([]);
  
  const nomorTerakhirDisuarakan = useRef({ pembuatan_akun: null, verifikasi_akun: null, khusus: null });

  // Mengambil daftar suara (voices) yang tersedia di sistem/browser
  useEffect(() => {
    const muatSuara = () => {
      const voices = window.speechSynthesis.getVoices();
      setDaftarSuara(voices);
    };

    muatSuara();
    if (window.speechSynthesis.onvoiceschanged !== undefined) {
      window.speechSynthesis.onvoiceschanged = muatSuara;
    }
  }, []);

  useEffect(() => {
    if (!izinSuaraDiberikan) return;

    ambilAntrianAktif();

    const channel = supabase
      .channel('display_v2_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'antrian' }, () => {
        ambilAntrianAktif();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [izinSuaraDiberikan]);

  const aktifkanLayarDanSuara = () => {
    if (window.speechSynthesis) {
      const pemancingSuara = new SpeechSynthesisUtterance('');
      window.speechSynthesis.speak(pemancingSuara);
    }
    setIzinSuaraDiberikan(true);
  };

  const bunyikanSuaraPanggilan = (nomorTiket, namaLengkap, jenisLayanan) => {
    if (!window.speechSynthesis) return;

    window.speechSynthesis.cancel();

    // Memecah teks agar dieja per huruf/angka (Contoh: A01 -> A, 0, 1) agar lebih natural
    const nomorFormatEjaan = nomorTiket.replace('-', '').split('').join(', ');

    let teksLayanan = '';
    if (jenisLayanan === 'pembuatan_akun') {
      teksLayanan = 'pembuatan akun';
    } else if (jenisLayanan === 'verifikasi_akun') {
      teksLayanan = 'verifikasi berkas';
    } else {
      teksLayanan = 'antrian khusus';
    }

    // Menambahkan jeda koma agar intonasi lebih natural
    const teksNama = namaLengkap ? `, atas nama, ${namaLengkap},` : '';
    const kalimatPanggilan = `Nomor antrean, ${nomorFormatEjaan}${teksNama} silakan menuju bagian, ${teksLayanan}`;
    
    const utterance = new SpeechSynthesisUtterance(kalimatPanggilan);
    utterance.lang = 'id-ID'; 
    utterance.rate = 0.85; // Diperlambat sedikit agar lebih jelas
    utterance.pitch = 1.0; 

    // Mencari suara bahasa Indonesia yang paling natural (Google/Microsoft)
    const suaraIndo = daftarSuara.filter(v => v.lang === 'id-ID' || v.lang === 'id_ID');
    const suaraNatural = suaraIndo.find(v => v.name.includes('Google') || v.name.includes('Premium') || v.name.includes('Online')) || suaraIndo[0];
    
    if (suaraNatural) {
      utterance.voice = suaraNatural;
    }

    window.speechSynthesis.speak(utterance);
  };

  const ambilAntrianAktif = async () => {
    const tglSekarang = new Date().toISOString().split('T')[0];
    const { data } = await supabase
      .from('antrian')
      .select('*')
      .eq('tanggal', tglSekarang)
      .eq('status', 'dipanggil')
      .order('created_at', { ascending: false });

    if (data) {
      const infoAntrian = { pembuatan_akun: null, verifikasi_akun: null, khusus: null };
      
      data.forEach(item => {
        if (!infoAntrian[item.jenis_antrian]) {
          // Menyimpan nomor dan nama_lengkap sekaligus
          infoAntrian[item.jenis_antrian] = {
            nomor: item.nomor_antrian,
            nama: item.nama_lengkap // Pastikan kolom ini sesuai dengan database Supabase Anda
          };
        }
      });

      Object.keys(infoAntrian).forEach(layanan => {
        const dataBaru = infoAntrian[layanan];
        const nomorLama = nomorTerakhirDisuarakan.current[layanan];

        if (dataBaru && (!nomorLama || dataBaru.nomor !== nomorLama)) {
          bunyikanSuaraPanggilan(dataBaru.nomor, dataBaru.nama, layanan);
        }
      });

      // Simpan referensi nomor terakhir yang dipanggil
      nomorTerakhirDisuarakan.current = {
        pembuatan_akun: infoAntrian.pembuatan_akun?.nomor || null,
        verifikasi_akun: infoAntrian.verifikasi_akun?.nomor || null,
        khusus: infoAntrian.khusus?.nomor || null
      };
      
      setAntrianBerjalan(infoAntrian);
    }
  };

  if (!izinSuaraDiberikan) {
    return (
      <main className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-center">
        <h1 className="text-4xl font-black text-white mb-4">SISTEM MONITOR ANTRIAN</h1>
        <p className="text-slate-400 mb-8 max-w-md">Peramban membutuhkan izin interaksi klik untuk dapat memutar suara secara otomatis.</p>
        <button 
          onClick={aktifkanLayarDanSuara}
          className="bg-blue-600 hover:bg-blue-500 text-white font-black text-xl px-12 py-6 rounded-2xl shadow-lg shadow-blue-600/30 transform transition-all active:scale-95 animate-bounce"
        >
          KLIK UNTUK MEMULAI LAYAR & SUARA
        </button>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 text-white p-6 flex flex-col justify-between font-sans antialiased">
      <div className="text-center border-b-2 border-slate-800 pb-4 mb-4">
        <h1 className="text-3xl font-black tracking-wider text-blue-500">MONITOR RUANG TUNGGU ANTRIAN</h1>
        <p className="text-sm font-bold text-slate-400 mt-0.5">SMA NEGERI 3 SRAGEN</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 my-auto">
        {/* KOTAK 1: PEMBUATAN AKUN */}
        <div className="bg-slate-900 rounded-2xl border border-slate-800 shadow-2xl p-5 text-center flex flex-col justify-center">
          <div className="bg-blue-600 rounded-xl py-2 text-base font-black tracking-wide mb-4">PEMBUATAN AKUN</div>
          <p className="text-slate-500 text-[11px] font-bold uppercase tracking-widest">Nomor Antrian</p>
          <h1 className="text-6xl font-black mt-2 text-white tracking-tight">
            {antrianBerjalan.pembuatan_akun?.nomor || '---'}
          </h1>
          <p className="text-lg font-bold text-slate-300 mt-2 h-7 truncate" title={antrianBerjalan.pembuatan_akun?.nama}>
            {antrianBerjalan.pembuatan_akun?.nama || '\u00A0'}
          </p>
          <div className="text-xs font-semibold text-blue-400 mt-4 border-t border-slate-800 pt-3 uppercase">Silakan menuju bagian PEMBUATAN AKUN</div>
        </div>

        {/* KOTAK 2: VERIFIKASI BERKAS */}
        <div className="bg-slate-900 rounded-2xl border border-slate-800 shadow-2xl p-5 text-center flex flex-col justify-center">
          <div className="bg-emerald-600 rounded-xl py-2 text-base font-black tracking-wide mb-4">VERIFIKASI BERKAS</div>
          <p className="text-slate-500 text-[11px] font-bold uppercase tracking-widest">Nomor Antrian</p>
          <h1 className="text-6xl font-black mt-2 text-emerald-400 tracking-tight">
            {antrianBerjalan.verifikasi_akun?.nomor || '---'}
          </h1>
          <p className="text-lg font-bold text-slate-300 mt-2 h-7 truncate" title={antrianBerjalan.verifikasi_akun?.nama}>
            {antrianBerjalan.verifikasi_akun?.nama || '\u00A0'}
          </p>
          <div className="text-xs font-semibold text-emerald-400 mt-4 border-t border-slate-800 pt-3 uppercase">Silakan menuju bagian VERIFIKASI BERKAS</div>
        </div>

        {/* KOTAK 3: ANTRIAN KHUSUS */}
        <div className="bg-slate-900 rounded-2xl border border-slate-800 shadow-2xl p-5 text-center flex flex-col justify-center">
          <div className="bg-rose-600 rounded-xl py-2 text-base font-black tracking-wide mb-4">ANTRIAN KHUSUS</div>
          <p className="text-slate-500 text-[11px] font-bold uppercase tracking-widest">Nomor Antrian</p>
          <h1 className="text-6xl font-black mt-2 text-rose-400 tracking-tight">
            {antrianBerjalan.khusus?.nomor || '---'}
          </h1>
          <p className="text-lg font-bold text-slate-300 mt-2 h-7 truncate" title={antrianBerjalan.khusus?.nama}>
            {antrianBerjalan.khusus?.nama || '\u00A0'}
          </p>
          <div className="text-xs font-semibold text-rose-400 mt-4 border-t border-slate-800 pt-3 uppercase">Pelayanan Khusus Prioritas Admin</div>
        </div>
      </div>

      <div className="bg-slate-900/60 border border-slate-800 p-3 rounded-lg overflow-hidden mt-6">
        <div className="whitespace-nowrap text-xs text-blue-400 font-bold animate-marquee">
          📢 PENGUMUMAN: Bagi calon siswa SMA Negeri 3 Sragen yang nomor urutnya telah dipanggil, mohon segera merapat ke meja pelayanan masing-masing dengan membawa bukti tangkapan layar handphone Anda. Terima kasih.
        </div>
      </div>

      <style jsx global>{`
        @keyframes marquee { 0% { transform: translateX(100%); } 100% { transform: translateX(-100%); } }
        .animate-marquee { animation: marquee 20s linear infinite; }
      `}</style>
    </main>
  );
}