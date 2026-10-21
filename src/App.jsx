import React, { useState, useEffect } from 'react';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = 'https://kywnmjiweynyobkfvsex.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_3KVBLDNlHZOekrCnmDz3Cg_9P7pWgRG';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export default function App() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');

  const [vehicles, setVehicles] = useState([]);
  const [reservations, setReservations] = useState([]);
  const [receipts, setReceipts] = useState([]);
  const [newCar, setNewCar] = useState({ vin_chasis: '', marca: 'Toyota', modelo: '', anio: 2020, color: '', precio: '', imagen_url: '' });

  const [selectedCar, setSelectedCar] = useState(null);
  const [clienteNombre, setClienteNombre] = useState('');
  const [clienteDoc, setClienteDoc] = useState('');
  const [horasReserva, setHorasReserva] = useState(48);

  const [selectedReservation, setSelectedReservation] = useState(null);
  const [monto, setMonto] = useState('');
  const [banco, setBanco] = useState('');
  const [nroComprobante, setNroComprobante] = useState('');
  const [archivo, setArchivo] = useState(null);
  const [uploading, setUploading] = useState(false);

  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) fetchProfileAndData(session.user.id);
      else setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) fetchProfileAndData(session.user.id);
      else { setProfile(null); setLoading(false); }
    });

    const timer = setInterval(() => {
      const now = new Date();
      setCurrentTime(now);
      checkExpiredReservations(now);
    }, 1000);

    return () => {
      subscription.unsubscribe();
      clearInterval(timer);
    };
  }, []);

  async function fetchProfileAndData(userId) {
    setLoading(true);
    const { data: prof } = await supabase.from('profiles').select('*').eq('id', userId).single();
    setProfile(prof);
    await loadAllData();
    setLoading(false);
  }

  async function loadAllData() {
    const { data: vData } = await supabase.from('vehicles').select('*').order('creado_el', { ascending: false });
    if (vData) setVehicles(vData);
    const { data: rData } = await supabase.from('reservations').select('*, profiles(nombre)').order('fecha_inicio', { ascending: false });
    if (rData) setReservations(rData);
    const { data: pData } = await supabase.from('payment_receipts').select('*, profiles!payment_receipts_vendedor_id_fkey(nombre)').order('subido_el', { ascending: false });
    if (pData) setReceipts(pData);
  }

  async function checkExpiredReservations(now) {
    if (reservations.length === 0) return;
    for (const res of reservations) {
      if (['activa', 'extendida'].includes(res.estado) && new Date(res.fecha_limite) <= now) {
        await supabase.from('reservations').update({ estado: 'vencida' }).eq('id', res.id);
        await supabase.from('vehicles').update({ estado: 'disponible' }).eq('id', res.vehicle_id);
        const penalizacionHasta = new Date(now.getTime() + 24 * 3600000).toISOString();
        await supabase.from('profiles').update({ penalizado_hasta: penalizacionHasta }).eq('id', res.vendedor_id);
        loadAllData();
      }
    }
  }

  async function handleLogin(e) {
    e.preventDefault();
    setAuthError('');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setAuthError('Correo o contraseña incorrectos.');
  }

  async function handleCreateVehicle(e) {
    e.preventDefault();
    const { error } = await supabase.from('vehicles').insert([{
      ...newCar, precio: parseFloat(newCar.precio), anio: parseInt(newCar.anio),
      estado: 'en_taller_logistica', publicado_para_venta: false, creado_por: profile.id
    }]);
    if (error) alert('Error: ' + error.message);
    else {
      setNewCar({ vin_chasis: '', marca: 'Toyota', modelo: '', anio: 2020, color: '', precio: '', imagen_url: '' });
      loadAllData();
      alert('Vehículo guardado en Stock Interno.');
    }
  }

  async function handlePublishVehicle(carId) {
    await supabase.from('vehicles').update({ publicado_para_venta: true, estado: 'disponible' }).eq('id', carId);
    loadAllData();
  }

  async function handleCreateReservation(e) {
    e.preventDefault();
    if (!selectedCar) return;

    if (profile.penalizado_hasta && new Date(profile.penalizado_hasta) > currentTime) {
      const diffMs = new Date(profile.penalizado_hasta) - currentTime;
      const horasRestantes = Math.ceil(diffMs / 3600000);
      return alert(`🚫 Estás penalizado por dejar caer una reserva anterior. No puedes reservar por ${horasRestantes} hora(s) más.`);
    }

    const limite = new Date(Date.now() + horasReserva * 3600000).toISOString();
    const { error } = await supabase.from('reservations').insert([{
      vehicle_id: selectedCar.id, vendedor_id: profile.id, cliente_nombre: clienteNombre,
      cliente_doc: clienteDoc, fecha_limite: limite, estado: 'activa'
    }]);

    if (error) return alert('Error al reservar: ' + error.message);
    await supabase.from('vehicles').update({ estado: 'reservado' }).eq('id', selectedCar.id);
    
    setSelectedCar(null); setClienteNombre(''); setClienteDoc('');
    loadAllData();
    alert('¡Vehículo reservado con éxito!');
  }

  async function handleUploadReceipt(e) {
    e.preventDefault();
    if (!archivo) return alert('Adjuntá el comprobante.');
    setUploading(true);
    const ext = archivo.name.split('.').pop();
    const fileName = `recibo_${selectedReservation.id}_${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage.from('comprobantes-transferencia').upload(fileName, archivo);
    if (upErr) { setUploading(false); return alert('Error al subir: ' + upErr.message); }
    const { data: urlData } = supabase.storage.from('comprobantes-transferencia').getPublicUrl(fileName);

    await supabase.from('payment_receipts').insert([{
      reservation_id: selectedReservation.id, vendedor_id: profile.id, monto_transferido: parseFloat(monto),
      banco_origen: banco, nro_comprobante: nroComprobante, archivo_url: urlData.publicUrl, estado: 'pendiente_revision'
    }]);
    await supabase.from('reservations').update({ estado: 'revision_pago' }).eq('id', selectedReservation.id);
    await supabase.from('vehicles').update({ estado: 'seña_en_revision' }).eq('id', selectedReservation.vehicle_id);
    setUploading(false); setSelectedReservation(null); setMonto(''); setBanco(''); setNroComprobante(''); setArchivo(null);
    loadAllData();
  }

  async function handleApproveAndExtend(receipt, diasExtra) {
    const res = reservations.find(r => r.id === receipt.reservation_id);
    if (!res) return;
    const base = new Date(res.fecha_limite) > new Date() ? new Date(res.fecha_limite) : new Date();
    const nuevaFecha = new Date(base.getTime() + diasExtra * 86400000).toISOString();
    await supabase.from('payment_receipts').update({ estado: 'acreditado', auditado_por: profile.id, auditado_el: new Date().toISOString() }).eq('id', receipt.id);
    await supabase.from('reservations').update({ fecha_limite: nuevaFecha, estado: 'extendida', extension_dias: (res.extension_dias || 0) + diasExtra }).eq('id', res.id);
    loadAllData();
  }

  async function handleReleaseOrSell(carId, nuevoEstado) {
    await supabase.from('vehicles').update({ estado: nuevoEstado }).eq('id', carId);
    if (nuevoEstado === 'disponible') {
      await supabase.from('reservations').update({ estado: 'cancelada' }).eq('vehicle_id', carId).in('estado', ['activa', 'revision_pago', 'extendida']);
    }
    loadAllData();
  }

  // Nueva función para que el vendedor pueda anular su propia reserva sin penalización
  async function handleCancelMyReservation(reservationId, carId) {
    if (!confirm('¿Estás seguro de anular esta reserva? El vehículo volverá a estar disponible.')) return;
    await supabase.from('reservations').update({ estado: 'cancelada_por_vendedor' }).eq('id', reservationId);
    await supabase.from('vehicles').update({ estado: 'disponible' }).eq('id', carId);
    loadAllData();
    alert('Reserva anulada correctamente. El vehículo ya está disponible.');
  }

  function formatTimeRemaining(fechaLimite) {
    const diff = new Date(fechaLimite) - currentTime;
    if (diff <= 0) return '⏰ RESERVA VENCIDA (CAÍDA)';
    const d = Math.floor(diff / 86400000);
    const h = Math.floor((diff / 3600000) % 24);
    const m = Math.floor((diff / 60000) % 60);
    const s = Math.floor((diff / 1000) % 60);
    return d > 0 ? `${d}d ${h}h ${m}m ${s}s restantes` : `${h}h ${m}m ${s}s restantes`;
  }

  if (loading) return <div style={{ padding: 40, textAlign: 'center', fontFamily: 'sans-serif' }}>Cargando sistema...</div>;

  if (!session || !profile) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0f172a', fontFamily: 'sans-serif' }}>
        <form onSubmit={handleLogin} style={{ background: '#fff', padding: 32, borderRadius: 12, width: 340 }}>
          <h2 style={{ margin: '0 0 8px' }}>🚗 GS Import Export</h2>
          <p style={{ margin: '0 0 20px', color: '#64748b', fontSize: 14 }}>Sistema de Stock y Reservas</p>
          {authError && <div style={{ background: '#fee2e2', color: '#b91c1c', padding: 10, borderRadius: 6, marginBottom: 12, fontSize: 13 }}>{authError}</div>}
          <input type="email" placeholder="Correo electrónico" value={email} onChange={e => setEmail(e.target.value)} required style={{ width: '100%', padding: 10, marginBottom: 12, boxSizing: 'border-box' }} />
          <input type="password" placeholder="Contraseña" value={password} onChange={e => setPassword(e.target.value)} required style={{ width: '100%', padding: 10, marginBottom: 18, boxSizing: 'border-box' }} />
          <button type="submit" style={{ width: '100%', padding: 12, background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, fontWeight: 600, cursor: 'pointer' }}>Ingresar</button>
        </form>
      </div>
    );
  }

  const estaCastigado = profile.penalizado_hasta && new Date(profile.penalizado_hasta) > currentTime;

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', fontFamily: 'sans-serif', color: '#0f172a' }}>
      <header style={{ background: '#0f172a', color: '#fff', padding: '14px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <strong>🚗 GS Import Export — Reservas</strong>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 13, background: '#1e293b', padding: '6px 12px', borderRadius: 20 }}>👤 {profile.nombre} ({profile.rol.toUpperCase()})</span>
          <button onClick={() => supabase.auth.signOut()} style={{ background: '#ef4444', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: 6, cursor: 'pointer' }}>Salir</button>
        </div>
      </header>

      <div style={{ maxWidth: 1100, margin: '24px auto', padding: '0 16px' }}>
        {estaCastigado && (
          <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', color: '#b91c1c', padding: 14, borderRadius: 8, marginBottom: 20, fontWeight: 600 }}>
            🚫 Tienes una penalización activa por dejar vencer una reserva anterior. No podrás realizar nuevas reservas hasta que transcurran las 24 horas de castigo.
          </div>
        )}

        {(profile.rol === 'stock_manager' || profile.rol === 'admin') && (
          <div style={{ background: '#fff', padding: 18, borderRadius: 10, marginBottom: 24, border: '1px solid #e2e8f0' }}>
            <h3 style={{ marginTop: 0 }}>📦 Cargar Vehículo a Stock Interno</h3>
            <form onSubmit={handleCreateVehicle} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10 }}>
              <input placeholder="Chasis / VIN" value={newCar.vin_chasis} onChange={e => setNewCar({...newCar, vin_chasis: e.target.value})} required style={{ padding: 8 }} />
              <input placeholder="Marca" value={newCar.marca} onChange={e => setNewCar({...newCar, marca: e.target.value})} required style={{ padding: 8 }} />
              <input placeholder="Modelo" value={newCar.modelo} onChange={e => setNewCar({...newCar, modelo: e.target.value})} required style={{ padding: 8 }} />
              <input type="number" placeholder="Año" value={newCar.anio} onChange={e => setNewCar({...newCar, anio: e.target.value})} required style={{ padding: 8 }} />
              <input placeholder="Color" value={newCar.color} onChange={e => setNewCar({...newCar, color: e.target.value})} required style={{ padding: 8 }} />
              <input type="number" placeholder="Precio ($)" value={newCar.precio} onChange={e => setNewCar({...newCar, precio: e.target.value})} required style={{ padding: 8 }} />
              <input placeholder="URL de la Foto (Link)" value={newCar.imagen_url} onChange={e => setNewCar({...newCar, imagen_url: e.target.value})} style={{ padding: 8 }} />
              <button type="submit" style={{ background: '#0f172a', color: '#fff', border: 'none', borderRadius: 6, padding: 8, cursor: 'pointer', fontWeight: 600, gridColumn: '1 / -1' }}>+ Guardar Vehículo</button>
            </form>
          </div>
        )}

        <h3>🚗 Catálogo ({vehicles.length})</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
          {vehicles.map(car => {
            const activeRes = reservations.find(r => r.vehicle_id === car.id && ['activa', 'revision_pago', 'extendida'].includes(r.estado));
            return (
              <div key={car.id} style={{ background: '#fff', borderRadius: 10, overflow: 'hidden', border: '1px solid #e2e8f0' }}>
                {car.imagen_url ? (
                  <img src={car.imagen_url} alt={car.modelo} style={{ width: '100%', height: 160, objectFit: 'cover' }} />
                ) : (
                  <div style={{ width: '100%', height: 120, background: '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b', fontSize: 13 }}>Sin Fotografía</div>
                )}
                <div style={{ padding: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#64748b' }}>
                    <span>VIN: {car.vin_chasis}</span>
                    <strong style={{ color: car.estado === 'reservado' ? '#d97706' : '#16a34a' }}>{car.estado.toUpperCase().replaceAll('_', ' ')}</strong>
                  </div>
                  <h4 style={{ margin: '6px 0' }}>{car.marca} {car.modelo} ({car.anio})</h4>
                  <p style={{ margin: '0 0 12px', fontSize: 14 }}>Color: {car.color} — <strong>${car.precio.toLocaleString()}</strong></p>

                  {activeRes && (
                    <div style={{ background: '#fffbeb', border: '1px solid #fde68a', padding: 10, borderRadius: 8, fontSize: 13, marginBottom: 12 }}>
                      <div><strong>Vendedor:</strong> {activeRes.profiles?.nombre}</div>
                      <div><strong>Cliente:</strong> {activeRes.cliente_nombre}</div>
                      <div style={{ color: '#dc2626', fontWeight: 700, marginTop: 4 }}>⏱ {formatTimeRemaining(activeRes.fecha_limite)}</div>
                    </div>
                  )}

                  {profile.rol === 'admin' && !car.publicado_para_venta && (
                    <button onClick={() => handlePublishVehicle(car.id)} style={{ width: '100%', padding: 10, background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}>🚀 Habilitar Venta</button>
                  )}
                  {car.estado === 'disponible' && car.publicado_para_venta && profile.rol !== 'stock_manager' && (
                    <button 
                      onClick={() => setSelectedCar(car)} 
                      disabled={estaCastigado}
                      style={{ width: '100%', padding: 10, background: estaCastigado ? '#94a3b8' : '#0f172a', color: '#fff', border: 'none', borderRadius: 6, cursor: estaCastigado ? 'not-allowed' : 'pointer' }}
                    >
                      {estaCastigado ? '🚫 Bloqueado por Castigo (24h)' : '📌 Reservar'}
                    </button>
                  )}
                  
                  {/* Botón para subir comprobante */}
                  {activeRes && (activeRes.vendedor_id === profile.id || profile.rol === 'admin') && (
                    <button onClick={() => setSelectedReservation(activeRes)} style={{ width: '100%', padding: 10, marginTop: 8, background: '#d97706', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}>📎 Subir Transferencia</button>
                  )}

                  {/* Botón para que el vendedor anule su propia reserva */}
                  {activeRes && activeRes.vendedor_id === profile.id && (
                    <button onClick={() => handleCancelMyReservation(activeRes.id, car.id)} style={{ width: '100%', padding: 8, marginTop: 6, background: '#ef4444', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}>❌ Anular Reserva (Cliente se arrepintió)</button>
                  )}

                  {profile.rol === 'admin' && car.estado !== 'disponible' && (
                    <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                      <button onClick={() => handleReleaseOrSell(car.id, 'disponible')} style={{ flex: 1, padding: 8, background: '#ef4444', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}>Liberar</button>
                      <button onClick={() => handleReleaseOrSell(car.id, 'vendido')} style={{ flex: 1, padding: 8, background: '#16a34a', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}>Vendido</button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {selectedCar && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
            <form onSubmit={handleCreateReservation} style={{ background: '#fff', padding: 24, borderRadius: 10, width: 340 }}>
              <h3 style={{ marginTop: 0 }}>Reservar {selectedCar.marca} {selectedCar.modelo}</h3>
              <input placeholder="Nombre del Cliente" value={clienteNombre} onChange={e => setClienteNombre(e.target.value)} required style={{ width: '100%', padding: 8, marginBottom: 8, boxSizing: 'border-box' }} />
              <input placeholder="CI / RUC del Cliente" value={clienteDoc} onChange={e => setClienteDoc(e.target.value)} required style={{ width: '100%', padding: 8, marginBottom: 8, boxSizing: 'border-box' }} />
              <select value={horasReserva} onChange={e => setHorasReserva(Number(e.target.value))} style={{ width: '100%', padding: 8, marginBottom: 14, boxSizing: 'border-box' }}>
                <option value={24}>24 Horas de Reserva</option>
                <option value={48}>48 Horas de Reserva</option>
                <option value={72}>72 Horas de Reserva</option>
              </select>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" onClick={() => setSelectedCar(null)} style={{ flex: 1, padding: 8, cursor: 'pointer' }}>Cancelar</button>
                <button type="submit" style={{ flex: 1, padding: 8, background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}>Confirmar</button>
              </div>
            </form>
          </div>
        )}

        {selectedReservation && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
            <form onSubmit={handleUploadReceipt} style={{ background: '#fff', padding: 24, borderRadius: 10, width: 360 }}>
              <h3 style={{ marginTop: 0 }}>Subir Transferencia</h3>
              <input type="number" placeholder="Monto" value={monto} onChange={e => setMonto(e.target.value)} required style={{ width: '100%', padding: 8, marginBottom: 8, boxSizing: 'border-box' }} />
              <input placeholder="Banco" value={banco} onChange={e => setBanco(e.target.value)} required style={{ width: '100%', padding: 8, marginBottom: 8, boxSizing: 'border-box' }} />
              <input placeholder="Nro. Boleta" value={nroComprobante} onChange={e => setNroComprobante(e.target.value)} required style={{ width: '100%', padding: 8, marginBottom: 8, boxSizing: 'border-box' }} />
              <input type="file" accept=".pdf,image/*" onChange={e => setArchivo(e.target.files[0])} required style={{ marginBottom: 14, width: '100%' }} />
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" onClick={() => setSelectedReservation(null)} style={{ flex: 1, padding: 8, cursor: 'pointer' }}>Cancelar</button>
                <button type="submit" disabled={uploading} style={{ flex: 1, padding: 8, background: '#d97706', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}>{uploading ? 'Subiendo...' : 'Enviar'}</button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}