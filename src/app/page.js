'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

export default function Home() {
  const [namaLengkap, setNamaLengkap] = useState('');
  const [asalSekolah, setAsalSekolah] = useState('');
  const [nomorHp, setNomorHp] = useState('');
  const [jenisAntrian, setJenisAntrian] = useState('');
  
  const [config, setConfig] = useState({ 
    pendaftaran_dibuka: true, mode_waktu_aktif: false, jam_buka: '07:30', jam_tutup: '15:00', 
    kuota_pembuatan: 50, kuota_verifikasi: 50, 
    checklist_pembuatan: [], checklist_verifikasi: [] 
  });
  const [checklistDipilih, setChecklistDipilih] = useState({});
  
  // State Kuota Spesifik Tanpa Total
  const [terpakaiPembuatan, setTerpakaiPembuatan] = useState(0);
  const [terpakaiVerifikasi, setTerpakaiVerifikasi] = useState(0);
  
  const [pendaftaranSistemTerbuka, setPendaftaranSistemTerbuka] = useState(true);
  const [loading, setLoading] = useState(false);
  const [pesanError, setPesanError] = useState('');
  const [antrianAktif, setAntrianAktif] = useState(null);

  const [namaCari, setNamaCari] = useState('');
  const [modeCari, setModeCari] = useState(false);

  const tglSekarang = new Date().toISOString().split('T')[0];

  useEffect(() => {
    fetchSistemDanKuota();
    
    const saved = localStorage.getItem('spmb_antrian_aktif');
    if (saved) {
      const parsed = JSON.parse(saved);
      cekStatusTerbaru(parsed.id);
    }

    const subSistem = supabase
      .channel('realtime_siswa_v5')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pengaturan_sistem' }, () => fetchSistemDanKuota())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'antrian' }, () => fetchSistemDanKuota())
      .subscribe();

    return () => {
      supabase.removeChannel(subSistem);
    };
  }, []);

  const fetchSistemDanKuota = async () => {
    let currentConfig = config;
    const { data: resConfig } = await supabase.from('pengaturan_sistem').select('*').eq('id', 1).single();
    
    if (resConfig) {
      currentConfig = resConfig;
      setConfig(resConfig);
      
      if (resConfig.mode_waktu_aktif) {
        const sekarang = new Date();
        const jamMenitSekarang = sekarang.toTimeString().split(' ')[0].substring(0, 5);
        setPendaftaranSistemTerbuka(jamMenitSekarang >= resConfig.jam_buka.substring(0, 5) && jamMenitSekarang <= resConfig.jam_tutup.substring(0, 5));
      } else {
        setPendaftaranSistemTerbuka(resConfig.pendaftaran_dibuka);
      }
    }

    const { data: dataUnik } = await supabase.from('antrian').select('nomor_hp, jenis_antrian').eq('tanggal', tglSekarang);
      
    if (dataUnik) {
      const hpsPembuatan = new Set(dataUnik.filter(d => d.jenis_antrian === 'pembuatan_akun').map(item => item.nomor_hp));
      const hpsVerifikasi = new Set(dataUnik.filter(d => d.jenis_antrian === 'verifikasi_akun').map(item => item.nomor_hp));

      setTerpakaiPembuatan(Math.max(0, hpsPembuatan.size - (currentConfig.offset_kuota_pembuatan || 0)));
      setTerpakaiVerifikasi(Math.max(0, hpsVerifikasi.size - (currentConfig.offset_kuota_verifikasi || 0)));
    }
  };

  const cekStatusTerbaru = async (id) => {
    const { data } = await supabase.from('antrian').select('*').eq('id', id).single();
    if (data) {
      setAntrianAktif(data);
      langgananRealtimeSiswa(id);
    }
  };

  const langgananRealtimeSiswa = (id) => {
    supabase
      .channel(`ch_siswa_v5_${id}`)
      .on('postgres_changes', { event: 'UPDATE', filter: `id=eq.${id}`, schema: 'public', table: 'antrian' }, (payload) => {
        setAntrianAktif(payload.new);
      })
      .subscribe();
  };

  const handleCariAntrian = async (e) => {
    e.preventDefault();
    if (!namaCari) return;
    const { data } = await supabase.from('antrian').select('*').eq('tanggal', tglSekarang).ilike('nama_lengkap', namaCari).order('id', { ascending: false }).limit(1);

    if (data && data.length > 0) {
      localStorage.setItem('spmb_antrian_aktif', JSON.stringify(data[0]));
      setAntrianAktif(data[0]);
      langgananRealtimeSiswa(data[0].id);
      setModeCari(false); setNamaCari('');
    } else {
      alert('Data antrian tidak ditemukan.');
    }
  };

  // Rujukan Lanjutan Otomatis
  const handleRujukMandiriKeVerifikasi = async () => {
    // Validasi Sisa Kuota Verifikasi
    if (terpakaiVerifikasi >= config.kuota_verifikasi) {
      alert('Maaf, kuota antrean untuk Verifikasi Akun hari ini telah penuh.');
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('ambil_antrian_atomic', {
        p_nama_lengkap: antrianAktif.nama_lengkap, p_asal_sekolah: antrianAktif.asal_sekolah,
        p_nomor_hp: antrianAktif.nomor_hp, p_jenis_antrian: 'verifikasi_akun',
        p_keterangan: 'Kelanjutan Mandiri dari Pengajuan Akun'
      });

      if (error) throw error;
      const dataAntrianBaru = data && data.length > 0 ? data[0] : null;
      if (!dataAntrianBaru) throw new Error('Gagal menerbitkan nomor antrean.');

      localStorage.setItem('spmb_antrian_aktif', JSON.stringify(dataAntrianBaru));
      setAntrianAktif(dataAntrianBaru);
      langgananRealtimeSiswa(dataAntrianBaru.id);
      alert(`Sukses! Nomor antrian Verifikasi Anda: ${dataAntrianBaru.nomor_antrian}`);
    } catch (err) {
      alert('Gagal mengambil rujukan: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const selesaiDanKeluarSistem = () => {
    localStorage.removeItem('spmb_antrian_aktif');
    setAntrianAktif(null);
  };

  const handlePilihLayanan = (layanan) => {
    setJenisAntrian(layanan);
    setChecklistDipilih({});
  };

  const toggleChecklist = (item) => {
    setChecklistDipilih(prev => ({ ...prev, [item]: !prev[item] }));
  };

  const listSyarat = jenisAntrian === 'pembuatan_akun' ? config.checklist_pembuatan : config.checklist_verifikasi;
  const semuaTercentang = listSyarat.length > 0 && listSyarat.every(item => checklistDipilih[item] === true);

  const isPembuatanPenuh = terpakaiPembuatan >= config.kuota_pembuatan;
  const isVerifikasiPenuh = terpakaiVerifikasi >= config.kuota_verifikasi;

  const handleDaftar = async (e) => {
    e.preventDefault();
    setLoading(true);
    setPesanError('');
    
    if (jenisAntrian === 'pembuatan_akun' && isPembuatanPenuh) {
      setPesanError('Maaf, kuota untuk Pengajuan Akun hari ini telah penuh.');
      setLoading(false); return;
    }

    if (jenisAntrian === 'verifikasi_akun' && isVerifikasiPenuh) {
      setPesanError('Maaf, kuota untuk Verifikasi Akun hari ini telah penuh.');
      setLoading(false); return;
    }

    try {
      const { data, error } = await supabase.rpc('ambil_antrian_atomic', {
        p_nama_lengkap: namaLengkap, p_asal_sekolah: asalSekolah, p_nomor_hp: nomorHp,
        p_jenis_antrian: jenisAntrian, p_keterangan: null
      });

      if (error) throw error;
      const dataAntrianBaru = data && data.length > 0 ? data[0] : null;
      if (!dataAntrianBaru) throw new Error('Gagal menerbitkan nomor antrean.');

      localStorage.setItem('spmb_antrian_aktif', JSON.stringify(dataAntrianBaru));
      setAntrianAktif(dataAntrianBaru);
      langgananRealtimeSiswa(dataAntrianBaru.id);
    } catch (err) {
      setPesanError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (antrianAktif) {
    const isSelesaiPembuatan = antrianAktif.status === 'selesai' && antrianAktif.jenis_antrian === 'pembuatan_akun';
    return (
      <main className="min-h-screen bg-slate-50 flex items-center justify-center p-4 antialiased">
        <div className="bg-white p-6 md:p-8 rounded-2xl shadow-xl border border-slate-200 text-center max-w-md w-full">
          {antrianAktif.status !== 'selesai' ? (
            <>
              <div className="bg-amber-500 text-white font-bold py-1 px-4 rounded-full text-xs inline-block mb-3 animate-pulse">
                ⚠️ WAJIB SCREENSHOT HALAMAN INI
              </div>
              <h2 className="text-xl font-bold text-slate-800">SMA Negeri 3 Sragen</h2>
              <p className="text-xs text-slate-400">Bukti Pengambilan Nomor Antrian Online</p>
              
              <div className="bg-slate-900 text-white rounded-2xl p-6 my-5 shadow-inner relative overflow-hidden">
                <div className="absolute top-0 right-0 bg-blue-600 text-[10px] font-mono px-3 py-1 rounded-bl-lg">
                  {antrianAktif.token_akses}
                </div>
                <p className="text-xs text-slate-400 uppercase font-semibold tracking-widest">Nomor Urut Loket Anda</p>
                <h1 className="text-6xl font-black my-2 tracking-tight text-blue-400">{antrianAktif.nomor_antrian}</h1>
                
                {antrianAktif.jenis_antrian === 'khusus' ? (
                  <div className="mt-3 flex flex-col items-center gap-1">
                    <div className="bg-rose-600 px-4 py-1 rounded-full text-xs font-bold text-white border border-rose-500">Antrian Khusus</div>
                    <p className="text-[10px] text-rose-300 italic max-w-xs px-2 mt-1 leading-tight">{antrianAktif.keterangan || "Layanan Prioritas."}</p>
                  </div>
                ) : (
                  <div className="mt-3 inline-block bg-slate-800 px-4 py-1 rounded-full text-xs font-semibold capitalize text-slate-300 border border-slate-700">
                    Bagian: {antrianAktif.jenis_antrian === 'pembuatan_akun' ? 'Pengajuan Akun' : 'Verifikasi Akun'}
                  </div>
                )}
              </div>

              <div className="text-left bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2 text-xs text-slate-700 mb-5">
                <p><strong>Nama Lengkap:</strong> {antrianAktif.nama_lengkap}</p>
                <p><strong>Asal Sekolah:</strong> {antrianAktif.asal_sekolah}</p>
                <p><strong>Status:</strong> <span className={`ml-2 px-2 py-0.5 rounded text-[10px] font-bold uppercase ${antrianAktif.status === 'dipanggil' ? 'bg-green-600 text-white' : 'bg-slate-200 text-slate-700'}`}>{antrianAktif.status}</span></p>
              </div>
            </>
          ) : (
            <div className="py-4 space-y-4">
              <div className="text-4xl">🎉</div>
              <h2 className="text-lg font-bold text-slate-900">Proses Anda Telah Selesai!</h2>
              
              <div className="bg-slate-50 border text-left p-3 rounded-xl space-y-1 text-xs text-slate-600 max-w-xs mx-auto">
                <p><strong>Nama Siswa:</strong> {antrianAktif.nama_lengkap}</p>
                <p><strong>No Antrian:</strong> {antrianAktif.nomor_antrian}</p>
              </div>

              {isSelesaiPembuatan ? (
                <div className="bg-blue-50 border border-blue-100 p-4 rounded-xl space-y-3 mt-4">
                  <p className="text-xs font-bold text-blue-900">Ingin lanjut ke tahap Verifikasi Akun?</p>
                  <p className="text-[11px] text-slate-600 leading-normal">
                    Lanjutkan secara otomatis dan langsung masuk ke sistem Verifikasi Akun tanpa perlu mengisi data dari awal.
                  </p>
                  <button onClick={handleRujukMandiriKeVerifikasi} disabled={loading || isVerifikasiPenuh} className={`w-full font-bold py-2 rounded-lg text-xs transition-colors ${isVerifikasiPenuh ? 'bg-slate-300 text-white cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700 text-white'}`}>
                    {loading ? 'Memproses...' : isVerifikasiPenuh ? 'Kuota Verifikasi Penuh' : 'Lanjut Ambil Antrian Verifikasi Akun'}
                  </button>
                  <button onClick={selesaiDanKeluarSistem} className="text-[10px] text-slate-400 font-medium block mx-auto underline">
                    Tidak, Saya ingin keluar sistem
                  </button>
                </div>
              ) : (
                <div className="pt-2">
                  <p className="text-xs font-bold text-emerald-700 bg-emerald-50 p-4 rounded-xl border border-emerald-100 leading-relaxed">
                    Silakan lakukan aktivasi akun. Terima Kasih.
                  </p>
                  <button onClick={selesaiDanKeluarSistem} className="mt-5 w-full bg-slate-900 text-white text-xs font-bold py-2 rounded-lg transition-colors hover:bg-slate-800">
                    Selesai & Keluar Dari Sistem
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    );
  }

  if (!pendaftaranSistemTerbuka) {
    return (
      <main className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4 text-center">
        <div className="bg-white p-8 rounded-2xl shadow-md max-w-md w-full border border-slate-200">
          <div className="text-4xl mb-3">🛑</div>
          <h1 className="text-xl font-bold text-slate-800">Pendaftaran Antrian Ditutup</h1>
          <button onClick={() => setModeCari(true)} className="mt-6 text-xs text-blue-600 font-semibold underline block mx-auto">
            Cari nomor antrian saya yang hilang
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 py-8 px-4 flex flex-col items-center antialiased">
      <div className="bg-white p-6 md:p-8 rounded-2xl shadow-sm max-w-lg w-full border border-slate-200/60">
        
        <div className="text-center mb-6">
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">Antrean Online SPMB</h1>
          <p className="text-xs text-slate-400 font-medium mt-0.5">SMA Negeri 3 Sragen</p>
          
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <div className={`px-3 py-1 rounded-full text-[10px] font-semibold border ${isPembuatanPenuh ? 'bg-rose-50 text-rose-700 border-rose-200' : 'bg-blue-50 text-blue-700 border-blue-200'}`}>
              Kuota Pengajuan: {terpakaiPembuatan} / {config.kuota_pembuatan}
            </div>
            <div className={`px-3 py-1 rounded-full text-[10px] font-semibold border ${isVerifikasiPenuh ? 'bg-rose-50 text-rose-700 border-rose-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>
              Kuota Verifikasi: {terpakaiVerifikasi} / {config.kuota_verifikasi}
            </div>
          </div>
        </div>

        {pesanError && <div className="mb-4 p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg font-medium">{pesanError}</div>}

        <form onSubmit={handleDaftar} className="space-y-5">
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Nama Lengkap Siswa</label>
              <input type="text" required value={namaLengkap} onChange={(e) => setNamaLengkap(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-slate-50/50 outline-none" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Asal Sekolah</label>
              <input type="text" required value={asalSekolah} onChange={(e) => setAsalSekolah(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-slate-50/50 outline-none" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Nomor HP Aktif</label>
              <input type="tel" required value={nomorHp} onChange={(e) => setNomorHp(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-slate-50/50 outline-none" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-2">Pilih Bagian Layanan</label>
            <div className="grid grid-cols-2 gap-3">
              <button type="button" onClick={() => handlePilihLayanan('pembuatan_akun')} disabled={isPembuatanPenuh} className={`border rounded-xl p-3 text-left transition-all ${isPembuatanPenuh ? 'opacity-50 cursor-not-allowed bg-slate-100' : jenisAntrian === 'pembuatan_akun' ? 'border-blue-600 bg-blue-50/40 ring-2 ring-blue-500/20' : 'border-slate-200 hover:bg-slate-50'}`}>
                <span className="block text-xs font-bold text-slate-800">1. Pengajuan Akun</span>
                <span className={`block text-[10px] mt-1 font-bold ${isPembuatanPenuh ? 'text-rose-500' : 'text-slate-400'}`}>{isPembuatanPenuh ? 'KUOTA PENUH' : 'Kode Antrian A'}</span>
              </button>

              <button type="button" onClick={() => handlePilihLayanan('verifikasi_akun')} disabled={isVerifikasiPenuh} className={`border rounded-xl p-3 text-left transition-all ${isVerifikasiPenuh ? 'opacity-50 cursor-not-allowed bg-slate-100' : jenisAntrian === 'verifikasi_akun' ? 'border-blue-600 bg-blue-50/40 ring-2 ring-blue-500/20' : 'border-slate-200 hover:bg-slate-50'}`}>
                <span className="block text-xs font-bold text-slate-800">2. Verifikasi Akun</span>
                <span className={`block text-[10px] mt-1 font-bold ${isVerifikasiPenuh ? 'text-rose-500' : 'text-slate-400'}`}>{isVerifikasiPenuh ? 'KUOTA PENUH' : 'Kode Antrian B'}</span>
              </button>
            </div>
          </div>

          {jenisAntrian && (
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200/80 space-y-2.5">
              <p className="text-[11px] font-bold uppercase text-slate-500 tracking-wider">Konfirmasi Persyaratan</p>
              {listSyarat.map((item, index) => (
                <label key={index} className="flex items-start text-xs text-slate-700 cursor-pointer select-none font-medium">
                  <input type="checkbox" checked={!!checklistDipilih[item]} onChange={() => toggleChecklist(item)} className="mt-0.5 mr-3 h-4 w-4 rounded border-slate-300 text-blue-600" />
                  <span>{item}</span>
                </label>
              ))}
            </div>
          )}

          <button type="submit" disabled={loading || !semuaTercentang || (jenisAntrian === 'pembuatan_akun' ? isPembuatanPenuh : isVerifikasiPenuh)} className={`w-full py-2.5 rounded-xl text-xs font-bold text-white tracking-wide transition-all ${semuaTercentang && !loading && (jenisAntrian === 'pembuatan_akun' ? !isPembuatanPenuh : !isVerifikasiPenuh) ? 'bg-blue-600 hover:bg-blue-700' : 'bg-slate-300 cursor-not-allowed'}`}>
            {loading ? 'Memproses...' : 'Ambil Nomor Antrian'}
          </button>
        </form>

        <div className="border-t border-slate-100 mt-5 pt-4 text-center">
          <button onClick={() => setModeCari(true)} className="text-xs text-slate-400 font-medium hover:text-blue-600 transition-colors underline">
            Saya kehilangan tangkapan layar, cari antrean saya
          </button>
        </div>
      </div>

      {modeCari && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white p-6 rounded-xl max-w-sm w-full text-left shadow-2xl">
            <h3 className="font-bold text-sm text-slate-900 mb-1">Cari Antrean Aktif</h3>
            <form onSubmit={handleCariAntrian} className="space-y-3 mt-3">
              <input type="text" required placeholder="Masukkan Nama Lengkap" value={namaCari} onChange={(e) => setNamaCari(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-xs text-slate-800 bg-slate-50 focus:outline-none" />
              <div className="flex gap-2 justify-end text-xs font-semibold pt-2">
                <button type="button" onClick={() => setModeCari(false)} className="px-3 py-1.5 bg-slate-100 rounded-md">Batal</button>
                <button type="submit" className="px-3 py-1.5 bg-blue-600 rounded-md text-white">Temukan</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}