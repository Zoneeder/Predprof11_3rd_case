use serde::{Deserialize, Serialize};
#[derive(Serialize)]
pub struct ApplicantListResponse {
    pub data: Vec<Applicant>,
    pub meta: PaginationMeta,
}

#[derive(Serialize)]
pub struct PaginationMeta {
    pub total_items: usize,
    pub current_page: usize,
    pub total_pages: usize,
}

#[derive(Serialize, Clone)]
pub struct Applicant {
    pub id: i32,
    pub full_name: String,
    pub agreed: bool,
    pub total_score: i32,
    pub scores: Scores,
    pub current_program: Option<String>,
    pub priorities: Vec<String>,
}

#[derive(Serialize, Clone)]
pub struct Scores {
    pub math: i32,
    pub rus: i32,
    pub phys: i32,
    pub achievements: i32,
}

#[derive(Serialize)]
pub struct ProgramStats {
    pub program_name: String,
    pub program_code: String,
    pub places_total: i32,
    pub places_filled: i32,
    pub passing_score: i32,
    pub is_shortage: bool
}
#[derive(Serialize)]
pub struct ImportResponse {
    pub status: String,
    pub message: String,
    pub stats: ImportStats,
}

#[derive(Serialize)]
pub struct ImportStats {
    pub processed: i32,
}

#[derive(Debug, Deserialize)]
pub struct CsvApplicant {
    pub id: i32,
    pub name: String,
    pub math: i32,
    pub rus: i32,
    pub phys: i32,
    pub achieve: i32,
    pub agreed: String,
    pub priorities: String,
}