-- Migration 011: Add missing credit columns to anime table
ALTER TABLE anime
ADD COLUMN studio VARCHAR(255) AFTER premiere_date,
ADD COLUMN director VARCHAR(255) AFTER studio,
ADD COLUMN original_work VARCHAR(255) AFTER director,
ADD COLUMN cast JSON AFTER original_work;
