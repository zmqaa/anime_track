import 'server-only';
import { query } from './db';
import { type ResultSetHeader, type RowDataPacket } from 'mysql2';
import { parseJsonStringArray } from './anime-cast';

// Anime Status: watching, completed, dropped, plan_to_watch
export type AnimeStatus = 'watching' | 'completed' | 'dropped' | 'plan_to_watch';

export interface AnimeRecord {
  id: number;
  title: string;
  originalTitle?: string; // Japanese or original name
  coverUrl?: string; // Optional cover image
  status: AnimeStatus;
  score?: number; // 0-10
  progress: number; // Current episode
  totalEpisodes?: number; // Total episodes if known
  durationMinutes?: number; // Average duration per episode in minutes
  notes?: string;
  tags?: string[]; // New: Tags
  originalWork?: string;
  cast?: string[];
  castAliases?: string[];
  summary?: string;
  startDate?: string; // Date string YYYY-MM-DD
  endDate?: string; // Date string YYYY-MM-DD
  premiereDate?: string; // Date string YYYY-MM-DD
  isFinished?: boolean; // New: Whether the anime itself is finished airing
  createdAt: string;
  updatedAt: string;
}

export interface CreateAnimeDTO {
  title: string;
  originalTitle?: string;
  coverUrl?: string;
  status: AnimeStatus;
  score?: number;
  progress: number;
  totalEpisodes?: number;
  durationMinutes?: number;
  notes?: string;
  tags?: string[];
  originalWork?: string;
  cast?: string[];
  castAliases?: string[];
  summary?: string;
  startDate?: string;
  endDate?: string;
  premiereDate?: string;
  isFinished?: boolean;
}

interface AnimeRow extends RowDataPacket {
  id: number;
  title: string;
  original_title?: string | null;
  coverUrl?: string | null;
  status: AnimeStatus;
  score?: number | string | null;
  progress: number;
  totalEpisodes?: number | null;
  durationMinutes?: number | null;
  notes?: string | null;
  tags?: string | null;
  summary?: string | null;
  start_date?: Date | string | null;
  end_date?: Date | string | null;
  premiere_date?: Date | string | null;
  original_work?: string | null;
  cast?: string | null;
  cast_aliases?: string | null;
  isFinished?: number | boolean | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}

// Helper to convert DB Row to AnimeRecord
function mapRowToAnimeRecord(row: AnimeRow): AnimeRecord {
  return {
    id: row.id,
    title: row.title,
    originalTitle: row.original_title || undefined,
    coverUrl: row.coverUrl || undefined,
    status: row.status as AnimeStatus,
    score: row.score ? Number(row.score) : undefined,
    progress: row.progress,
    originalWork: row.original_work || undefined,
    cast: parseJsonStringArray(row.cast),
    castAliases: parseJsonStringArray(row.cast_aliases),
    totalEpisodes: row.totalEpisodes || undefined,
    durationMinutes: row.durationMinutes || undefined,
    notes: row.notes || undefined,
    tags: parseJsonStringArray(row.tags),
    summary: row.summary || undefined,
    startDate: row.start_date instanceof Date ? row.start_date.toISOString().split('T')[0] : (row.start_date || undefined),
    endDate: row.end_date instanceof Date ? row.end_date.toISOString().split('T')[0] : (row.end_date || undefined),
    premiereDate: row.premiere_date instanceof Date ? row.premiere_date.toISOString().split('T')[0] : (row.premiere_date || undefined),
    isFinished: Boolean(row.isFinished),
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
    updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : String(row.updatedAt),
  };
}

export async function listAnimeRecords(status?: AnimeStatus): Promise<AnimeRecord[]> {
  let sql = 'SELECT * FROM anime';
  const params: unknown[] = [];
  
  if (status) {
    sql += ' WHERE status = ?';
    params.push(status);
  }
  
  sql += ' ORDER BY updatedAt DESC';

  const rows = await query<AnimeRow[]>(sql, params);
  return rows.map(mapRowToAnimeRecord);
}

export async function getAnimeRecord(id: number): Promise<AnimeRecord | null> {
  const rows = await query<AnimeRow[]>('SELECT * FROM anime WHERE id = ?', [id]);
  if (rows.length === 0) return null;
  return mapRowToAnimeRecord(rows[0]);
}

