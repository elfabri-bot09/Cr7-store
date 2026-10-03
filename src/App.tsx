import {createContext,useContext,useEffect,useState} from 'react'
import {BrowserRouter,Routes,Route,NavLink,Navigate} from 'react-router-dom'
import {supabase} from './supabase'
import {Ctx,useApp,bs,label} from './shared'
import {Historial,Informes,Empleados,Usuarios,Config,Traspaso} from './Extra'

const ALL=['admin','vendedor','encargado']
const inicioMes=()=>{const d=new Date();return new Date(d.getFullYear(),d.getMonth(),1).toISOString()}
const hoy=()=>{const d=new Date();d.setHours(0,0,0,0);return d.toISOString()}

export default function App(){
  const [session,setSession]=useState<any>(undefined),[profile,setProfile]=useState<any>(null)
  const [stores,setStores]=useState<any[]>([]),[store,setStore]=useState('')
  useEffect(()=>{supabase.auth.getSession().then(({data})=>setSession(data.session))
    const {data:l}=supabase.auth.onAuthStateChange((_e,s)=>setSession(s));return()=>l.subscription.unsubscribe()},[])
  useEffect(()=>{if(!session){setProfile(null);return}
    supabase.from('profiles').select('*').eq('id',session.user.id).single().then(({data})=>{setProfile(data);if(data?.store_id)setStore(data.store_id)})
    supabase.from('stores').select('*').eq('activa',true).then(({data})=>{setStores(data||[]);setStore((s:string)=>s||data?.[0]?.id||'')})},[session])
  if(session===undefined)return <p className="c">Cargando…</p>
  if(!session)return <Login/>
  if(!profile)return <p className="c">Cargando perfil…</p>
  const rol=profile.rol
  const links=[['/','Inicio',ALL],['/venta','Nueva venta',['admin','vendedor']],['/ventas','Historial',['admin','vendedor']],['/productos','Productos',['admin','encargado']],['/inventario','Inventario',ALL],['/compras','Compras',['admin','encargado']],['/gastos','Gastos',['admin']],['/informes','Informes',['admin']],['/empleados','Sueldos',['admin']],['/usuarios','Usuarios',['admin']],['/config','Tiendas',['admin']]]
  const guard=(roles:string[],el:any)=>roles.includes(rol)?el:<Navigate to="/"/>
  return <Ctx.Provider value={{profile,store,rol,stores}}><BrowserRouter><div className="app">
    <nav><b>Mi tienda</b>{links.filter(l=>(l[2] as string[]).includes(rol)).map(l=><NavLink key={l[0] as string} to={l[0] as string} end>{l[1] as string}</NavLink>)}
      <a href="#" onClick={e=>{e.preventDefault();supabase.auth.signOut()}}>Salir</a></nav>
    <main>
      <div className="top"><span>{profile.nombre} · {rol}</span>
        {rol==='admin'?<select value={store} onChange={e=>setStore(e.target.value)}>{stores.map(s=><option key={s.id} value={s.id}>{s.nombre}</option>)}</select>:<span>{stores.find(s=>s.id===store)?.nombre}</span>}</div>
      {!store?<p className="err">Tu usuario no tiene tienda asignada. Pide al administrador que la asigne.</p>:
      <Routes key={store}><Route path="/" element={<Inicio/>}/>
        <Route path="/venta" element={guard(['admin','vendedor'],<Venta/>)}/>
        <Route path="/productos" element={guard(['admin','encargado'],<Productos/>)}/>
        <Route path="/inventario" element={<Inventario/>}/>
        <Route path="/compras" element={guard(['admin','encargado'],<Compras/>)}/>
        <Route path="/gastos" element={guard(['admin'],<Gastos/>)}/>
        <Route path="/ventas" element={guard(['admin','vendedor'],<Historial/>)}/>
        <Route path="/informes" element={guard(['admin'],<Informes/>)}/>
        <Route path="/empleados" element={guard(['admin'],<Empleados/>)}/>
        <Route path="/usuarios" element={guard(['admin'],<Usuarios/>)}/>
        <Route path="/config" element={guard(['admin'],<Config/>)}/>
        <Route path="*" element={<Navigate to="/"/>}/></Routes>}
    </main></div></BrowserRouter></Ctx.Provider>
}

