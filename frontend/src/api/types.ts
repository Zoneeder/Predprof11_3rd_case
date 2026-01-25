export type ImportResponse = unknown;

export interface Applicant {
  id: number;
  full_name: string;
  total_score: number;
  agreed: boolean;
  current_program: string;
}

export interface ApplicantsResponse {
  data: Applicant[];
  meta: {
    total_pages: number;
  };
}

export interface StatsRow {
  program_code: string;
  places_total: number;
  places_filled: number;
  passing_score: number;
}

export type StatisticsResponse = StatsRow[];

export interface HistoryPoint {
  date: string; // "2024-08-01"
  score: number;
}

export type HistoryResponse = Record<string, HistoryPoint[]>; // { "ПМ": [...], "ИВТ": [...] }