export async function createAnimeRecord(input: CreateAnimeDTO): Promise<AnimeRecord> {
  const sql = `
    INSERT INTO anime (title, original_title, coverUrl, status, score, progress, totalEpisodes, durationMinutes, notes, tags, summary, start_date, end_date, premiere_date, original_work, cast, cast_aliases, isFinished) 
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;
  
  const params = [
    input.title,
    input.originalTitle || null,
    input.coverUrl || null,
    input.status,
    input.score || null,
    input.progress,
    input.totalEpisodes || null,
    input.durationMinutes || null,
    input.notes || null,
    JSON.stringify(input.tags || []),
    input.summary || null,
    input.startDate || null,
    input.endDate || null,
    input.premiereDate || null,
    input.originalWork || null,
    JSON.stringify(input.cast || []),
    JSON.stringify(input.castAliases || []),
    input.isFinished ? 1 : 0
  ];

  const result = await query<ResultSetHeader>(sql, params);
  
  // Return the complete record
  const newRecord = await getAnimeRecord(result.insertId);
  if (!newRecord) throw new Error('Failed to create anime record');
  
  return newRecord;
}

export async function updateAnimeRecord(
  id: number,
  input: Partial<CreateAnimeDTO>
): Promise<AnimeRecord | null> {
  // Dynamic update query
  const fields: string[] = [];
  const params: unknown[] = [];

  if (input.originalTitle !== undefined) { fields.push('original_title = ?'); params.push(input.originalTitle); }
  if (input.title !== undefined) { fields.push('title = ?'); params.push(input.title); }
  if (input.coverUrl !== undefined) { fields.push('coverUrl = ?'); params.push(input.coverUrl); }
  if (input.status !== undefined) { fields.push('status = ?'); params.push(input.status); }
  if (input.score !== undefined) { fields.push('score = ?'); params.push(input.score); }
  if (input.progress !== undefined) { fields.push('progress = ?'); params.push(input.progress); }
  if (input.totalEpisodes !== undefined) { fields.push('totalEpisodes = ?'); params.push(input.totalEpisodes); }
  if (input.durationMinutes !== undefined) { fields.push('durationMinutes = ?'); params.push(input.durationMinutes); }
  if (input.notes !== undefined) { fields.push('notes = ?'); params.push(input.notes); }
  if (input.tags !== undefined) { fields.push('tags = ?'); params.push(JSON.stringify(input.tags)); }
  if (input.summary !== undefined) { fields.push('summary = ?'); params.push(input.summary); }
  if (input.startDate !== undefined) { fields.push('start_date = ?'); params.push(input.startDate); }
  if (input.endDate !== undefined) { fields.push('end_date = ?'); params.push(input.endDate); }
  if (input.premiereDate !== undefined) { fields.push('premiere_date = ?'); params.push(input.premiereDate); }
  if (input.originalWork !== undefined) { fields.push('original_work = ?'); params.push(input.originalWork); }
  if (input.cast !== undefined) { fields.push('cast = ?'); params.push(JSON.stringify(input.cast)); }
  if (input.castAliases !== undefined) { fields.push('cast_aliases = ?'); params.push(JSON.stringify(input.castAliases)); }
  if (input.isFinished !== undefined) { fields.push('isFinished = ?'); params.push(input.isFinished ? 1 : 0); }

  if (fields.length === 0) return await getAnimeRecord(id);

  const sql = `UPDATE anime SET ${fields.join(', ')} WHERE id = ?`;
  params.push(id);

  await query(sql, params);
  
  return await getAnimeRecord(id);
}

export async function deleteAnimeRecord(id: number): Promise<void> {
  await query('DELETE FROM anime WHERE id = ?', [id]);
}

export async function findAnimeByTitle(title: string): Promise<AnimeRecord | null> {
  // Try exact match first
  let rows = await query<AnimeRow[]>('SELECT * FROM anime WHERE title = ?', [title]);
  
  // If not found, try simple fuzzy match (e.g. title starts with)
  if (rows.length === 0) {
    rows = await query<AnimeRow[]>('SELECT * FROM anime WHERE title LIKE ? LIMIT 1', [`%${title}%`]);
  }
  
  if (rows.length === 0) return null;
  return mapRowToAnimeRecord(rows[0]);
}

export async function listAnimeRecordsByExactTitle(title: string): Promise<AnimeRecord[]> {
  const rows = await query<AnimeRow[]>('SELECT * FROM anime WHERE title = ? ORDER BY createdAt DESC', [title]);
  return rows.map(mapRowToAnimeRecord);
}

export async function updateAnimeProgress(id: number, progress: number): Promise<void> {
    await query('UPDATE anime SET progress = ?, updatedAt = NOW() WHERE id = ?', [progress, id]);
}