function Login(){
  const [email,setE]=useState(''),[pass,setP]=useState(''),[err,setErr]=useState('')
  const go=async()=>{const {error}=await supabase.auth.signInWithPassword({email,password:pass});if(error)setErr('Correo o contraseña incorrectos')}
  return <div className="login"><h1>Ingresar</h1><input placeholder="Correo" value={email} onChange={e=>setE(e.target.value)}/>
    <input type="password" placeholder="Contraseña" value={pass} onChange={e=>setP(e.target.value)} onKeyDown={e=>e.key==='Enter'&&go()}/>
    <button className="y" onClick={go}>Entrar</button><span className="err">{err}</span></div>
}

function Inicio(){
  const {store,rol}=useApp(); const [d,setD]=useState<any>({})
  useEffect(()=>{(async()=>{
    const v=await supabase.from('sales').select('total,fecha').eq('store_id',store).eq('estado','confirmada').gte('fecha',inicioMes())
    const h=(v.data||[]).filter((s:any)=>s.fecha>=hoy())
    const st=await supabase.from('variant_stock').select('cantidad,product_variants(stock_minimo)').eq('store_id',store)
    const ex=rol==='admin'?await supabase.from('expenses').select('monto').eq('store_id',store).gte('fecha',inicioMes().slice(0,10)):{data:[]}
    const sum=(a:any[],k:string)=>a.reduce((t,x)=>t+Number(x[k]),0)
    setD({hoyT:sum(h,'total'),hoyN:h.length,mes:sum(v.data||[],'total'),gas:sum(ex.data||[],'monto'),
      bajo:(st.data||[]).filter((x:any)=>x.cantidad>0&&x.cantidad<=x.product_variants.stock_minimo).length,ago:(st.data||[]).filter((x:any)=>x.cantidad===0).length})})()},[store])
  return <><h1>Inicio</h1><div className="k">
    <div><small>Vendido hoy</small><strong>{bs(d.hoyT)}</strong></div><div><small>Ventas hoy</small><strong>{d.hoyN??0}</strong></div>
    <div><small>Ventas del mes</small><strong>{bs(d.mes)}</strong></div>
    <div><small>Stock bajo</small><strong>{d.bajo??0}</strong></div><div><small>Agotados</small><strong>{d.ago??0}</strong></div>
    {rol==='admin'&&<><div><small>Gastos del mes</small><strong>{bs(d.gas)}</strong></div><div><small>Resultado del mes (ventas − gastos)</small><strong>{bs((d.mes||0)-(d.gas||0))}</strong></div></>}</div></>
}

