use sqlx::SqlitePool;
use std::collections::{HashMap};
// use chrono::Local; // <-- Больше не нужно, если не используем текущую дату по дефолту
use crate::db;

fn get_program_limits() -> HashMap<String, usize> {
    let mut map = HashMap::new();
    map.insert("ПМ".to_string(), 40);
    map.insert("ИВТ".to_string(), 50);
    map.insert("ИТСС".to_string(), 30);
    map.insert("ИБ".to_string(), 20);
    map
}

// Добавили аргумент `date`
pub async fn recalculate_admissions(pool: &SqlitePool, date: &str) {
    if let Err(e) = db::reset_admission_status(pool).await {
        println!("Ошибка сброса статусов: {}", e);
        return;
    }

    let applicants = match db::get_applicants(pool, 100000, 0, None).await {
        Ok(list) => list,
        Err(e) => {
            println!("Ошибка получения списка: {}", e);
            return;
        }
    };

    let mut active_applicants: Vec<_> = applicants
        .into_iter()
        .filter(|a| a.agreed)
        .collect();

    active_applicants.sort_by(|a, b| {
        b.total_score.cmp(&a.total_score)
            .then_with(|| b.scores.math.cmp(&a.scores.math))
            .then_with(|| b.scores.rus.cmp(&a.scores.rus))
    });
    
    let limits = get_program_limits();
    let mut admission_lists: HashMap<String, Vec<i32>> = HashMap::new();
    for key in limits.keys() {
        admission_lists.insert(key.clone(), Vec::new());
    }
    
    for person in active_applicants {
        for priority in &person.priorities {
            if let Some(limit) = limits.get(priority) {
                let current_list = admission_lists.get_mut(priority).unwrap();
                if current_list.len() < *limit {
                    current_list.push(person.id);
                    let _ = db::set_admission_program(pool, person.id, priority).await;
                    break;
                }
            }
        }
    }
    // Передаем дату дальше
    save_statistics(pool, &limits, &admission_lists, date).await;
}

async fn save_statistics(
    pool: &SqlitePool,
    limits: &HashMap<String, usize>,
    admission_lists: &HashMap<String, Vec<i32>>,
    date: &str // <-- Принимаем дату аргументом
) {
    // let today = Local::now().format("%Y-%m-%d").to_string(); // <-- УБИРАЕМ ЭТО

    for (prog_code, admitted_ids) in admission_lists {
        let total_places = limits.get(prog_code).unwrap_or(&0);
        let filled = admitted_ids.len();

        let passing_score = if filled > 0 {
            let last_id = admitted_ids.last().unwrap();
            let score: i32 = sqlx::query_scalar("SELECT total_score FROM applicants WHERE id = ?")
                .bind(last_id)
                .fetch_one(pool)
                .await
                .unwrap_or(0);
            score
        } else {
            0
        };

        let _ = sqlx::query(
            r#"
            INSERT INTO history_stats (record_date, program_code, passing_score, places_filled)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(record_date, program_code) DO UPDATE SET
                passing_score = excluded.passing_score,
                places_filled = excluded.places_filled
            "#
        )
            .bind(date) // <-- Используем переданную дату
            .bind(prog_code)
            .bind(passing_score)
            .bind(filled as i32)
            .execute(pool)
            .await;
    }
}

