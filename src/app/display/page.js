'use client';

import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';

export default function DisplayMonitor() {
  const [antrianBerjalan, setAntrianBerjalan] = useState({ pembuatan_akun: null, verifikasi_akun: null, khusus: null });
  const [izinSuaraDiberikan, setIzinSuaraDiberikan] = useState(false);
  const [availableVoices, setAvailableVoices] = useState([]);
  
  const nomorTerakhirDisuarakan = useRef({ pembuatan_akun: null, verifikasi_akun: null, khusus: null });
  // PENGUNCI GANDA: Mencegah suara terpanggil 2 kali dalam waktu bersamaan (jeda 3 detik)
  const waktuSuaraTerakhir = useRef({ pembuatan_akun: 0, verifikasi_akun: 0, khusus: 0 }); 

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
  }, [izinSuaraDiberikan]);

  const aktifkanLayarDanSuara = () => {
    if (window.speechSynthesis) window.speechSynthesis.speak(new SpeechSynthesisUtterance(''));
    setIzinSuaraDiberikan(true);
  };

  const bunyikanSuaraPanggilan = (nomorTiket, namaSiswa, jenisLayanan) => {
    if (!window.speechSynthesis) return;
    
    const pecahKode = nomorTiket.split('-');
    const huruf = pecahKode[0] || '';
    const angka = pecahKode[1] || '';
    
    let teksLayanan = jenisLayanan === 'pembuatan_akun' ? 'pengajuan akun' : jenisLayanan === 'verifikasi_akun' ? 'verifikasi akun' : 'antrean khusus';

    const kalimatPanggilan = `Nomor antrean. ${huruf}. ${angka}. Atas nama. ${namaSiswa}. Silakan menuju bagian. ${teksLayanan}.`;
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
    const tglSekarang = new Date().toISOString().split('T')[0];
    
    const { data } = await supabase
      .from('antrian')
      .select('*')
      .eq('tanggal', tglSekarang)
      .in('status', ['dipanggil', 'selesai']);

    if (data) {
      const infoAntrian = { pembuatan_akun: null, verifikasi_akun: null, khusus: null };
      const layananTypes = ['pembuatan_akun', 'verifikasi_akun', 'khusus'];

      const getTimestamp = (item) => new Date(item.updated_at || item.created_at).getTime();

      layananTypes.forEach(layanan => {
        const listSelesai = data.filter(item => item.jenis_antrian === layanan && item.status === 'selesai');
        let waktuSelesaiTerakhir = 0;
        if (listSelesai.length > 0) {
          listSelesai.sort((a, b) => getTimestamp(b) - getTimestamp(a));
          waktuSelesaiTerakhir = getTimestamp(listSelesai[0]);
        }

        const listDipanggil = data.filter(item => item.jenis_antrian === layanan && item.status === 'dipanggil');
        let aktif = null;
        
        if (listDipanggil.length > 0) {
          listDipanggil.sort((a, b) => getTimestamp(b) - getTimestamp(a));
          const kandidat = listDipanggil[0];
          const waktuKandidat = getTimestamp(kandidat);

          if (waktuKandidat > waktuSelesaiTerakhir) {
            aktif = {
              nomor: kandidat.nomor_antrian,
              nama: kandidat.nama_lengkap,
              updated: kandidat.updated_at || kandidat.created_at
            };
          }
        }
        
        infoAntrian[layanan] = aktif;
      });

      Object.keys(infoAntrian).forEach(layanan => {
        const baru = infoAntrian[layanan];
        const lama = nomorTerakhirDisuarakan.current[layanan];

        if (baru) {
          let panggilSuara = false;

          if (!lama) {
            panggilSuara = true;
          } else if (baru.nomor === lama.nomor && baru.updated !== lama.updated) {
            panggilSuara = true;
          } else if (baru.nomor !== lama.nomor && new Date(baru.updated).getTime() > new Date(lama.updated).getTime()) {
            panggilSuara = true;
          }

          if (panggilSuara) {
            const now = Date.now();
            // Cek jika pemanggilan terakhir untuk layanan ini berjarak kurang dari 3 detik (cegah double click suara)
            if (now - waktuSuaraTerakhir.current[layanan] > 3000) {
              waktuSuaraTerakhir.current[layanan] = now;
              bunyikanSuaraPanggilan(baru.nomor, baru.nama, layanan);
            }
          }
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
    <div className="bg-slate-900 rounded-2xl border border-slate-800 shadow-2xl p-5 text-center flex flex-col justify-between h-full transition-all duration-300">
      <div>
        <div className={`${bgHeader} rounded-xl py-2 text-base font-black tracking-wide mb-4 shadow-sm`}>{title}</div>
        <p className="text-slate-500 text-[11px] font-bold uppercase tracking-widest">Nomor Antrean</p>
        <h1 className={`text-6xl font-black my-2 tracking-tight transition-opacity duration-500 ${data ? textColor : 'text-slate-700 opacity-50'}`}>
          {data ? data.nomor : '---'}
        </h1>
      </div>
      <div className="border-t border-slate-800 pt-3 mt-4 flex flex-col justify-end">
        <p className="text-[10px] text-slate-500 uppercase tracking-widest mb-1">Nama Pendaftar</p>
        <p className={`text-2xl font-bold truncate transition-opacity duration-500 ${data ? textColor : 'text-slate-600 opacity-50'}`} title={data ? data.nama : ''}>
          {data ? data.nama : 'Kosong'}
        </p>
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
        <LayarLoket title="PENGAJUAN AKUN" bgHeader="bg-blue-600" data={antrianBerjalan.pembuatan_akun} textColor="text-white" />
        <LayarLoket title="VERIFIKASI AKUN" bgHeader="bg-emerald-600" data={antrianBerjalan.verifikasi_akun} textColor="text-emerald-400" />
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