function Venta(){
  const {store}=useApp(); const [items,setItems]=useState<any[]>([]),[q,setQ]=useState(''),[cart,setCart]=useState<any[]>([])
  const [desc,setDesc]=useState(0),[pagos,setPagos]=useState<any[]>([{metodo:'efectivo',monto:''}]),[msg,setMsg]=useState('')
  const load=()=>supabase.from('variant_stock').select('cantidad,product_variants(id,sku,atributos,precio_venta,products(nombre))').eq('store_id',store).gt('cantidad',0).then(({data})=>setItems(data||[]))
  useEffect(()=>{load()},[store])
  const total=cart.reduce((t,c)=>t+c.cantidad*c.precio,0)-Number(desc||0)
  const add=(s:any)=>{const v=s.product_variants;setCart(c=>c.find(x=>x.variant_id===v.id)?c:[...c,{variant_id:v.id,nombre:label(v),cantidad:1,precio:v.precio_venta,max:s.cantidad}])}
  const upd=(i:number,k:string,val:any)=>setCart(c=>c.map((x,j)=>j===i?{...x,[k]:val}:x))
  const confirmar=async()=>{setMsg('')
    const p=pagos.length===1?[{metodo:pagos[0].metodo,monto:total}]:pagos.map(x=>({metodo:x.metodo,monto:Number(x.monto)}))
    const {error}=await supabase.rpc('create_sale',{p_store:store,p_items:cart.map(c=>({variant_id:c.variant_id,cantidad:Number(c.cantidad),precio:Number(c.precio)})),p_pagos:p,p_descuento:Number(desc||0),p_obs:null})
    if(error)setMsg('No se pudo vender: '+error.message);else{setMsg('Venta registrada');setCart([]);setDesc(0);setPagos([{metodo:'efectivo',monto:''}]);load()}}
  const shown=items.filter(s=>label(s.product_variants).toLowerCase().includes(q.toLowerCase())).slice(0,30)
  return <><h1>Nueva venta</h1><input style={{width:'100%'}} placeholder="Buscar por producto, equipo, jugador, talla, código…" value={q} onChange={e=>setQ(e.target.value)}/>
    <table><tbody>{shown.map(s=><tr key={s.product_variants.id}><td>{label(s.product_variants)}</td><td>{bs(s.product_variants.precio_venta)}</td><td>{s.cantidad} disp.</td><td><button className="s" onClick={()=>add(s)}>Agregar</button></td></tr>)}</tbody></table>
    <h2>Carrito</h2>{cart.length===0&&<p>Agrega productos para vender.</p>}
    {cart.map((c,i)=><div className="row" key={c.variant_id}><span>{c.nombre}</span><input type="number" min={1} max={c.max} value={c.cantidad} onChange={e=>upd(i,'cantidad',e.target.value)}/>
      <input type="number" value={c.precio} onChange={e=>upd(i,'precio',e.target.value)}/><button className="s" onClick={()=>setCart(cart.filter((_,j)=>j!==i))}>Quitar</button></div>)}
    {cart.length>0&&<div className="box"><div className="row"><label>Descuento (Bs)<input type="number" value={desc} onChange={e=>setDesc(e.target.value as any)}/></label></div>
      <h2>Total: {bs(total)}</h2>
      {pagos.map((p,i)=><div className="row" key={i}><select value={p.metodo} onChange={e=>setPagos(pagos.map((x,j)=>j===i?{...x,metodo:e.target.value}:x))}>{['efectivo','qr','transferencia','tarjeta'].map(m=><option key={m}>{m}</option>)}</select>
        {pagos.length>1&&<input type="number" placeholder="Monto" value={p.monto} onChange={e=>setPagos(pagos.map((x,j)=>j===i?{...x,monto:e.target.value}:x))}/>}</div>)}
      <button className="s" onClick={()=>setPagos([...pagos,{metodo:'qr',monto:''}])}>Pago mixto: agregar otra forma de pago</button>{' '}
      <button className="y" onClick={confirmar}>Confirmar venta</button></div>}
    <p className={msg.startsWith('No')?'err':''}>{msg}</p></>
}

function Inventario(){
  const {store}=useApp(); const [rows,setRows]=useState<any[]>([]),[q,setQ]=useState('')
  useEffect(()=>{supabase.from('variant_stock').select('cantidad,product_variants(id,sku,atributos,stock_minimo,products(nombre))').eq('store_id',store).then(({data})=>setRows(data||[]))},[store])
  return <><h1>Inventario</h1><input placeholder="Buscar…" value={q} onChange={e=>setQ(e.target.value)}/>
    <table><thead><tr><th>Producto</th><th>Stock</th></tr></thead><tbody>{rows.filter(r=>label(r.product_variants).toLowerCase().includes(q.toLowerCase())).map(r=>
      <tr key={r.product_variants.id}><td>{label(r.product_variants)}</td><td className={r.cantidad<=r.product_variants.stock_minimo?'low':''}>{r.cantidad}{r.cantidad===0?' (agotado)':r.cantidad<=r.product_variants.stock_minimo?' (bajo)':''}</td></tr>)}</tbody></table><Traspaso rows={rows}/></>
}

