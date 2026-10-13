-- Clear only the currently authenticated user's FreshTrack inventory.
-- Account credentials and settings are deliberately preserved.
create or replace function public.freshtrack_clear_inventory(p_confirmation text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_user_id uuid := auth.uid();
  v_batches_deleted integer := 0;
  v_movements_deleted integer := 0;
  v_snapshots_deleted integer := 0;
begin
  if v_user_id is null then
    raise exception using errcode = '28000', message = 'Authentication required.';
  end if;

  if p_confirmation is distinct from 'CLEAR' then
    raise exception using errcode = '22023', message = 'Type CLEAR to confirm inventory data deletion.';
  end if;

  -- Movements reference batches, so remove this user's audit history first.
  delete from public.freshtrack_movements where user_id = v_user_id;
  get diagnostics v_movements_deleted = row_count;

  delete from public.freshtrack_batches where user_id = v_user_id;
  get diagnostics v_batches_deleted = row_count;

  -- Do not retain a cloud snapshot that could restore the deleted data.
  delete from public.freshtrack_backup_snapshots where user_id = v_user_id;
  get diagnostics v_snapshots_deleted = row_count;

  return jsonb_build_object(
    'cleared', true,
    'batchesDeleted', v_batches_deleted,
    'movementsDeleted', v_movements_deleted,
    'backupSnapshotsDeleted', v_snapshots_deleted
  );
end;
$function$;

revoke all on function public.freshtrack_clear_inventory(text) from public;
revoke all on function public.freshtrack_clear_inventory(text) from anon;
grant execute on function public.freshtrack_clear_inventory(text) to authenticated;
