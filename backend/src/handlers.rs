use axum::{
    extract::{Multipart, Query, State},
    Json,
};
use serde_json::{json, Value};
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
    // 1. Получаем базовые цифры из истории (как было)
    let history_rows = sqlx::query(
        r#"
        SELECT program_code, passing_score, places_filled
        FROM history_stats
        WHERE record_date = (SELECT MAX(record_date) FROM history_stats)
        "#
    )
        .fetch_all(&state.db)
        .await
        .unwrap_or_default();

    // 2. Получаем ВСЕХ абитуриентов для подсчета приоритетов
    // (В реальном проде это делается одним SQL запросом с CASE/GROUP BY, но для понятности сделаем в коде)
    let applicants = db::get_applicants(&state.db, 100000, 0).await.unwrap_or_default();

    let limits = HashMap::from([
        ("ПМ", 40), ("ИВТ", 50), ("ИТСС", 30), ("ИБ", 20)
    ]);

    let mut result = Vec::new();
    let codes = vec!["ПМ", "ИВТ", "ИТСС", "ИБ"];

    for code in codes {
        // Базовая статистика
        let stat_row = history_rows.iter().find(|r| r.get::<String, _>("program_code") == code);
        let (filled, score) = match stat_row {
            Some(row) => (row.get::<i32, _>("places_filled"), row.get::<i32, _>("passing_score")),
            None => (0, 0),
        };
        let total_places = *limits.get(code).unwrap_or(&0) as i32;

        // Подсчет приоритетов
        let mut count_p = [0; 4];
        let mut enrol_p = [0; 4];

        for app in &applicants {
            // Ищем, на какой позиции у абитуриента стоит текущая программа (code)
            if let Some(idx) = app.priorities.iter().position(|p| p == code) {
                if idx < 4 {
                    count_p[idx] += 1;
                    
                    // Если он зачислен именно на эту программу
                    if let Some(curr) = &app.current_program {
                        if curr == code {
                            enrol_p[idx] += 1;
                        }
                    }
                }
            }
        }

        result.push(ProgramStats {
            program_name: match code {
                "ПМ" => "Прикладная математика".to_string(),
                "ИВТ" => "Информатика и ВТ".to_string(),
                "ИТСС" => "Связь и телекоммуникации".to_string(),
                "ИБ" => "Информационная безопасность".to_string(),
                _ => code.to_string(),
            },
            program_code: code.to_string(),
            places_total: total_places,
            places_filled: filled,
            passing_score: score,
            is_shortage: filled < total_places,
            
            // Заполняем новые поля
            count_priority_1: count_p[0],
            count_priority_2: count_p[1],
            count_priority_3: count_p[2],
            count_priority_4: count_p[3],
            enrolled_priority_1: enrol_p[0],
            enrolled_priority_2: enrol_p[1],
            enrolled_priority_3: enrol_p[2],
            enrolled_priority_4: enrol_p[3],
        });
    }

    Json(result)
}

pub async fn import_data(
    State(state): State<AppState>,
    mut multipart: Multipart
) -> Json<ImportResponse> {
    
    let prev_count = db::count_applicants(&state.db).await.unwrap_or(0);
    let mut stats = ImportStats { processed: 0 };
    let mut processed_external_ids: Vec<i32> = Vec::new();
    let mut report_date = Local::now().format("%Y-%m-%d").to_string();

    while let Some(field) = multipart.next_field().await.unwrap() {
        let name = field.name().unwrap().to_string();

        if name == "date" {
            if let Ok(text) = field.text().await {
                if let Ok(_) = chrono::NaiveDate::parse_from_str(&text, "%Y-%m-%d") {
                    report_date = text;
                } else {
                    println!("Warning: Invalid date format received: '{}'. Using current date.", text);
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
                
                processed_external_ids.push(record.id);

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
                
                match db::upsert_applicant(&state.db, &new_applicant).await {
                    Ok(_) => {
                        stats.processed += 1;
                    },
                    Err(e) => println!("Ошибка БД для ID {}: {}", record.id, e),
                }
            }
        }
    }

    if let Err(e) = db::delete_missing_applicants(&state.db, &processed_external_ids).await {
        println!("Ошибка при удалении: {}", e);
    }

    let pool_clone = state.db.clone();
    let date_clone = report_date.clone();
    tokio::spawn(async move {
        logic::recalculate_admissions(&pool_clone, &date_clone).await;
    });

    let new_count = processed_external_ids.len() as i64;
    let mut warning = None;

    if prev_count > 0 {
        let diff = (prev_count - new_count).abs();
        let change_percent = (diff as f64 / prev_count as f64) * 100.0;
        if change_percent > 10.0 {
            warning = Some(format!(
                "Изменение объема данных на {:.1}% (было: {}, стало: {})",
                change_percent, prev_count, new_count
            ));
        }
    }

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

pub async fn get_intersections(State(state): State<AppState>) -> Json<IntersectionStats> {
    let applicants = db::get_applicants(&state.db, 100000, 0)
        .await
        .unwrap_or_default();

    let mut stats = IntersectionStats {
        pm_ivt: 0, pm_itss: 0, pm_ib: 0,
        ivt_itss: 0, ivt_ib: 0, itss_ib: 0,
        pm_ivt_itss: 0, pm_ivt_ib: 0, ivt_itss_ib: 0, pm_itss_ib: 0,
        all_four: 0,
    };

    for app in applicants {
        let mut codes = app.priorities.clone();
        codes.sort();
        codes.dedup();

        // --- ИСПРАВЛЕНИЕ ТУТ ---
        // Превращаем Vec<String> в Vec<&str>, чтобы работало сравнение с "ПМ", "ИВТ" и т.д.
        let codes_refs: Vec<&str> = codes.iter().map(|s| s.as_str()).collect();

        match codes_refs.as_slice() {
            // --- ПАРЫ (2 ОП) ---
            ["ИВТ", "ПМ"] => stats.pm_ivt += 1,
            ["ИТСС", "ПМ"] => stats.pm_itss += 1,
            ["ИБ", "ПМ"] => stats.pm_ib += 1,
            ["ИВТ", "ИТСС"] => stats.ivt_itss += 1,
            ["ИБ", "ИВТ"] => stats.ivt_ib += 1,
            ["ИБ", "ИТСС"] => stats.itss_ib += 1,

            // --- ТРОЙКИ (3 ОП) ---
            ["ИВТ", "ИТСС", "ПМ"] => stats.pm_ivt_itss += 1,
            ["ИБ", "ИВТ", "ПМ"] => stats.pm_ivt_ib += 1,
            ["ИБ", "ИВТ", "ИТСС"] => stats.ivt_itss_ib += 1,
            ["ИБ", "ИТСС", "ПМ"] => stats.pm_itss_ib += 1,

            // --- ЧЕТВЕРКА (4 ОП) ---
            ["ИБ", "ИВТ", "ИТСС", "ПМ"] => stats.all_four += 1,
            
            _ => {} 
        }
    }

    Json(stats)
}

pub async fn clear_database(State(state): State<AppState>) -> Json<serde_json::Value> {
    // Очищаем таблицы абитуриентов и истории
    let _ = sqlx::query("DELETE FROM applicants").execute(&state.db).await;
    let _ = sqlx::query("DELETE FROM history_stats").execute(&state.db).await;
    
    // Сбрасываем счетчик автоинкремента (для красоты ID)
    let _ = sqlx::query("DELETE FROM sqlite_sequence WHERE name='applicants'").execute(&state.db).await;

    Json(serde_json::json!({ "status": "ok", "message": "База данных очищена" }))
}