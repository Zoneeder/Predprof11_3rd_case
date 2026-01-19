use axum::{
    extract::{Multipart, Query},
    Json,
};
use serde_json::{json};
use std::collections::HashMap;
use crate::models::*;

#[derive(serde::Deserialize)]
pub struct PaginationQuery {
    pub page: Option<usize>,
    pub limit: Option<usize>,
}

pub async fn get_applicants(Query(params): Query<PaginationQuery>) -> Json<ApplicantListResponse> {
    let data = vec![
        Applicant {
            id: 101,
            full_name: "Иванов Иван Иванович".to_string(),
            agreed: true,
            total_score: 265,
            scores: Scores { math: 85, rus: 90, phys: 80, achievements: 10 },
            current_program: Some("ИВТ".to_string()),
            priorities: vec!["ПМ".to_string(), "ИВТ".to_string()],
        },
        Applicant {
            id: 102,
            full_name: "Петрова Анна Сергеевна".to_string(),
            agreed: false,
            total_score: 290,
            scores: Scores { math: 95, rus: 95, phys: 90, achievements: 10 },
            current_program: None,
            priorities: vec!["ПМ".to_string()],
        },
    ];

    Json(ApplicantListResponse {
        data,
        meta: PaginationMeta {
            total_items: 1488,
            current_page: params.page.unwrap_or(1),
            total_pages: 25,
        },
    })
}

pub async fn get_stats() -> Json<Vec<ProgramStats>> {
    let stats = vec![
        ProgramStats {
            program_name: "Прикладная математика".to_string(),
            program_code: "ПМ".to_string(),
            places_total: 40,
            places_filled: 40,
            passing_score: 275,
            is_shortage: false,
        },
        ProgramStats {
            program_name: "Информационная безопасность".to_string(),
            program_code: "ИБ".to_string(),
            places_total: 20,
            places_filled: 5,
            passing_score: 0,
            is_shortage: true,
        },
    ];
    Json(stats)
}

pub async fn import_data(mut multipart: Multipart) -> Json<ImportResponse> {
    while let Some(field) = multipart.next_field().await.unwrap() {
        let name = field.name().unwrap().to_string();
        if name == "file" {
            println!("Получен файл: {:?}", field.file_name());
        }
    }
    // todo убрать в будущем
    tokio::time::sleep(std::time::Duration::from_millis(2000)).await;

    Json(ImportResponse {
        status: "success".to_string(),
        message: "Data imported and recalculated".to_string(),
        stats: ImportStats {
            processed: 1240,
            added: 15,
            updated: 100,
        },
    })
}

pub async fn get_history() -> Json<HashMap<String, Vec<serde_json::Value>>> {
    let mut history = HashMap::new();

    history.insert("ПМ".to_string(), vec![
        json!({ "date": "2024-07-20", "score": 240 }),
        json!({ "date": "2024-07-25", "score": 255 }),
        json!({ "date": "2024-08-01", "score": 275 }),
    ]);

    history.insert("ИВТ".to_string(), vec![
        json!({ "date": "2024-07-20", "score": 210 }),
        json!({ "date": "2024-08-01", "score": 230 }),
    ]);

    Json(history)
}