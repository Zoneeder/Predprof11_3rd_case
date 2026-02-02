import axios from "axios";
import type {
  ApplicantsResponse,
  ImportResponse,
} from "./types";

const baseURL = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

export const http = axios.create({
  baseURL,
  timeout: 30_000,
});

export async function importList(params: { file: File; date: string }) {
  const form = new FormData();
  form.append("file", params.file);
  form.append("date", params.date);

  const res = await http.post<ImportResponse>("/api/import", form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return res.data;
}

export async function getApplicants(params: {
  page: number;
  limit: number;
  search?: string;
  filter_program?: string;
}) {
  const res = await http.get<ApplicantsResponse>("/api/applicants", { params });
  return res.data;
}

export async function getHistory() {
  const res = await http.get("/api/history");
  const payload = res.data;

  // Expecting: Record<string, HistoryPoint[]>
  // Normalize common wrappers and non-array values
  const hist =
    payload && typeof payload === "object" && !Array.isArray(payload)
      ? (payload.data && typeof payload.data === "object" ? payload.data : payload)
      : {};

  const normalized: Record<string, any[]> = {};

  for (const [program, value] of Object.entries(hist)) {
    normalized[program] = Array.isArray(value)
      ? value
      : Array.isArray((value as any)?.data)
      ? (value as any).data
      : [];
  }

  return normalized;
}


export async function getStatistics() {
  const res = await http.get("/api/statistics");

  // normalize common shapes:
  const payload = res.data;
  const rows =
    Array.isArray(payload) ? payload :
    Array.isArray(payload?.data) ? payload.data :
    Array.isArray(payload?.rows) ? payload.rows :
    [];

  return rows;
}
