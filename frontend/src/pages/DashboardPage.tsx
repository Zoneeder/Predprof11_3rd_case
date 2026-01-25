import { useMemo, useState } from "react";
import {
  Badge,
  Card,
  Group,
  Loader,
  NumberInput,
  SimpleGrid,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { useApplicants, useHistory, useStatistics } from "../api/hooks";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

export function DashboardPage() {
  // Applicants table state
  const [page, setPage] = useState(1);
  const [limit] = useState(10);
  const [search, setSearch] = useState("");

  const statsQ = useStatistics();
  const historyQ = useHistory();
  const applicantsQ = useApplicants({ page, limit, search: search || undefined });

  // Top cards: pick some basic derived numbers from stats (or show placeholders if empty)
  const top = useMemo(() => {
    const rows = statsQ.data ?? [];
    const placesTotal = rows.reduce((s, r) => s + r.places_total, 0);
    const placesFilled = rows.reduce((s, r) => s + r.places_filled, 0);
    const avgPassing =
      rows.length ? Math.round(rows.reduce((s, r) => s + r.passing_score, 0) / rows.length) : 0;

    return { placesTotal, placesFilled, avgPassing, programs: rows.length };
  }, [statsQ.data]);

  // History chart: convert { program: [{date,score}]} into recharts format by date
  const chartData = useMemo(() => {
    const hist = historyQ.data ?? {};
    const allDates = new Set<string>();
    Object.values(hist).forEach((arr) => arr.forEach((p) => allDates.add(p.date)));

    const dates = Array.from(allDates).sort();
    return dates.map((d) => {
      const row: any = { date: d };
      for (const [program, arr] of Object.entries(hist)) {
        const point = arr.find((x) => x.date === d);
        row[program] = point?.score ?? null;
      }
      return row;
    });
  }, [historyQ.data]);

  const programKeys = useMemo(() => Object.keys(historyQ.data ?? {}), [historyQ.data]);

  return (
    <Stack gap="md">
      <Group justify="space-between" align="flex-end">
        <Title order={2}>Dashboard</Title>

        <Group>
          <TextInput
            label="Search applicant"
            placeholder="Иванов..."
            value={search}
            onChange={(e) => setSearch(e.currentTarget.value)}
          />
          <NumberInput
            label="Page"
            min={1}
            value={page}
            onChange={(v) => setPage(Number(v || 1))}
            w={120}
          />
        </Group>
      </Group>

      {/* Top cards (upper part) */}
      <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} spacing="md">
        <StatCard title="Всего мест" value={top.placesTotal} loading={statsQ.isLoading} />
        <StatCard title="Занято мест" value={top.placesFilled} loading={statsQ.isLoading} />
        <StatCard title="Средний проходной" value={top.avgPassing} loading={statsQ.isLoading} />
        <StatCard title="Программ" value={top.programs} loading={statsQ.isLoading} />
      </SimpleGrid>

      {/* Stats table */}
      <Card withBorder radius="lg" p="lg">
        <Group justify="space-between" mb="sm">
          <Text fw={700}>Статистика по программам</Text>
          {statsQ.isFetching && <Loader size="sm" />}
        </Group>

        {statsQ.isError ? (
          <Text c="red">Не удалось загрузить /api/statistics</Text>
        ) : (
          <Table striped highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Program</Table.Th>
                <Table.Th>Places total</Table.Th>
                <Table.Th>Places filled</Table.Th>
                <Table.Th>Passing score</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {(statsQ.data ?? []).map((r) => (
                <Table.Tr key={r.program_code}>
                  <Table.Td>{r.program_code}</Table.Td>
                  <Table.Td>{r.places_total}</Table.Td>
                  <Table.Td>{r.places_filled}</Table.Td>
                  <Table.Td>{r.passing_score}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        )}
      </Card>

      {/* History chart */}
      <Card withBorder radius="lg" p="lg">
        <Group justify="space-between" mb="sm">
          <Text fw={700}>История проходных баллов</Text>
          {historyQ.isFetching && <Loader size="sm" />}
        </Group>

        {historyQ.isError ? (
          <Text c="red">Не удалось загрузить /api/history</Text>
        ) : (
          <div style={{ width: "100%", height: 320 }}>
            <ResponsiveContainer>
              <LineChart data={chartData}>
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip />
                <Legend />
                {programKeys.map((k) => (
                  <Line key={k} type="monotone" dataKey={k} dot={false} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>

      {/* Applicants table */}
      <Card withBorder radius="lg" p="lg">
        <Group justify="space-between" mb="sm">
          <Text fw={700}>Абитуриенты</Text>
          {applicantsQ.isFetching && <Loader size="sm" />}
        </Group>

        {applicantsQ.isError ? (
          <Text c="red">Не удалось загрузить /api/applicants</Text>
        ) : (
          <>
            <Table striped highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>ID</Table.Th>
                  <Table.Th>Full name</Table.Th>
                  <Table.Th>Total score</Table.Th>
                  <Table.Th>Agreed</Table.Th>
                  <Table.Th>Program</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {(applicantsQ.data?.data ?? []).map((a) => (
                  <Table.Tr key={a.id}>
                    <Table.Td>{a.id}</Table.Td>
                    <Table.Td>{a.full_name}</Table.Td>
                    <Table.Td>{a.total_score}</Table.Td>
                    <Table.Td>
                      {a.agreed ? <Badge>Yes</Badge> : <Badge color="gray">No</Badge>}
                    </Table.Td>
                    <Table.Td>{a.current_program}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>

            <Text mt="sm" c="dimmed" size="sm">
              Total pages: {applicantsQ.data?.meta?.total_pages ?? "—"}
            </Text>
          </>
        )}
      </Card>
    </Stack>
  );
}

function StatCard(props: { title: string; value: number; loading?: boolean }) {
  return (
    <Card withBorder radius="lg" p="lg">
      <Text c="dimmed" size="sm">
        {props.title}
      </Text>
      <Group mt={6} align="baseline" gap="xs">
        {props.loading ? <Loader size="sm" /> : <Text fw={800} size="xl">{props.value}</Text>}
      </Group>
    </Card>
  );
}
