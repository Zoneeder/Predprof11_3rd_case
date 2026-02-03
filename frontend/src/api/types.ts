// === Типы для Импорта ===
export interface ImportStats {
  processed: number;
}

export interface ImportResponse {
  status: string;
  message: string;
  stats: ImportStats;
  warning?: string; // Поле для предупреждения о 10%
}

// === Типы для Абитуриентов ===
export interface Scores {
  math: number;
  rus: number;
  phys: number;
  achievements: number;
}

export interface Applicant {
  id: number;
  full_name: string;
  total_score: number;
  agreed: boolean;
  current_program: string | null; // Может быть null, если не зачислен
  priorities: string[];
  scores: Scores;
}

export interface PaginationMeta {
  total_items: number;
  current_page: number;
  total_pages: number;
}

export interface ApplicantsResponse {
  data: Applicant[];
  meta: PaginationMeta;
}

// === Типы для Статистики ===
export interface StatsRow {
  program_name: string;
  program_code: string;
  places_total: number;
  places_filled: number;
  passing_score: number;
  is_shortage: boolean; // Флаг недобора

  // Детализация по приоритетам
  count_priority_1: number;
  count_priority_2: number;
  count_priority_3: number;
  count_priority_4: number;

  enrolled_priority_1: number;
  enrolled_priority_2: number;
  enrolled_priority_3: number;
  enrolled_priority_4: number;
}

export type StatisticsResponse = StatsRow[];

// === Типы для Истории (Графиков) ===
export interface HistoryPoint {
  date: string;
  score: number;
}

export interface IntersectionStats {
  pm_ivt: number;
  pm_itss: number;
  pm_ib: number;
  ivt_itss: number;
  ivt_ib: number;
  itss_ib: number;

  pm_ivt_itss: number;
  pm_ivt_ib: number;
  ivt_itss_ib: number;
  pm_itss_ib: number;
  all_four: number;
}

export type HistoryResponse = Record<string, HistoryPoint[]>;