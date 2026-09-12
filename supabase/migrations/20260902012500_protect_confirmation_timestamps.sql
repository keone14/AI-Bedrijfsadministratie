begin;

-- Confirmation timestamps are audit evidence. A browser client must not be able to
-- claim that an invoice was approved, or a deadline completed, at an arbitrary
-- historical/future time. The database records the confirmation time itself when
-- the authenticated actor is first set and keeps it immutable afterwards.

create or replace function public.protect_invoice_approval_evidence()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.approved_by is null then
      if new.approved_at is not null then
        raise exception 'approved_at requires approved_by';
      end if;
    else
      if new.approved_by <> auth.uid() then
        raise exception 'approved_by must match authenticated user';
      end if;
      new.approved_at := now();
    end if;
    return new;
  end if;

  if old.approved_by is null and new.approved_by is not null then
    if new.approved_by <> auth.uid() then
      raise exception 'approved_by must match authenticated user';
    end if;
    new.approved_at := now();
    return new;
  end if;

  if old.approved_by is null and new.approved_by is null then
    if new.approved_at is not null then
      raise exception 'approved_at requires approved_by';
    end if;
    return new;
  end if;

  if new.approved_by is distinct from old.approved_by then
    raise exception 'approved_by cannot be changed once set';
  end if;

  if new.approved_at is distinct from old.approved_at then
    raise exception 'approved_at cannot be changed once approval is recorded';
  end if;

  return new;
end;
$$;

revoke all on function public.protect_invoice_approval_evidence() from public;

drop trigger if exists protect_invoice_approval_actor on public.invoices;
drop trigger if exists protect_invoice_approval_evidence on public.invoices;
create trigger protect_invoice_approval_evidence
before insert or update of approved_by, approved_at on public.invoices
for each row execute function public.protect_invoice_approval_evidence();

create or replace function public.protect_deadline_completion_evidence()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.completed_by is null then
      if new.completed_at is not null then
        raise exception 'completed_at requires completed_by';
      end if;
    else
      if new.completed_by <> auth.uid() then
        raise exception 'completed_by must match authenticated user';
      end if;
      new.completed_at := now();
    end if;
    return new;
  end if;

  if old.completed_by is null and new.completed_by is not null then
    if new.completed_by <> auth.uid() then
      raise exception 'completed_by must match authenticated user';
    end if;
    new.completed_at := now();
    return new;
  end if;

  if old.completed_by is null and new.completed_by is null then
    if new.completed_at is not null then
      raise exception 'completed_at requires completed_by';
    end if;
    return new;
  end if;

  if new.completed_by is distinct from old.completed_by then
    raise exception 'completed_by cannot be changed once set';
  end if;

  if new.completed_at is distinct from old.completed_at then
    raise exception 'completed_at cannot be changed once completion is recorded';
  end if;

  return new;
end;
$$;

revoke all on function public.protect_deadline_completion_evidence() from public;

drop trigger if exists protect_deadline_completion_actor on public.deadlines;
drop trigger if exists protect_deadline_completion_evidence on public.deadlines;
create trigger protect_deadline_completion_evidence
before insert or update of completed_by, completed_at on public.deadlines
for each row execute function public.protect_deadline_completion_evidence();

commit;
