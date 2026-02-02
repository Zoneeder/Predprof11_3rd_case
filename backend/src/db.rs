use sqlx::{SqlitePool, Row, QueryBuilder, Sqlite};
use crate::models::{Applicant, Scores};

pub async fn get_applicants(pool: &SqlitePool, limit: i32, offset: i32, search: Option<String>) -> Result<Vec<Applicant>, sqlx::Error> {
    let search_pattern = format!("%{}%", search.unwrap_or_default());

    let rows = sqlx::query(r#"
        SELECT id, full_name, agreed, total_score, 
               score_math, score_rus, score_phys, score_achieve, 
               priorities, current_program
        FROM applicants
        WHERE full_name LIKE ?
        ORDER BY total_score DESC
        LIMIT ? OFFSET ?
        "#)
        .bind(search_pattern)
        .bind(limit)
        .bind(offset)
        .fetch_all(pool)
        .await?;
    
    let applicants = rows.into_iter().map(|row| {
        let priorities_str: String = row.get("priorities");
        let priorities: Vec<String> = serde_json::from_str(&priorities_str).unwrap_or_default();

        Applicant {
            id: row.get("id"),
            full_name: row.get("full_name"),
            agreed: row.get("agreed"),
            total_score: row.get("total_score"),
            scores: Scores {
                math: row.get("score_math"),
                rus: row.get("score_rus"),
                phys: row.get("score_phys"),
                achievements: row.get("score_achieve"),
            },
            current_program: row.get("current_program"),
            priorities,
        }
    }).collect();

    Ok(applicants)
}

pub async fn count_applicants(pool: &SqlitePool, search: Option<String>) -> Result<i64, sqlx::Error> {
    let search_pattern = format!("%{}%", search.unwrap_or_default());
    let count: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM applicants WHERE full_name LIKE ?")
        .bind(search_pattern)
        .fetch_one(pool)
        .await?;
    Ok(count.0)
}

pub struct NewApplicant {
    pub external_id: i32,
    pub full_name: String,
    pub score_math: i32,
    pub score_rus: i32,
    pub score_phys: i32,
    pub score_achieve: i32,
    pub agreed: bool,
    pub priorities: Vec<String>,
}

pub async fn upsert_applicant(pool: &SqlitePool, person: &NewApplicant) -> Result<(), sqlx::Error> {
    let total = person.score_math + person.score_rus + person.score_phys + person.score_achieve;
    let priorities_json = serde_json::to_string(&person.priorities).unwrap();
    sqlx::query(r#"
        INSERT INTO applicants (
            external_id, full_name, 
            score_math, score_rus, score_phys, score_achieve, total_score,
            agreed, priorities, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(external_id) DO UPDATE SET
            full_name = excluded.full_name,
            score_math = excluded.score_math,
            score_rus = excluded.score_rus,
            score_phys = excluded.score_phys,
            score_achieve = excluded.score_achieve,
            total_score = excluded.total_score,
            agreed = excluded.agreed,
            priorities = excluded.priorities,
            updated_at = CURRENT_TIMESTAMP
        "#)
        .bind(person.external_id)
        .bind(&person.full_name)
        .bind(person.score_math)
        .bind(person.score_rus)
        .bind(person.score_phys)
        .bind(person.score_achieve)
        .bind(total)
        .bind(person.agreed)
        .bind(priorities_json)
        .execute(pool)
        .await?;

    Ok(())
}

pub async fn reset_admission_status(pool: &SqlitePool) -> Result<(), sqlx::Error> {
    sqlx::query("UPDATE applicants SET current_program = NULL")
        .execute(pool)
        .await?;
    Ok(())
}

pub async fn set_admission_program(pool: &SqlitePool, applicant_internal_id: i32, program: &str) -> Result<(), sqlx::Error> {
    sqlx::query("UPDATE applicants SET current_program = ? WHERE id = ?")
        .bind(program)
        .bind(applicant_internal_id)
        .execute(pool)
        .await?;
    Ok(())
}

pub async fn delete_missing_applicants(pool: &SqlitePool, present_external_ids: &[i32]) -> Result<(), sqlx::Error> {
    if present_external_ids.is_empty() {
        sqlx::query("DELETE FROM applicants").execute(pool).await?;
        return Ok(());
    }

    let mut builder: QueryBuilder<Sqlite> = QueryBuilder::new("DELETE FROM applicants WHERE external_id NOT IN (");
    
    let mut separated = builder.separated(", ");
    for id in present_external_ids {
        separated.push_bind(id);
    }
    separated.push_unseparated(")");

    let query = builder.build();
    query.execute(pool).await?;

    Ok(())
}