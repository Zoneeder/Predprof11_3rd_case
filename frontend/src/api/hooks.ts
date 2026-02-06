import { useMutation, useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { getApplicants, getHistory, getStatistics, importList } from "./api";
import { getIntersections } from "./api";

export function useApplicants(params: {
  page: number;
  limit: number;
  search?: string;
  agreed?: boolean;
  program?: string;
  min_score?: number;
}) {
  return useQuery({
    queryKey: ["applicants", params],
    queryFn: () => getApplicants(params),
    placeholderData: keepPreviousData,
  });
}

export function useStatistics() {
  return useQuery({
    queryKey: ["statistics"],
    queryFn: getStatistics,
  });
}

export function useHistory() {
  return useQuery({
    queryKey: ["history"],
    queryFn: getHistory,
  });
}

export function useImport() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: importList,
    onSuccess: () => {
      // after import, refresh dashboard data
      qc.invalidateQueries({ queryKey: ["statistics"] });
      qc.invalidateQueries({ queryKey: ["history"] });
      qc.invalidateQueries({ queryKey: ["applicants"] });
    },
  });
}

export function useIntersections() {
  return useQuery({
    queryKey: ["intersections"],
    queryFn: getIntersections,
  });
}