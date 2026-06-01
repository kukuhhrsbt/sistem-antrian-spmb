'use client';

import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';

export default function DisplayMonitor() {
  const [antrianBerjalan, setAntrianBerjalan] = useState({ pembuatan_akun: null, verifikasi_akun: null, khusus: null });
  const [izinSuaraDiberikan, setIzinSuaraDiberikan] = useState(false);
  const [availableVoices, setAvailableVoices] = useState([]);
  
  const nomorTerakhirDisuarakan = useRef({ pembuatan_akun: null, verifikasi_akun: null, khusus: null });

  const [tglSekarang] = useState(() => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  });

  useEffect(() => {
    const loadVoices = () => {
      setAvailableVoices(window.speechSynthesis.getVoices());
    };
    loadVoices();
    if (window.speechSynthesis.onvoiceschanged !== undefined) {
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }
  }, []);

  useEffect(() => {
    if (!izinSuaraDiberikan) return;
    ambilAntrianAktif();
    const channel = supabase.channel('display_v2_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'antrian' }, () => ambilAntrianAktif())
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [izinSuaraDiberikan, tglSekarang]);

  const aktifkanLayarDanSuara = () => {
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel(); 
      window.speechSynthesis.speak(new SpeechSynthesisUtterance(''));
    }
    setIzinSuaraDiberikan(true);
  };

  const bunyikanSuaraPanggilan = (nomorTiket, namaSiswa, jenisLayanan) => {
    if (!window.speechSynthesis) return;
    
    const pecahKode = nomorTiket.split('-');
    const huruf = pecahKode[0] || '';
    
    const angka = parseInt(pecahKode[1], 10) || pecahKode[1] || ''; 
    
    let teksLayanan = jenisLayanan === 'pembuatan_akun' ? 'pembuatan akun' : jenisLayanan === 'verifikasi_akun' ? 'verifikasi berkas' : 'antrean khusus';

    const kalimatPanggilan = `Nomor antrean, ${huruf}... ${angka}.., atas nama, ${namaSiswa}, silakan menuju ke bagian, ${teksLayanan}`;
    
    const utterance = new SpeechSynthesisUtterance(kalimatPanggilan);
    
    const idVoice = availableVoices.find(v => 
      v.name.toLowerCase().includes('google bahasa indonesia') || 
      v.lang === 'id-ID' || 
      v.lang === 'id_ID'
    );
    if (idVoice) utterance.voice = idVoice;

    utterance.lang = 'id-ID'; 
    utterance.rate = 0.85; 
    utterance.pitch = 1.0;    
    
    window.speechSynthesis.speak(utterance);
  };

  const ambilAntrianAktif = async () => {
    const { data } = await supabase
      .from('antrian')
      .select('*')
      .eq('tanggal', tglSekarang)
      .eq('status', 'dipanggil')
      .order('updated_at', { ascending: false });

    if (data) {
      const infoAntrian = { pembuatan_akun: null, verifikasi_akun: null, khusus: null };
      
      data.forEach(item => {
        if (!infoAntrian[item.jenis_antrian]) {
          infoAntrian[item.jenis_antrian] = { 
            nomor: item.nomor_antrian, 
            nama: item.nama_lengkap, 
            updated: item.updated_at || item.created_at 
          };
        }
      });

      Object.keys(infoAntrian).forEach(layanan => {
        const baru = infoAntrian[layanan];
        const lama = nomorTerakhirDisuarakan.current[layanan];

        if (baru && (!lama || baru.nomor !== lama.nomor || baru.updated !== lama.updated)) {
          bunyikanSuaraPanggilan(baru.nomor, baru.nama, layanan);
        }
      });

      nomorTerakhirDisuarakan.current = infoAntrian;
      setAntrianBerjalan(infoAntrian);
    }
  };

  if (!izinSuaraDiberikan) {
    return (
      <main className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-center">
        <h1 className="text-4xl font-black text-white mb-4">SISTEM MONITOR ANTREAN</h1>
        <p className="text-slate-400 mb-8 max-w-md">Klik tombol di bawah ini untuk mengaktifkan layar dan suara otomatis.</p>
        <button onClick={aktifkanLayarDanSuara} className="bg-blue-600 hover:bg-blue-500 text-white font-black text-xl px-12 py-6 rounded-2xl shadow-lg shadow-blue-600/30 transform transition-all active:scale-95 animate-bounce">
          AKTIFKAN LAYAR & SUARA
        </button>
      </main>
    );
  }

  const LayarLoket = ({ title, bgHeader, data, textColor }) => (
    <div className="bg-slate-900 rounded-2xl border border-slate-800 shadow-2xl p-5 text-center flex flex-col justify-between h-full">
      <div>
        <div className={`${bgHeader} rounded-xl py-2 text-base font-black tracking-wide mb-4`}>{title}</div>
        <p className="text-slate-500 text-[11px] font-bold uppercase tracking-widest">Nomor Antrean</p>
        <h1 className={`text-6xl font-black my-2 tracking-tight ${textColor}`}>{data ? data.nomor : '---'}</h1>
      </div>
      <div className="border-t border-slate-800 pt-3 mt-4 flex flex-col justify-end">
        <p className="text-[10px] text-slate-500 uppercase tracking-widest mb-1">Nama Pendaftar</p>
        <p className={`text-2xl font-bold truncate ${textColor}`} title={data ? data.nama : ''}>{data ? data.nama : '---'}</p>
      </div>
    </div>
  );

  return (
    <main className="min-h-screen bg-slate-950 text-white p-6 flex flex-col justify-between font-sans antialiased">
      <div className="text-center border-b-2 border-slate-800 pb-4 mb-4">
        <h1 className="text-3xl font-black tracking-wider text-blue-500">MONITOR RUANG TUNGGU</h1>
        <p className="text-sm font-bold text-slate-400 mt-0.5">SMA NEGERI 3 SRAGEN</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 my-auto items-stretch h-[50vh]">
        <LayarLoket title="PEMBUATAN AKUN" bgHeader="bg-blue-600" data={antrianBerjalan.pembuatan_akun} textColor="text-white" />
        <LayarLoket title="VERIFIKASI BERKAS" bgHeader="bg-emerald-600" data={antrianBerjalan.verifikasi_akun} textColor="text-emerald-400" />
        <LayarLoket title="ANTREAN KHUSUS" bgHeader="bg-rose-600" data={antrianBerjalan.khusus} textColor="text-rose-400" />
      </div>

      <div className="bg-slate-900/60 border border-slate-800 p-3 rounded-lg overflow-hidden mt-6">
        <div className="whitespace-nowrap text-xs text-blue-400 font-bold animate-marquee">
          📢 PENGUMUMAN: Siapkan berkas dan Ijazah. Perhatikan nama dan nomor Anda, jika dipanggil segera merapat ke loket pelayanan masing-masing. Terima kasih.
        </div>
      </div>
      
      <style jsx global>{` 
        @keyframes marquee { 0% { transform: translateX(100%); } 100% { transform: translateX(-100%); } } 
        .animate-marquee { animation: marquee 20s linear infinite; } 
      `}</style>
    </main>
  );
}