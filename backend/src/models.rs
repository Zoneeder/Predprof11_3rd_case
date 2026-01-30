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
    pub is_shortage: bool,
    
    // Новые поля для ТЗ
    pub count_priority_1: i32,
    pub count_priority_2: i32,
    pub count_priority_3: i32,
    pub count_priority_4: i32, // Максимум 4 приоритета по ТЗ
    
    pub enrolled_priority_1: i32,
    pub enrolled_priority_2: i32,
    pub enrolled_priority_3: i32,
    pub enrolled_priority_4: i32,
}

#[derive(Serialize)]
pub struct ImportResponse {
    pub status: String,
    pub message: String,
    pub stats: ImportStats,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub warning: Option<String>,
}

#[derive(Serialize)]
pub struct ImportStats {
    pub processed: i32,
}

#[derive(Debug, Deserialize)]
pub struct CsvApplicant {
    #[serde(alias = "id", alias = "ID", alias = "Уникальный идентификатор абитуриента (ID)")]
    pub id: i32,

    #[serde(alias = "name", alias = "ФИО", alias = "Full Name")]
    pub name: String,

    #[serde(alias = "math", alias = "Балл Математика", alias = "Математика")]
    pub math: i32,

    #[serde(alias = "rus", alias = "Балл Русский язык", alias = "Русский язык")]
    pub rus: i32,

    #[serde(alias = "phys", alias = "Балл Физика/ИКТ", alias = "Физика", alias = "Информатика")]
    pub phys: i32,

    #[serde(alias = "achieve", alias = "Балл за индивидуальные достижения", alias = "ИД")]
    pub achieve: i32,

    #[serde(alias = "agreed", alias = "Наличие согласия о зачислении в ВУЗе", alias = "Согласие")]
    pub agreed: String,

    #[serde(alias = "priorities", alias = "Приоритет ОП", alias = "Приоритеты")]
    pub priorities: String,
}