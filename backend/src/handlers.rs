use axum::{
    extract::{Multipart, Query, State},
    Json,
};
use serde_json::{json};
use std::collections::HashMap;
use csv::ReaderBuilder;
use sqlx::Row;
use crate::{models::*, AppState, db, logic};
use crate::db::NewApplicant;

#[derive(serde::Deserialize)]
pub struct PaginationQuery {
    pub page: Option<usize>,
    pub limit: Option<usize>,
}

pub async fn get_applicants(
    State(state): State<AppState>,
    Query(params): Query<PaginationQuery>,
) -> Json<ApplicantListResponse> {

    let page = params.page.unwrap_or(1);
    let limit = params.limit.unwrap_or(50) as i32;
    let offset = ((page - 1) * (limit as usize)) as i32;
    let applicants = db::get_applicants(&state.db, limit, offset)
        .await
        .unwrap_or_else(|e| {
            println!("DB Error: {}", e);
            vec![]
        });

    let total_items = db::count_applicants(&state.db)
        .await
        .unwrap_or(0) as usize;

    let total_pages = (total_items as f64 / limit as f64).ceil() as usize;

    Json(ApplicantListResponse {
        data: applicants,
        meta: PaginationMeta {
            total_items,
            current_page: page,
            total_pages,
        },
    })
}

pub async fn get_stats(State(state): State<AppState>) -> Json<Vec<ProgramStats>> {
    let rows = sqlx::query(
        r#"
        SELECT program_code, passing_score, places_filled
        FROM history_stats
        WHERE record_date = (SELECT MAX(record_date) FROM history_stats)
        "#
    )
        .fetch_all(&state.db)
        .await
        .unwrap_or_default();
    let limits = HashMap::from([
        ("ПМ", 40), ("ИВТ", 50), ("ИТСС", 30), ("ИБ", 20)
    ]);

    let mut result = Vec::new();

    for (code, &total) in limits.iter() {
        let stat_row = rows.iter().find(|r| r.get::<String, _>("program_code") == *code);

        let (filled, score) = match stat_row {
            Some(row) => (row.get::<i32, _>("places_filled"), row.get::<i32, _>("passing_score")),
            None => (0, 0),
        };

        result.push(ProgramStats {
            program_name: match *code {
                "ПМ" => "Прикладная математика".to_string(),
                "ИВТ" => "Информатика и ВТ".to_string(),
                "ИТСС" => "Связь и телекоммуникации".to_string(),
                "ИБ" => "Информационная безопасность".to_string(),
                _ => code.to_string(),
            },
            program_code: code.to_string(),
            places_total: total,
            places_filled: filled,
            passing_score: score,
            is_shortage: filled < total,
        });
    }

    Json(result)
}

pub async fn import_data(
    State(state): State<AppState>,
    mut multipart: Multipart
) -> Json<ImportResponse> {
    let mut stats = ImportStats { processed: 0 };
    while let Some(field) = multipart.next_field().await.unwrap() {
        let name = field.name().unwrap().to_string();

        if name == "file" {
            let data = field.bytes().await.unwrap();
            let mut rdr = ReaderBuilder::new()
                .delimiter(b',')
                .from_reader(&data[..]);

            for result in rdr.deserialize() {
                let record: CsvApplicant = match result {
                    Ok(r) => r,
                    Err(e) => {
                        println!("Ошибка парсинга строки: {}", e);
                        continue;
                    }
                };

                let is_agreed = record.agreed.to_lowercase() == "true" || record.agreed == "1";

                let priorities_vec: Vec<String> = record.priorities
                    .split(';')
                    .map(|s| s.trim().to_string())
                    .filter(|s| !s.is_empty())
                    .collect();

                let new_applicant = NewApplicant {
                    external_id: record.id,
                    full_name: record.name,
                    score_math: record.math,
                    score_rus: record.rus,
                    score_phys: record.phys,
                    score_achieve: record.achieve,
                    agreed: is_agreed,
                    priorities: priorities_vec,
                };
                match db::upsert_applicant(&state.db, &new_applicant).await {
                    Ok(_) => {
                        stats.processed += 1;
                    },
                    Err(e) => println!("Ошибка БД для ID {}: {}", record.id, e),
                }
            }
        }
    }
    let pool_clone = state.db.clone();
    tokio::spawn(async move {
        logic::recalculate_admissions(&pool_clone).await;
    });
    
    Json(ImportResponse {
        status: "success".to_string(),
        message: format!("Processed {} records", stats.processed),
        stats,
    })
}

pub async fn get_history(State(state): State<AppState>) -> Json<HashMap<String, Vec<serde_json::Value>>> {
    let rows = sqlx::query(
        "SELECT program_code, record_date, passing_score FROM history_stats ORDER BY record_date ASC"
    )
        .fetch_all(&state.db)
        .await
        .unwrap_or_default();

    let mut history: HashMap<String, Vec<serde_json::Value>> = HashMap::new();

    for row in rows {
        let code: String = row.get("program_code");
        let date: String = row.get("record_date");
        let score: i32 = row.get("passing_score");

        history.entry(code).or_default().push(json!({
            "date": date,
            "score": score
        }));
    }

    Json(history)
}