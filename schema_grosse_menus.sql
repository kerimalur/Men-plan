-- ============================================================
-- Große Menüs – Multi-day meal prep plans
-- Run once in Supabase SQL editor
-- ============================================================

-- Multi-day batch cooking plan (e.g. "Pasta for 3 days")
CREATE TABLE IF NOT EXISTS grosse_menus (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name       TEXT NOT NULL,
  num_days   INTEGER NOT NULL DEFAULT 3,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Each meal inside a large menu (amounts = TOTALS for all days)
CREATE TABLE IF NOT EXISTS grosse_menu_meals (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  menu_id    UUID REFERENCES grosse_menus(id) ON DELETE CASCADE,
  meal_type  TEXT NOT NULL DEFAULT 'mittagessen',
  name       TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Food items in a large menu meal (amounts = TOTALS for all days)
CREATE TABLE IF NOT EXISTS grosse_menu_items (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  menu_meal_id UUID REFERENCES grosse_menu_meals(id) ON DELETE CASCADE,
  food_id      UUID REFERENCES foods(id) ON DELETE SET NULL,
  food_name    TEXT NOT NULL,
  amount       DECIMAL(8,2) NOT NULL,
  unit         TEXT NOT NULL,
  kcal         DECIMAL(8,2) NOT NULL DEFAULT 0,
  protein      DECIMAL(8,2) NOT NULL DEFAULT 0,
  cost         DECIMAL(8,4) NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);
