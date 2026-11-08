-- The worker rebuilds derived leaderboard rows inside the projection transaction.
GRANT DELETE ON TABLE public.class_leaderboard_entries, public.pvp_best_records,
  public.pvp_leaderboard_entries TO numora_main_runtime;
