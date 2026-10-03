-- PASO EXTRA: pega este archivo en Supabase > SQL Editor > Run (después de 1_schema.sql)
alter table employees add column if not exists profile_id uuid references profiles;
alter table sales add column if not exists anulada_motivo text;

create or replace function anular_venta(p_sale uuid,p_motivo text) returns void language plpgsql security definer set search_path=public as $$
declare r record; v_store uuid;
begin
 if my_role()<>'admin' then raise exception 'Solo el administrador puede anular'; end if;
 select store_id into v_store from sales where id=p_sale and estado='confirmada';
 if v_store is null then raise exception 'La venta no existe o ya está anulada'; end if;
 for r in select variant_id,cantidad from sale_items where sale_id=p_sale loop
  insert into variant_stock(variant_id,store_id,cantidad) values(r.variant_id,v_store,r.cantidad) on conflict(variant_id,store_id) do update set cantidad=variant_stock.cantidad+excluded.cantidad;
  insert into inventory_movements(variant_id,store_id,tipo,cantidad,sale_id,motivo,usuario_id) values(r.variant_id,v_store,'anulacion',r.cantidad,p_sale,p_motivo,auth.uid());
 end loop;
 update sales set estado='anulada',anulada_motivo=p_motivo where id=p_sale;
end$$;

create or replace function traspasar(p_from uuid,p_to uuid,p_variant uuid,p_cant int) returns void language plpgsql security definer set search_path=public as $$
begin
 if my_role() not in('admin','encargado') then raise exception 'Sin permiso'; end if;
 if my_role()<>'admin' and p_from<>my_store() then raise exception 'Tienda no permitida'; end if;
 if p_cant<=0 or p_from=p_to or p_to is null then raise exception 'Datos inválidos'; end if;
 update variant_stock set cantidad=cantidad-p_cant where variant_id=p_variant and store_id=p_from;
 if not found then raise exception 'Sin stock en la tienda de origen'; end if;
 insert into variant_stock(variant_id,store_id,cantidad) values(p_variant,p_to,p_cant) on conflict(variant_id,store_id) do update set cantidad=variant_stock.cantidad+excluded.cantidad;
 insert into inventory_movements(variant_id,store_id,tipo,cantidad,motivo,usuario_id) values(p_variant,p_from,'traspaso',-p_cant,'Traspaso a otra tienda',auth.uid()),(p_variant,p_to,'traspaso',p_cant,'Traspaso desde otra tienda',auth.uid());
end$$;