function Productos(){
  const [cats,setCats]=useState<any[]>([]),[vars,setVars]=useState<any[]>([]),[msg,setMsg]=useState('')
  const [cn,setCn]=useState(''),[cc,setCc]=useState(''),[f,setF]=useState<any>({atr:{}})
  const load=()=>{supabase.from('categories').select('*').order('nombre').then(({data})=>setCats(data||[]))
    supabase.from('product_variants').select('id,sku,atributos,precio_compra,precio_venta,products(nombre)').order('created_at',{ascending:false}).limit(50).then(({data})=>setVars(data||[]))}
  useEffect(load,[])
  const cat=cats.find(c=>c.id===f.cat)
  const addCat=async()=>{const {error}=await supabase.from('categories').insert({nombre:cn,caracteristicas:cc.split(',').map(s=>s.trim()).filter(Boolean)});setMsg(error?error.message:'Categoría creada');setCn('');setCc('');load()}
  const addProd=async()=>{
    let p=(await supabase.from('products').select('id').eq('nombre',f.nombre).eq('category_id',f.cat).maybeSingle()).data
    if(!p){const r=await supabase.from('products').insert({nombre:f.nombre,category_id:f.cat}).select('id').single();if(r.error)return setMsg(r.error.message);p=r.data}
    const {error}=await supabase.from('product_variants').insert({product_id:p.id,sku:f.sku||null,atributos:f.atr,precio_compra:Number(f.pc||0),precio_venta:Number(f.pv||0)})
    setMsg(error?error.message:'Producto guardado. Registra una compra para darle stock.');load()}
  return <><h1>Productos</h1>
    <div className="box"><h2>Nueva categoría</h2><div className="row"><input placeholder="Ej: Camisetas" value={cn} onChange={e=>setCn(e.target.value)}/>
      <input placeholder="Características separadas por coma: Equipo, Jugador, Talla, Color" value={cc} onChange={e=>setCc(e.target.value)}/><button onClick={addCat}>Crear categoría</button></div></div>
    <div className="box" style={{marginTop:12}}><h2>Nueva variante de producto</h2><div className="row">
      <input placeholder="Nombre del producto" onChange={e=>setF({...f,nombre:e.target.value})}/>
      <select value={f.cat||''} onChange={e=>setF({...f,cat:e.target.value,atr:{}})}><option value="">Categoría…</option>{cats.map(c=><option key={c.id} value={c.id}>{c.nombre}</option>)}</select></div>
      <div className="row">{(cat?.caracteristicas||[]).map((k:string)=><input key={k} placeholder={k} onChange={e=>setF({...f,atr:{...f.atr,[k]:e.target.value}})}/>)}</div>
      <div className="row"><input placeholder="Código / SKU" onChange={e=>setF({...f,sku:e.target.value})}/><input type="number" placeholder="Precio de compra" onChange={e=>setF({...f,pc:e.target.value})}/>
        <input type="number" placeholder="Precio de venta" onChange={e=>setF({...f,pv:e.target.value})}/><button className="y" onClick={addProd}>Guardar</button></div></div>
    <p>{msg}</p><table><thead><tr><th>Variante</th><th>Compra</th><th>Venta</th></tr></thead><tbody>{vars.map(v=><tr key={v.id}><td>{label(v)}</td><td>{bs(v.precio_compra)}</td><td>{bs(v.precio_venta)}</td></tr>)}</tbody></table></>
}

