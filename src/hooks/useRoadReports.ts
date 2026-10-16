import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { services } from '@/services';
import { useInAppNotificationStore } from '@/store/inAppNotificationStore';
import type { CreateRoadReportInput, RoadReport, RoadReportBounds } from '@/types';
import { queryKeys } from './queryKeys';

export function useRoadReports(bounds: RoadReportBounds) {
  return useQuery({
    queryKey: queryKeys.roadReports(bounds),
    queryFn: () => services.roadReports.list(bounds),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

export function useCreateRoadReport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateRoadReportInput) => services.roadReports.create(input),
    onSuccess: (result) => {
      useInAppNotificationStore.getState().show(result.points?.notification);
      const report = result.report;
      queryClient.setQueryData(queryKeys.roadReport(report.id), report);
      queryClient.setQueriesData<RoadReport[]>({ queryKey: queryKeys.roadReportLists() }, (current) =>
        current?.map((item) => item.id === report.id ? report : item),
      );
      void queryClient.invalidateQueries({ queryKey: queryKeys.roadReportLists() });
    },
  });
}

function useVote(reportId: string | undefined, kind: 'confirm' | 'reject', action: (reportId: string) => Promise<RoadReport>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ['road-report-vote', reportId ?? 'none', kind],
    mutationFn: () => {
      if (!reportId) throw new Error('A report must be selected before voting');
      return action(reportId);
    },
    onSuccess: (report) => {
      queryClient.setQueryData(queryKeys.roadReport(report.id), report);
      queryClient.setQueriesData<RoadReport[]>({ queryKey: queryKeys.roadReportLists() }, (current) =>
        current?.map((item) => item.id === report.id ? report : item),
      );
    },
  });
}

export const useConfirmRoadReport = (reportId?: string) => useVote(reportId, 'confirm', services.roadReports.confirm);
export const useRejectRoadReport = (reportId?: string) => useVote(reportId, 'reject', services.roadReports.reject);
