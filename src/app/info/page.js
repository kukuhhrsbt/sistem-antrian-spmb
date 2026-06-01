'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

export default function InfoEstimasiAntrian() {
  const [daftarAntrian, setDaftarAntrian] = useState([]);
  const tglSekarang = new Date().toISOString().split('T')[0];

  const fetchDaftarAntrian = async () => {
    const { data } = await supabase
      .from('antrian')
      .select('*')
      .eq('tanggal', tglSekarang);
    if (data) setDaftarAntrian(data);
  };

  useEffect(() => {
    fetchDaftarAntrian();
    const channel = supabase.channel('info_publik_rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'antrian' }, () => {
        fetchDaftarAntrian();
      })
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, []);

  const antrianA = daftarAntrian.filter(a => a.jenis_antrian === 'pembuatan_akun');
  const selesaiA = antrianA.filter(a => a.status === 'selesai').length;
  const menungguA = antrianA.filter(a => a.status === 'menunggu').length; 
  const dipanggilA = antrianA.find(a => a.status === 'dipanggil');

  const antrianB = daftarAntrian.filter(a => a.jenis_antrian === 'verifikasi_akun');
  const selesaiB = antrianB.filter(a => a.status === 'selesai').length;
  const menungguB = antrianB.filter(a => a.status === 'menunggu').length;
  const dipanggilB = antrianB.find(a => a.status === 'dipanggil');

  const formatEstimasiWaktu = (totalMenit) => {
    if (totalMenit === 0) return '0 Menit';
    if (totalMenit < 60) return `${totalMenit} Menit`;
    const jam = Math.floor(totalMenit / 60);
    const sisaMenit = totalMenit % 60;
    return sisaMenit > 0 ? `${jam} Jam ${sisaMenit} Menit` : `${jam} Jam`;
  };

  const CardLoket = ({ title, total, selesai, menunggu, dipanggil, warnaBg, warnaText, jumlahKomputer }) => {
    const estimasiMenit = Math.ceil(menunggu / jumlahKomputer) * 10;
    
    return (
      <div className="bg-white rounded-2xl shadow-xl border border-slate-100 overflow-hidden">
        <div className={`${warnaBg} text-white p-4 text-center font-black tracking-wide`}>
          {title}
        </div>
        <div className="p-6 space-y-6">
          <div className="text-center">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Sedang Dilayani</p>
            <div className={`text-5xl font-black ${warnaText}`}>
              {dipanggil ? dipanggil.nomor_antrian : '---'}
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-4 border-t border-slate-100 pt-4">
            <div className="bg-slate-50 p-3 rounded-xl text-center">
              <p className="text-[10px] font-bold text-slate-500 mb-1">Total Pendaftar</p>
              <h3 className="text-xl font-black text-slate-800">{total.length}</h3>
            </div>
            <div className="bg-emerald-50 p-3 rounded-xl text-center">
              <p className="text-[10px] font-bold text-emerald-600 mb-1">Sudah Dilayani</p>
              <h3 className="text-xl font-black text-emerald-700">{selesai}</h3>
            </div>
          </div>

          <div className="bg-amber-50 p-4 rounded-xl border border-amber-100 flex flex-col items-center gap-1">
            <p className="text-xs font-bold text-amber-800 uppercase tracking-wider">Estimasi Waktu Tunggu</p>
            <h3 className="text-2xl font-black text-amber-600">± {formatEstimasiWaktu(estimasiMenit)}</h3>
          </div>
        </div>
      </div>
    );
  };

  return (
    <main className="min-h-screen bg-slate-50 p-4 md:p-8 font-sans antialiased text-slate-800">
      <div className="max-w-4xl mx-auto space-y-8">
        <div className="text-center space-y-2 bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
          <h1 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight">Estimasi Waktu Pelayanan</h1>
          <p className="text-sm font-bold text-blue-600 uppercase tracking-widest">SPMB SMA Negeri 3 Sragen</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <CardLoket 
            title="LOKET A: PEMBUATAN AKUN" 
            total={antrianA} 
            selesai={selesaiA} 
            menunggu={menungguA} 
            dipanggil={dipanggilA} 
            warnaBg="bg-blue-600" 
            warnaText="text-blue-600"
            jumlahKomputer={4} 
          />
          <CardLoket 
            title="LOKET B: VERIFIKASI BERKAS" 
            total={antrianB} 
            selesai={selesaiB} 
            menunggu={menungguB} 
            dipanggil={dipanggilB} 
            warnaBg="bg-emerald-600" 
            warnaText="text-emerald-600"
            jumlahKomputer={4} 
          />
        </div>
      </div>
    </main>
  );
}