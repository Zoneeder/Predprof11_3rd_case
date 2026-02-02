mod handlers;
mod models;
mod db;
mod logic;
mod assets;

use axum::{
    routing::{get, post},
    Router,
};
use std::net::SocketAddr;
use tower_http::cors::{Any, CorsLayer};
use dotenvy::dotenv;
use sqlx::sqlite::{SqlitePoolOptions, SqliteConnectOptions};
use std::str::FromStr;

#[derive(Clone)]
pub struct AppState {
    db: sqlx::SqlitePool,
}

#[tokio::main]
async fn main() {
    dotenv().ok();
    tracing_subscriber::fmt::init();

    let database_url = std::env::var("DATABASE_URL")
        .expect("DATABASE_URL must be set in .env file");

    let connection_options = SqliteConnectOptions::from_str(&database_url)
        .expect("Invalid connection string")
        .create_if_missing(true);

    let db_pool = SqlitePoolOptions::new()
        .connect_with(connection_options)
        .await
        .expect("Failed to connect to DB");

    sqlx::migrate!("./migrations")
        .run(&db_pool)
        .await
        .expect("Failed to run migrations");

    let state = AppState { db: db_pool };


    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    let app = Router::new()
        .route("/api/import", post(handlers::import_data))
        .route("/api/applicants", get(handlers::get_applicants))       
        .route("/api/statistics", get(handlers::get_stats))
        .route("/api/history", get(handlers::get_history))
        .route("/api/intersections", get(handlers::get_intersections))
        .route("/api/clear", post(handlers::clear_database))
        .layer(cors)
        .with_state(state);

    let addr = SocketAddr::from(([127, 0, 0, 1], 3000));
    println!("Server started on http://{}", addr);

    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}
