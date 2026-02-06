use axum::{
    extract::{Multipart, Query, State},
    Json,
};
use serde_json::json;
use std::collections::HashMap;
use csv::ReaderBuilder;
use sqlx::Row;
use chrono::Local;
use crate::{models::*, AppState, db, logic};
use crate::db::NewApplicant;

#[derive(serde::Deserialize)]
pub struct PaginationQuery {
    pub page: Option<usize>,
    pub limit: Option<usize>,
    pub search: Option<String>,
    pub agreed: Option<bool>,
    pub program: Option<String>,
    pub min_score: Option<i32>,
}

pub async fn get_applicants(
    State(state): State<AppState>,
    Query(params): Query<PaginationQuery>,
) -> Json<ApplicantListResponse> {

    let page = params.page.unwrap_or(1);
    let limit = params.limit.unwrap_or(50) as i32;
    let offset = ((page - 1) * (limit as usize)) as i32;
    let search_term = params.search.clone();

    let applicants = db::get_applicants(
        &state.db, 
        limit, 
        offset, 
        search_term.clone(),
        params.agreed,
        params.program.clone(),
        params.min_score
    )
        .await
        .unwrap_or_else(|e| {
            println!("DB Error: {}", e);
            vec![]
        });

    let total_items = db::count_applicants(
        &state.db, 
        search_term,
        params.agreed,
        params.program,
        params.min_score
    )
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
    let stats = logic::get_detailed_stats(&state.db).await;
    Json(stats)
}

pub async fn import_data(
    State(state): State<AppState>,
    mut multipart: Multipart
) -> Json<ImportResponse> {

    let prev_count = db::count_applicants(&state.db, None, None, None, None).await.unwrap_or(0);
    let mut stats = ImportStats { processed: 0 };
    let mut report_date = Local::now().format("%Y-%m-%d").to_string();
    
    let mut applicants_buffer: Vec<NewApplicant> = Vec::with_capacity(12000);

    while let Some(field) = multipart.next_field().await.unwrap() {
        let name = field.name().unwrap().to_string();

        if name == "date" {
            if let Ok(text) = field.text().await {
                if !text.is_empty() {
                    report_date = text;
                }
            }
            continue;
        }

        if name == "file" {
            let data = field.bytes().await.unwrap();
            let mut rdr = ReaderBuilder::new()
                .delimiter(b',')
                .from_reader(&data[..]);

            for result in rdr.deserialize() {
                let record: CsvApplicant = match result {
                    Ok(r) => r,
                    Err(e) => {
                        println!("Ошибка парсинга: {}", e);
                        continue;
                    }
                };

                let val = record.agreed.trim().to_lowercase();
                let is_agreed = val == "true" || val == "1" || val == "да" || val == "+";

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

                applicants_buffer.push(new_applicant);
            }
        }
    }

    stats.processed = applicants_buffer.len() as i32;

    match db::import_batch(&state.db, applicants_buffer).await {
        Ok(_) => (),
        Err(e) => {
            return Json(ImportResponse {
                status: "error".to_string(),
                message: format!("Ошибка БД: {}", e),
                stats: ImportStats { processed: 0 },
                warning: None,
            });
        }
    }

    let pool_clone = state.db.clone();
    let date_clone = report_date.clone();

    tokio::spawn(async move {
        logic::recalculate_admissions(&pool_clone, &date_clone).await;
    });

    let new_count = db::count_applicants(&state.db, None, None, None, None).await.unwrap_or(0);
    
    let warning: Option<String> = None;

    Json(ImportResponse {
        status: "success".to_string(),
        message: format!("Обработано {} записей за дату {}", stats.processed, report_date),
        stats,
        warning,
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

pub async fn clear_db(State(state): State<AppState>) -> axum::http::StatusCode {
    match db::clear_all(&state.db).await {
        Ok(_) => axum::http::StatusCode::OK,
        Err(_) => axum::http::StatusCode::INTERNAL_SERVER_ERROR,
    }
}

pub async fn get_intersections(State(state): State<AppState>) -> Json<Box<IntersectionStats>> {
    let counts = logic::calculate_intersections(&state.db).await;
    
    Json(Box::new(IntersectionStats {
        pm_ivt: *counts.get("pm_ivt").unwrap_or(&0) as i32,
        pm_itss: *counts.get("pm_itss").unwrap_or(&0) as i32,
        pm_ib: *counts.get("pm_ib").unwrap_or(&0) as i32,
        ivt_itss: *counts.get("ivt_itss").unwrap_or(&0) as i32,
        ivt_ib: *counts.get("ivt_ib").unwrap_or(&0) as i32,
        itss_ib: *counts.get("itss_ib").unwrap_or(&0) as i32,

        pm_ivt_itss: *counts.get("pm_ivt_itss").unwrap_or(&0) as i32,
        pm_ivt_ib: *counts.get("pm_ivt_ib").unwrap_or(&0) as i32,
        ivt_itss_ib: *counts.get("ivt_itss_ib").unwrap_or(&0) as i32,
        pm_itss_ib: *counts.get("pm_itss_ib").unwrap_or(&0) as i32,
        all_four: *counts.get("all_four").unwrap_or(&0) as i32,
    }))
}