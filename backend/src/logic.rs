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

    let applicants = match db::get_applicants(pool, 100000, 0).await {
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