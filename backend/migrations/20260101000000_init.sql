CREATE TABLE IF NOT EXISTS applicants (
                                          id INTEGER PRIMARY KEY AUTOINCREMENT,
                                          external_id INTEGER NOT NULL UNIQUE,
                                          full_name TEXT NOT NULL,
                                          score_math INTEGER NOT NULL DEFAULT 0,
                                          score_rus INTEGER NOT NULL DEFAULT 0,
                                          score_phys INTEGER NOT NULL DEFAULT 0,
                                          score_achieve INTEGER NOT NULL DEFAULT 0,
                                          total_score INTEGER NOT NULL DEFAULT 0,
                                          agreed BOOLEAN NOT NULL DEFAULT 0,
                                          priorities TEXT NOT NULL,
                                          current_program TEXT,
                                          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS history_stats (
                                             id INTEGER PRIMARY KEY AUTOINCREMENT,
                                             record_date TEXT NOT NULL,
                                             program_code TEXT NOT NULL,
                                             passing_score INTEGER NOT NULL,
                                             places_filled INTEGER NOT NULL,

                                             UNIQUE(record_date, program_code)
    );