pub async fn calculate_intersections(pool: &SqlitePool) -> HashMap<String, usize> {
    let applicants = db::get_applicants(pool, 100000, 0, None).await.unwrap_or_default();
    
    // Инициализируем счетчики нулями
    let mut counts = HashMap::new();
    let keys = [
        "pm_ivt", "pm_itss", "pm_ib", "ivt_itss", "ivt_ib", "itss_ib",
        "pm_ivt_itss", "pm_ivt_ib", "ivt_itss_ib", "pm_itss_ib", "all_four"
    ];
    for k in keys {
        counts.insert(k.to_string(), 0);
    }

    for app in applicants {
        let p = &app.priorities;
        let has_pm = p.contains(&"ПМ".to_string());
        let has_ivt = p.contains(&"ИВТ".to_string());
        let has_itss = p.contains(&"ИТСС".to_string());
        let has_ib = p.contains(&"ИБ".to_string());

        // Пары
        if has_pm && has_ivt { *counts.get_mut("pm_ivt").unwrap() += 1; }
        if has_pm && has_itss { *counts.get_mut("pm_itss").unwrap() += 1; }
        if has_pm && has_ib { *counts.get_mut("pm_ib").unwrap() += 1; }
        if has_ivt && has_itss { *counts.get_mut("ivt_itss").unwrap() += 1; }
        if has_ivt && has_ib { *counts.get_mut("ivt_ib").unwrap() += 1; }
        if has_itss && has_ib { *counts.get_mut("itss_ib").unwrap() += 1; }

        // Тройки
        if has_pm && has_ivt && has_itss { *counts.get_mut("pm_ivt_itss").unwrap() += 1; }
        if has_pm && has_ivt && has_ib { *counts.get_mut("pm_ivt_ib").unwrap() += 1; }
        if has_ivt && has_itss && has_ib { *counts.get_mut("ivt_itss_ib").unwrap() += 1; }
        if has_pm && has_itss && has_ib { *counts.get_mut("pm_itss_ib").unwrap() += 1; }

        // Четверка
        if has_pm && has_ivt && has_itss && has_ib { *counts.get_mut("all_four").unwrap() += 1; }
    }

    counts
}

pub async fn get_detailed_stats(pool: &SqlitePool) -> Vec<crate::models::ProgramStats> {
    let applicants = db::get_applicants(pool, 100000, 0, None).await.unwrap_or_default();
    let limits = get_program_limits();
    
    // Подготовка структур для подсчета
    let mut stats_map: HashMap<String, crate::models::ProgramStats> = HashMap::new();
    
    for (code, total) in &limits {
        stats_map.insert(code.clone(), crate::models::ProgramStats {
            program_name: match code.as_str() {
                "ПМ" => "Прикладная математика".to_string(),
                "ИВТ" => "Информатика и ВТ".to_string(),
                "ИТСС" => "Связь и телекоммуникации".to_string(),
                "ИБ" => "Информационная безопасность".to_string(),
                _ => code.to_string(),
            },
            program_code: code.clone(),
            places_total: *total as i32,
            places_filled: 0,
            passing_score: 0,
            is_shortage: false,
            count_priority_1: 0,
            count_priority_2: 0,
            count_priority_3: 0,
            count_priority_4: 0,
            enrolled_priority_1: 0,
            enrolled_priority_2: 0,
            enrolled_priority_3: 0,
            enrolled_priority_4: 0,
        });
    }

    // Проход по абитуриентам
    for app in &applicants {
        // Подсчет заявлений по приоритетам
        for (idx, prog_code) in app.priorities.iter().enumerate() {
            if let Some(stat) = stats_map.get_mut(prog_code) {
                match idx {
                    0 => stat.count_priority_1 += 1,
                    1 => stat.count_priority_2 += 1,
                    2 => stat.count_priority_3 += 1,
                    3 => stat.count_priority_4 += 1,
                    _ => {}
                }
            }
        }

        // Подсчет зачисленных
        if let Some(current) = &app.current_program {
            if let Some(stat) = stats_map.get_mut(current) {
                stat.places_filled += 1;
                // Определяем каким приоритетом прошел
                if let Some(idx) = app.priorities.iter().position(|p| p == current) {
                     match idx {
                        0 => stat.enrolled_priority_1 += 1,
                        1 => stat.enrolled_priority_2 += 1,
                        2 => stat.enrolled_priority_3 += 1,
                        3 => stat.enrolled_priority_4 += 1,
                        _ => {}
                    }
                }
                
                // Минимальный балл (проходной) - это будет балл последнего зачисленного (так как сортировка по убыванию)
                stat.passing_score = app.total_score;
            }
        }
    }

    // Финализация
    let mut result: Vec<crate::models::ProgramStats> = stats_map.into_values().collect();
    for stat in &mut result {
        stat.is_shortage = stat.places_filled < stat.places_total;
        if stat.places_filled == 0 {
            stat.passing_score = 0;
        }
    }
    
    // Сортировка для порядка
    result.sort_by(|a, b| a.program_code.cmp(&b.program_code));
    
    result
}