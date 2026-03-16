-- Migration 011: Add missing credit columns to anime table
ALTER TABLE anime
ADD COLUMN IF NOT EXISTS original_work VARCHAR(255) AFTER premiere_date,
ADD COLUMN IF NOT EXISTS cast JSON AFTER original_work;
