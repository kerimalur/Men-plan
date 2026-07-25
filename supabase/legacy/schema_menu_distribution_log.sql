-- Track which grosse Menüs were distributed to which dates
-- Run this in the Supabase SQL editor

CREATE TABLE IF NOT EXISTS menu_distribution_log (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  menu_id    UUID NOT NULL REFERENCES grosse_menus(id) ON DELETE CASCADE,
  date       DATE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_menu_dist_log_menu ON menu_distribution_log(menu_id);
CREATE INDEX IF NOT EXISTS idx_menu_dist_log_date ON menu_distribution_log(date);