function Compras(){
  const {store}=useApp(); const [vars,setVars]=useState<any[]>([]),[sup,setSup]=useState<any[]>([]),[s,setS]=useState(''),[lines,setLines]=useState<any[]>([]),[fp,setFp]=useState('efectivo'),[msg,setMsg]=useState('')
  const load=()=>{supabase.from('product_variants').select('id,sku,atributos,precio_compra,products(nombre)').then(({data})=>setVars(data||[]));supabase.from('suppliers').select('*').then(({data})=>setSup(data||[]))}
  useEffect(load,[])
  const total=lines.reduce((t,l)=>t+l.cantidad*l.precio,0)
  const nuevoProv=async()=>{const n=prompt('Nombre del proveedor');if(n){await supabase.from('suppliers').insert({nombre:n});load()}}
  const guardar=async()=>{const {error}=await supabase.rpc('create_purchase',{p_store:store,p_supplier:s||null,p_items:lines.map(l=>({variant_id:l.id,cantidad:Number(l.cantidad),precio:Number(l.precio)})),p_forma_pago:fp,p_obs:null})
    if(error)setMsg(error.message);else{setMsg('Compra registrada. Stock actualizado.');setLines([])}}
  return <><h1>Nueva compra</h1><div className="row"><select value={s} onChange={e=>setS(e.target.value)}><option value="">Proveedor…</option>{sup.map(x=><option key={x.id} value={x.id}>{x.nombre}</option>)}</select>
    <button className="s" onClick={nuevoProv}>Nuevo proveedor</button>
    <select value="" onChange={e=>{const v=vars.find(x=>x.id===e.target.value);if(v)setLines([...lines,{id:v.id,nombre:label(v),cantidad:1,precio:v.precio_compra}])}}><option value="">Agregar producto…</option>{vars.map(v=><option key={v.id} value={v.id}>{label(v)}</option>)}</select></div>
    {lines.map((l,i)=><div className="row" key={i}><span>{l.nombre}</span><input type="number" value={l.cantidad} onChange={e=>setLines(lines.map((x,j)=>j===i?{...x,cantidad:e.target.value}:x))}/>
      <input type="number" value={l.precio} onChange={e=>setLines(lines.map((x,j)=>j===i?{...x,precio:e.target.value}:x))}/></div>)}
    {lines.length>0&&<div className="row"><h2>Total: {bs(total)}</h2><select value={fp} onChange={e=>setFp(e.target.value)}>{['efectivo','qr','transferencia','tarjeta'].map(m=><option key={m}>{m}</option>)}</select><button className="y" onClick={guardar}>Guardar compra</button></div>}
    <p>{msg}</p></>
}

function Gastos(){
  const {store,profile}=useApp(); const [rows,setRows]=useState<any[]>([]),[f,setF]=useState<any>({categoria:'Alquiler',fp:'efectivo'}),[msg,setMsg]=useState('')
  const load=()=>supabase.from('expenses').select('*').eq('store_id',store).gte('fecha',inicioMes().slice(0,10)).order('fecha',{ascending:false}).then(({data})=>setRows(data||[]))
  useEffect(()=>{load()},[store])
  const save=async()=>{const {error}=await supabase.from('expenses').insert({store_id:store,categoria:f.categoria,descripcion:f.desc,monto:Number(f.monto),forma_pago:f.fp,registrado_por:profile.id});setMsg(error?error.message:'Gasto guardado');load()}
  return <><h1>Gastos</h1><div className="row">
    <select value={f.categoria} onChange={e=>setF({...f,categoria:e.target.value})}>{['Alquiler','Luz','Agua','Internet','Transporte','Publicidad','Mantenimiento','Compras','Servicios','Otros'].map(c=><option key={c}>{c}</option>)}</select>
    <input placeholder="Descripción" onChange={e=>setF({...f,desc:e.target.value})}/><input type="number" placeholder="Monto Bs" onChange={e=>setF({...f,monto:e.target.value})}/>
    <select value={f.fp} onChange={e=>setF({...f,fp:e.target.value})}>{['efectivo','qr','transferencia','tarjeta'].map(m=><option key={m}>{m}</option>)}</select><button className="y" onClick={save}>Guardar gasto</button></div>
    <p>{msg}</p><table><tbody>{rows.map(r=><tr key={r.id}><td>{r.fecha}</td><td>{r.categoria}</td><td>{r.descripcion}</td><td>{bs(r.monto)}</td></tr>)}</tbody></table></>
}
