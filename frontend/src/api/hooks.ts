import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getApplicants, getHistory, getStatistics, importList } from "./api";

export function useApplicants(params: {
  page: number;
  limit: number;
  search?: string;
  filter_program?: string;
}) {
  return useQuery({
    queryKey: ["applicants", params],
    queryFn: () => getApplicants(params),
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
