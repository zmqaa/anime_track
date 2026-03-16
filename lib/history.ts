import 'server-only';
import { query } from './db';
import { type ResultSetHeader, type RowDataPacket } from 'mysql2';

export interface WatchHistoryRecord {
  id: number;
  animeId: number;
  animeTitle: string;
  episode: number; // The episode number watched
  watchedAt: string; // ISO Date string
}

interface WatchHistoryRow extends RowDataPacket {
  id: number;
  animeId: number;
  animeTitle: string;
  episode: number;
  watchedAt: Date | string;
}

function mapRowToHistory(row: WatchHistoryRow): WatchHistoryRecord {
    return {
        id: row.id,
        animeId: row.animeId,
        animeTitle: row.animeTitle,
        episode: row.episode,
        watchedAt: row.watchedAt instanceof Date ? row.watchedAt.toISOString() : String(row.watchedAt),
    };
}

export async function getWatchHistory(limit = 1000): Promise<WatchHistoryRecord[]> {
  const rows = await query<WatchHistoryRow[]>('SELECT * FROM watch_history ORDER BY watchedAt DESC LIMIT ?', [String(limit)]);
  return rows.map(mapRowToHistory);
}

export async function getWatchHistorySince(since: Date, limit = 1000): Promise<WatchHistoryRecord[]> {
  const rows = await query<WatchHistoryRow[]>(
    'SELECT * FROM watch_history WHERE watchedAt >= ? ORDER BY watchedAt DESC LIMIT ?',
    [since, String(limit)]
  );
  return rows.map(mapRowToHistory);
}

export async function addWatchHistory(animeId: number, animeTitle: string, episode: number, date?: Date): Promise<WatchHistoryRecord> {
  const watchedAt = (date || new Date()); // Date object is fine for mysql2
  const sql = `
    INSERT INTO watch_history (animeId, animeTitle, episode, watchedAt)
    VALUES (?, ?, ?, ?)
  `;
  
  const result = await query<ResultSetHeader>(sql, [animeId, animeTitle, episode, watchedAt]);
  
  const newRecord = await query<WatchHistoryRow[]>('SELECT * FROM watch_history WHERE id = ?', [result.insertId]);
  return mapRowToHistory(newRecord[0]);
}

export async function addBatchWatchHistory(animeId: number, animeTitle: string, startEpisode: number, endEpisode: number, date?: Date): Promise<void> {
    if (startEpisode > endEpisode) return;
    
  const watchedAt = date || new Date();
    const values: unknown[] = [];
    const placeholders: string[] = [];
    
    for (let ep = startEpisode; ep <= endEpisode; ep++) {
        placeholders.push('(?, ?, ?, ?)');
        values.push(animeId, animeTitle, ep, watchedAt);
    }
    
    const sql = `
      INSERT INTO watch_history (animeId, animeTitle, episode, watchedAt)
      VALUES ${placeholders.join(', ')}
    `;
    
    await query(sql, values);
}

export async function deleteWatchHistoryByAnime(animeId: number): Promise<void> {
    await query('DELETE FROM watch_history WHERE animeId = ?', [animeId]);
}
