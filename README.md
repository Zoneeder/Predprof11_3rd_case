## Endpoints

Сервер работает на `http://localhost:3000`.
Все ответы приходят в формате **JSON**.

### 1.Импорт (Import)
Загрузка CSV файла и пересчет рейтингов.
- **URL:** `POST /api/import`
- **Body:** `Multipart/Form-Data`
    - `file`: (File) сам файл .csv/.json
    - `date`: (String) дата списка "2024-08-01"

### 2.Список абитуриентов (List)
Таблица с пагинацией.
- **URL:** `GET /api/applicants`
- **Params:** `page`, `limit`, `search`, `filter_program`
- **Пример ответа:**
```json
{
  "data": [
    { "id": 1, "full_name": "Иванов И.И.", "total_score": 260, "agreed": true, "current_program": "ИВТ" }
  ],
  "meta": { "total_pages": 10 }
}
```

### 3.Статистика (Stats)
Дашборд с проходными баллами.
- **URL:** `GET /api/statistics`
- **Пример ответа:**
```json
[
  { "program_code": "ПМ", "places_total": 40, "places_filled": 40, "passing_score": 275 }
]
```

### 4.История (History)
Данные для графиков изменения баллов.
- **URL:** `GET /api/history`
- **Пример ответа:**
```json
{
  "ПМ": [{ "date": "2024-08-01", "score": 270 }],
  "ИВТ": [{ "date": "2024-08-01", "score": 230 }]
}
```

---
# Тех детали
Запуск сервера возможен через .exe файл из релизов, иначе API работать не будет.
