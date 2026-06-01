'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

export default function Home() {
  const [namaLengkap, setNamaLengkap] = useState('');
  const [asalSekolah, setAsalSekolah] = useState('');
  const [nomorHp, setNomorHp] = useState('');
  const [jenisAntrian, setJenisAntrian] = useState('');
  
  const [config, setConfig] = useState({ pendaftaran_dibuka: true, mode_waktu_aktif: false, jam_buka: '07:30', jam_tutup: '15:00', kuota_harian: 100, checklist_pembuatan: [], checklist_verifikasi: [] });
  const [checklistDipilih, setChecklistDipilih] = useState({});
  const [totalKuotaTerpakai, setTotalKuotaTerpakai] = useState(0);
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
      .channel('realtime_siswa_v3')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pengaturan_sistem' }, () => fetchSistemDanKuota())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'antrian' }, () => fetchSistemDanKuota())
      .subscribe();

    return () => {
      supabase.removeChannel(subSistem);
    };
  }, []);

  const fetchSistemDanKuota = async () => {
    const { data: resConfig } = await supabase.from('pengaturan_sistem').select('*').eq('id', 1).single();
    if (resConfig) {
      setConfig(resConfig);
      
      if (resConfig.mode_waktu_aktif) {
        const sekarang = new Date();
        const jamMenitSekarang = sekarang.toTimeString().split(' ')[0].substring(0, 5);
        
        if (jamMenitSekarang >= resConfig.jam_buka.substring(0, 5) && jamMenitSekarang <= resConfig.jam_tutup.substring(0, 5)) {
          setPendaftaranSistemTerbuka(true);
        } else {
          setPendaftaranSistemTerbuka(false);
        }
      } else {
        setPendaftaranSistemTerbuka(resConfig.pendaftaran_dibuka);
      }
    }

    // Poin 4: Hitung kuota berdasarkan jumlah unik siswa (grup nomor_hp) agar rujukan lanjutan bernilai 1 kuota
    const { data: dataUnik, error } = await supabase
      .from('antrian')
      .select('nomor_hp')
      .eq('tanggal', tglSekarang);
      
    if (dataUnik) {
      const uniqueHps = new Set(dataUnik.map(item => item.nomor_hp));
      setTotalKuotaTerpakai(uniqueHps.size);
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
      .channel(`ch_siswa_v3_${id}`)
      .on('postgres_changes', { event: 'UPDATE', filter: `id=eq.${id}`, schema: 'public', table: 'antrian' }, (payload) => {
        setAntrianAktif(payload.new);
      })
      .subscribe();
  };

  const handleCariAntrian = async (e) => {
    e.preventDefault();
    if (!namaCari) return;
    
    const { data } = await supabase
      .from('antrian')
      .select('*')
      .eq('tanggal', tglSekarang)
      .ilike('nama_lengkap', namaCari)
      .order('id', { ascending: false })
      .limit(1);

    if (data && data.length > 0) {
      localStorage.setItem('spmb_antrian_aktif', JSON.stringify(data[0]));
      setAntrianAktif(data[0]);
      langgananRealtimeSiswa(data[0].id);
      setModeCari(false);
      setNamaCari('');
    } else {
      alert('Data antrian tidak ditemukan.');
    }
  };

  // ALUR SISWA AMBIL RUJUKAN LANJUTAN MANDIRI TANPA POTONG KUOTA BARU (Poin 4 & 5)
  const handleRujukMandiriKeVerifikasi = async () => {
    setLoading(true);
    try {
      const { data: lastRow } = await supabase
        .from('antrian')
        .select('nomor_urut_internal')
        .eq('tanggal', tglSekarang)
        .eq('jenis_antrian', 'verifikasi_akun')
        .order('nomor_urut_internal', { ascending: false })
        .limit(1);

      const urutSelanjutnya = lastRow && lastRow.length > 0 ? lastRow[0].nomor_urut_internal + 1 : 1;
      const nomorAntrianBaru = `B-${urutSelanjutnya}`;
      const tokenUnik = 'TK-' + Math.random().toString(36).substring(2, 10).toUpperCase();

      const { data, error } = await supabase
        .from('antrian')
        .insert([{
          nama_lengkap: antrianAktif.nama_lengkap,
          asal_sekolah: antrianAktif.asal_sekolah,
          nomor_hp: antrianAktif.nomor_hp,
          jenis_antrian: 'verifikasi_akun',
          nomor_urut_internal: urutSelanjutnya,
          nomor_antrian: nomorAntrianBaru,
          token_akses: tokenUnik,
          status: 'menunggu',
          keterangan: 'Kelanjutan Mandiri dari Pembuatan Akun'
        }])
        .select().single();

      if (error) throw error;

      localStorage.setItem('spmb_antrian_aktif', JSON.stringify(data));
      setAntrianAktif(data);
      langgananRealtimeSiswa(data.id);
      alert(`Sukses! Anda telah terdaftar di Antrian Verifikasi Berkas dengan Nomor urut: ${nomorAntrianBaru}`);

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

  const handleDaftar = async (e) => {
    e.preventDefault();
    setLoading(true);
    setPesanError('');

    // Cek apakah nomor HP ini sudah terdaftar hari ini (Poin 4: Proteksi kuota rujukan mandiri)
    const { data: hpEksis } = await supabase
      .from('antrian')
      .select('id')
      .eq('tanggal', tglSekarang)
      .eq('nomor_hp', nomorHp)
      .limit(1);

    const isUserBaru = !hpEksis || hpEksis.length === 0;

    // Jika user baru dan kuota sudah penuh, tolak pendaftaran
    if (isUserBaru && totalKuotaTerpakai >= config.kuota_harian) {
      setPesanError('Maaf, kuota pengambilan nomor antrian untuk hari ini telah penuh.');
      setLoading(false);
      return;
    }

    try {
      const kodePrefix = jenisAntrian === 'pembuatan_akun' ? 'A' : 'B';

      const { data: lastRow } = await supabase
        .from('antrian')
        .select('nomor_urut_internal')
        .eq('tanggal', tglSekarang)
        .eq('jenis_antrian', jenisAntrian)
        .order('nomor_urut_internal', { ascending: false })
        .limit(1);

      const urutSelanjutnya = lastRow && lastRow.length > 0 ? lastRow[0].nomor_urut_internal + 1 : 1;
      const nomorAntrianFormatted = `${kodePrefix}-${urutSelanjutnya}`;
      const tokenUnik = 'TK-' + Math.random().toString(36).substring(2, 10).toUpperCase();

      const { data, error } = await supabase
        .from('antrian')
        .insert([{
          nama_lengkap: namaLengkap,
          asal_sekolah: asalSekolah,
          nomor_hp: nomorHp,
          jenis_antrian: jenisAntrian,
          nomor_urut_internal: urutSelanjutnya,
          nomor_antrian: nomorAntrianFormatted,
          token_akses: tokenUnik,
          status: 'menunggu'
        }])
        .select().single();

      if (error) throw error;

      localStorage.setItem('spmb_antrian_aktif', JSON.stringify(data));
      setAntrianAktif(data);
      langgananRealtimeSiswa(data.id);

    } catch (err) {
      setPesanError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (antrianAktif) {
    const isSelesaiPembuatan = antrianAktif.status === 'selesai' && antrianAktif.jenis_antrian === 'pembuatan_akun';
    const isSelesaiVerifikasi = antrianAktif.status === 'selesai' && antrianAktif.jenis_antrian === 'verifikasi_akun';

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
                
                {/* Informasi Detal Awalan Kode Khusus Jika Terlewat (Poin 2) */}
                {antrianAktif.jenis_antrian === 'khusus' ? (
                  <div className="mt-3 flex flex-col items-center gap-1">
                    <div className="bg-rose-600 px-4 py-1 rounded-full text-xs font-bold text-white border border-rose-500">
                      Bagian: Antrian Khusus
                    </div>
                    <p className="text-[10px] text-rose-300 italic max-w-xs px-2 mt-1 leading-tight">
                      {antrianAktif.keterangan || "Antrian Anda dialihkan ke loket khusus prioritas."}
                    </p>
                  </div>
                ) : (
                  <div className="mt-3 inline-block bg-slate-800 px-4 py-1 rounded-full text-xs font-semibold capitalize text-slate-300 border border-slate-700">
                    Bagian: {antrianAktif.jenis_antrian === 'pembuatan_akun' ? 'Pembuatan Akun' : 'Verifikasi Berkas'}
                  </div>
                )}
              </div>

              <div className="text-left bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2 text-xs text-slate-700 mb-5">
                <p><strong>Nama Lengkap:</strong> {antrianAktif.nama_lengkap}</p>
                <p><strong>Asal Sekolah:</strong> {antrianAktif.asal_sekolah}</p>
                <p><strong>Status Panggilan:</strong> 
                  <span className={`ml-2 px-2 py-0.5 rounded text-[10px] font-bold uppercase ${antrianAktif.status === 'dipanggil' ? 'bg-green-600 text-white' : 'bg-slate-200 text-slate-700'}`}>
                    {antrianAktif.status}
                  </span>
                </p>
              </div>

              {/* Teks Penyesuaian Instruksi Baru Sesuai Poin 1 */}
              <p className="text-[11px] text-slate-500 font-medium bg-blue-50 border border-blue-100 p-3 rounded-lg text-center leading-relaxed">
                📸 **Tunjukkan tangkapan layar (screenshot) halaman ini pada bagian VERIFIKASI BERKAS PENGAJUAN AKUN** saat nomor Kamu dipanggil berkasmu sudah dipastikan sesuai dengan persyaratan pembuatan akun.
              </p>
            </>
          ) : (
            // INTERFAS PERPINDAHAN MANDIRI / SELESAI TOTAL (Poin 3)
            <div className="py-4 space-y-4">
              <div className="text-4xl">🎉</div>
              <h2 className="text-lg font-bold text-slate-900">Proses Anda Telah Selesai!</h2>
              
              {/* Penambahan Nama Lengkap dan Asal Sekolah (Poin 3) */}
              <div className="bg-slate-50 border text-left p-3 rounded-xl space-y-1 text-xs text-slate-600 max-w-xs mx-auto">
                <p><strong>Nama Siswa:</strong> {antrianAktif.nama_lengkap}</p>
                <p><strong>Asal Sekolah:</strong> {antrianAktif.asal_sekolah}</p>
                <p><strong>No Antrian:</strong> {antrianAktif.nomor_antrian}</p>
              </div>

              {isSelesaiPembuatan ? (
                <div className="bg-blue-50 border border-blue-100 p-4 rounded-xl space-y-3 mt-4">
                  <p className="text-xs font-bold text-blue-900">Ingin lanjut ke tahap Verifikasi Berkas?</p>
                  <p className="text-[11px] text-slate-600 leading-normal">
                    Anda bisa langsung masuk ke antrian Verifikasi Berkas saat ini juga secara otomatis tanpa perlu mengisi kembali nama dan berkas persyaratan dari awal (Hanya menggunakan satu kuota pendaftaran harian).
                  </p>
                  <button onClick={handleRujukMandiriKeVerifikasi} disabled={loading} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 rounded-lg text-xs transition-colors">
                    {loading ? 'Memproses Nomor Baru...' : 'Ambil Antrian Verifikasi Berkas'}
                  </button>
                  <button onClick={selesaiDanKeluarSistem} className="text-[10px] text-slate-400 font-medium block mx-auto underline">
                    Tidak, Saya ingin keluar sistem
                  </button>
                </div>
              ) : (
                // Perubahan Redaksi Penutup Aktivasi dan Auto-Exit dari Sistem (Poin 3)
                <div className="pt-2">
                  <p className="text-xs font-bold text-emerald-700 bg-emerald-50 p-4 rounded-xl border border-emerald-100 leading-relaxed">
                    Silakan lakukan aktivasi akun, bisa dilakukan mandiri atau dibagian Aktivasi Akun. Terima Kasih.
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
          <p className="text-sm text-slate-500 mt-2 leading-relaxed">
            {config.mode_waktu_aktif 
              ? `Loket pendaftaran online spmb dibuka secara otomatis pada jam pelayanan ${config.jam_buka.substring(0,5)} WIB s.d ${config.jam_tutup.substring(0,5)} WIB.`
              : 'Mohon maaf, loket pendaftaran antrian online SPMB SMA Negeri 3 Sragen saat ini sedang ditutup sementara oleh panitia.'
            }
          </p>
          <button onClick={() => setModeCari(true)} className="mt-6 text-xs text-blue-600 font-semibold underline block mx-auto">
            Saya kehilangan screenshot, cari nomor antrian saya kembali
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 py-8 px-4 flex flex-col items-center antialiased">
      <div className="bg-white p-6 md:p-8 rounded-2xl shadow-sm max-w-lg w-full border border-slate-200/60">
        
        <div className="text-center mb-6">
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">Sistem Antrian Online SPMB</h1>
          <p className="text-xs text-slate-400 font-medium mt-0.5">SMA Negeri 3 Sragen</p>
          <div className="mt-3 inline-flex items-center gap-2 bg-slate-100 px-3 py-1 rounded-full text-xs font-semibold text-slate-700 border border-slate-200">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            Kuota Terpakai Hari Ini: {totalKuotaTerpakai} / {config.kuota_harian}
          </div>
        </div>

        {pesanError && <div className="mb-4 p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg font-medium">{pesanError}</div>}

        <form onSubmit={handleDaftar} className="space-y-5">
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Nama Lengkap Siswa</label>
              <input type="text" required value={namaLengkap} onChange={(e) => setNamaLengkap(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-800 text-sm bg-slate-50/50" placeholder="Contoh: Aisha Zoya Kirana" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Asal Sekolah (SMP/MTs)</label>
              <input type="text" required value={asalSekolah} onChange={(e) => setAsalSekolah(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-800 text-sm bg-slate-50/50" placeholder="Contoh: SMP Negeri 1 Sragen" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Nomor HP Aktif</label>
              <input type="tel" required value={nomorHp} onChange={(e) => setNomorHp(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-800 text-sm bg-slate-50/50" placeholder="Contoh: 08123456789" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-2">Pilih Bagian Layanan Antrian</label>
            <div className="grid grid-cols-2 gap-3">
              <button type="button" onClick={() => handlePilihLayanan('pembuatan_akun')} className={`border rounded-xl p-3 text-left transition-all ${jenisAntrian === 'pembuatan_akun' ? 'border-blue-600 bg-blue-50/40 ring-2 ring-blue-500/20' : 'border-slate-200 hover:bg-slate-50'}`}>
                <span className="block text-xs font-bold text-slate-800">1. Pembuatan Akun</span>
                <span className="block text-[10px] text-slate-400 mt-1">Kode Antrian A</span>
              </button>

              <button type="button" onClick={() => handlePilihLayanan('verifikasi_akun')} className={`border rounded-xl p-3 text-left transition-all ${jenisAntrian === 'verifikasi_akun' ? 'border-blue-600 bg-blue-50/40 ring-2 ring-blue-500/20' : 'border-slate-200 hover:bg-slate-50'}`}>
                <span className="block text-xs font-bold text-slate-800">2. Verifikasi Berkas</span>
                <span className="block text-[10px] text-slate-400 mt-1">Kode Antrian B</span>
              </button>
            </div>
          </div>

          {jenisAntrian && (
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200/80 space-y-2.5">
              <p className="text-[11px] font-bold uppercase text-slate-500 tracking-wider">Konfirmasi Dokumen Persyaratan</p>
              {listSyarat.map((item, index) => (
                <label key={index} className="flex items-start text-xs text-slate-700 cursor-pointer select-none font-medium">
                  <input type="checkbox" checked={!!checklistDipilih[item]} onChange={() => toggleChecklist(item)} className="mt-0.5 mr-3 h-4 w-4 rounded border-slate-300 text-blue-600" />
                  <span>{item}</span>
                </label>
              ))}
            </div>
          )}

          <button type="submit" disabled={loading || !semuaTercentang || totalKuotaTerpakai >= config.kuota_harian} className={`w-full py-2.5 rounded-xl text-xs font-bold text-white tracking-wide transition-all ${semuaTercentang && !loading && totalKuotaTerpakai < config.kuota_harian ? 'bg-blue-600 hover:bg-blue-700' : 'bg-slate-300 cursor-not-allowed'}`}>
            {loading ? 'Memproses...' : 'Ambil Nomor Antrian'}
          </button>
        </form>

        <div className="border-t border-slate-100 mt-5 pt-4 text-center">
          <button onClick={() => setModeCari(true)} className="text-xs text-slate-400 font-medium hover:text-blue-600 transition-colors underline">
            Saya kehilangan tangkapan layar, cari nomor antrian saya kembali
          </button>
        </div>
      </div>

      {modeCari && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white p-6 rounded-xl max-w-sm w-full text-left shadow-2xl">
            <h3 className="font-bold text-sm text-slate-900 mb-1">Cari Nomor Antrian Aktif</h3>
            <p className="text-xs text-slate-400 mb-3">Masukkan nama lengkap Anda untuk memulihkan tampilan nomor harian Anda.</p>
            <form onSubmit={handleCariAntrian} className="space-y-3">
              <input type="text" required placeholder="Contoh: Aisha Zoya Kirana" value={namaCari} onChange={(e) => setNamaCari(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-xs text-slate-800 bg-slate-50 focus:outline-none" />
              <div className="flex gap-2 justify-end text-xs font-semibold pt-2">
                <button type="button" onClick={() => setModeCari(false)} className="px-3 py-1.5 bg-slate-100 rounded-md text-slate-600">Batal</button>
                <button type="submit" className="px-3 py-1.5 bg-blue-600 rounded-md text-white">Temukan</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}