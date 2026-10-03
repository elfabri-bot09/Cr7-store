-- PASO 3: cambia el correo por el del usuario que creaste en Authentication y pulsa Run
insert into profiles(id,nombre,rol,store_id)
select id,email,'admin',(select id from stores order by nombre limit 1) from auth.users where email='TU_CORREO@ejemplo.com'
on conflict(id) do update set rol='admin',store_id=(select id from stores order by nombre limit 1);
