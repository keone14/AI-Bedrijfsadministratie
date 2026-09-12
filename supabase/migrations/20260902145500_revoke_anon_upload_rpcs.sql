begin;

revoke all on function public.discard_unregistered_upload(text) from public, anon;
grant execute on function public.discard_unregistered_upload(text) to authenticated;

revoke all on function public.register_validated_invoice_upload(uuid, uuid, text, text, text, text, text, bigint) from public, anon;
grant execute on function public.register_validated_invoice_upload(uuid, uuid, text, text, text, text, text, bigint) to authenticated;

commit;
