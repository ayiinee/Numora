-- Redis is ephemeral. Legacy schedulers must not cancel durable matches for cache failure.
CREATE OR REPLACE FUNCTION public.guard_pvp_transient_cancellation()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  IF OLD.status IN ('WAITING','READY','RUNNING') AND NEW.status = 'CANCELLED'
     AND NEW.end_reason = 'SERVICE_INTERRUPTED' THEN
    -- Abort the entire legacy cancellation transaction, including room-claim cleanup.
    RAISE EXCEPTION 'Transient queue failure cannot cancel a durable PvP match'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.guard_pvp_transient_cancellation() FROM PUBLIC;
--> statement-breakpoint
CREATE TRIGGER pvp_transient_cancellation_guard BEFORE UPDATE OF status ON public.pvp_matches
FOR EACH ROW EXECUTE FUNCTION public.guard_pvp_transient_cancellation();
