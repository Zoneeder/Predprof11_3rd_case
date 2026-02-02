import { useMemo, useState, useRef } from "react";
import {
  Badge,
  Button,
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
import { IconFileTypePdf } from "@tabler/icons-react"; // Иконка PDF
import { useApplicants, useHistory, useStatistics } from "../api/hooks";
import { getApplicants } from "../api/api"; // Импортируем функцию API напрямую для отчета
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
  CartesianGrid
} from "recharts";
import { generateReport } from "../utils/pdf";
import { notifications } from "@mantine/notifications";

export function DashboardPage() {
  const [page, setPage] = useState(1);
  const [limit] = useState(10);
  const [search, setSearch] = useState("");
  const [isGeneratingPdf, setGeneratingPdf] = useState(false);

  // Ссылка на DOM-элемент графика для скриншота
  const chartRef = useRef<HTMLDivElement>(null);

  const statsQ = useStatistics();
  const historyQ = useHistory();
  const applicantsQ = useApplicants({ page, limit, search: search || undefined });

  // --- ЛОГИКА ДЛЯ ВЕРХНИХ КАРТОЧЕК ---
  const top = useMemo(() => {
    const rows = statsQ.data ?? [];
    const placesTotal = rows.reduce((s: number, r: any) => s + r.places_total, 0);
    const placesFilled = rows.reduce((s: number, r: any) => s + r.places_filled, 0);
    const avgPassing =
      rows.length ? Math.round(rows.reduce((s: number, r: any) => s + r.passing_score, 0) / rows.length) : 0;
    return { placesTotal, placesFilled, avgPassing, programs: rows.length };
  }, [statsQ.data]);

  // --- ЛОГИКА ДЛЯ ГРАФИКА ---
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

  // --- ФУНКЦИЯ ГЕНЕРАЦИИ ОТЧЕТА ---
  const handleDownloadReport = async () => {
    if (!statsQ.data) return;
    setGeneratingPdf(true);
    try {
      // 1. Загружаем полный список студентов для списков зачисления (без пагинации)
      // В реальном проекте лучше endpoint /api/export, но здесь делаем запрос с большим limit
      const fullList = await getApplicants({ page: 1, limit: 10000 });
      
      // 2. Определяем последнюю дату из графика как "текущую дату данных"
      const lastDate = chartData.length > 0 ? chartData[chartData.length - 1].date : "2024-08-0X";

      // 3. Генерируем
      await generateReport({
        stats: statsQ.data,
        applicants: fullList.data,
        chartElement: chartRef.current,
        date: lastDate,
      });

      notifications.show({ title: "Отчет готов", message: "Скачивание началось", color: "green" });
    } catch (e) {
      console.error(e);
      notifications.show({ title: "Ошибка", message: "Не удалось создать PDF", color: "red" });
    } finally {
      setGeneratingPdf(false);
    }
  };

  return (
    <Stack gap="md">
      <Group justify="space-between" align="flex-end">
        <Title order={2}>Dashboard</Title>
        
        {/* Кнопка скачивания отчета */}
        <Button 
          leftSection={<IconFileTypePdf size={18}/>} 
          onClick={handleDownloadReport}
          loading={isGeneratingPdf}
          disabled={!statsQ.data}
        >
          Скачать отчет (PDF)
        </Button>
      </Group>

      {/* Фильтры и поиск */}
      <Group>
        <TextInput
          label="Поиск абитуриента"
          placeholder="Фамилия..."
          value={search}
          onChange={(e) => setSearch(e.currentTarget.value)}
        />
      </Group>

      {/* Верхние карточки */}
      <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} spacing="md">
        <StatCard title="Всего мест" value={top.placesTotal} loading={statsQ.isLoading} />
        <StatCard title="Занято мест" value={top.placesFilled} loading={statsQ.isLoading} />
        <StatCard title="Средний проходной" value={top.avgPassing} loading={statsQ.isLoading} />
        <StatCard title="Программ" value={top.programs} loading={statsQ.isLoading} />
      </SimpleGrid>

      {/* Таблица статистики */}
      <Card withBorder radius="lg" p="lg">
        <Group justify="space-between" mb="sm">
          <Text fw={700}>Статистика по программам</Text>
          {statsQ.isFetching && <Loader size="sm" />}
        </Group>

        {statsQ.isError ? (
          <Text c="red">Не удалось загрузить данные</Text>
        ) : (
          <Table striped highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Программа</Table.Th>
                <Table.Th>Мест всего</Table.Th>
                <Table.Th>Занято мест</Table.Th>
                <Table.Th>Проходной балл</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {(statsQ.data ?? []).map((r: any) => (
                <Table.Tr key={r.program_code}>
                  <Table.Td>{r.program_name} ({r.program_code})</Table.Td>
                  <Table.Td>{r.places_total}</Table.Td>
                  <Table.Td>{r.places_filled}</Table.Td>
                  <Table.Td>
                    {/* ПУНКТ 14.b: Если мест больше чем людей - НЕДОБОР */}
                    {r.places_filled < r.places_total ? (
                      <Badge color="red">НЕДОБОР</Badge>
                    ) : (
                      <Badge variant="light" size="lg">{r.passing_score}</Badge>
                    )}
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        )}
      </Card>

      {/* График истории (Добавлен ref) */}
      <Card withBorder radius="lg" p="lg">
        <Group justify="space-between" mb="sm">
          <Text fw={700}>История проходных баллов</Text>
        </Group>

        {/* Оборачиваем график в div с ref для захвата изображения */}
        <div ref={chartRef} style={{ width: "100%", height: 350, padding: 10, background: 'white' }}>
          <ResponsiveContainer>
            <LineChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis />
              <Tooltip />
              <Legend />
              {programKeys.map((k, idx) => (
                // Разные цвета для линий
                <Line 
                  key={k} 
                  type="monotone" 
                  dataKey={k} 
                  stroke={['#8884d8', '#82ca9d', '#ffc658', '#ff7300'][idx % 4]} 
                  strokeWidth={3}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* Таблица абитуриентов */}
      <Card withBorder radius="lg" p="lg">
        <Group justify="space-between" mb="sm">
          <Text fw={700}>Абитуриенты (Топ-лист)</Text>
          <Group>
            <NumberInput 
               min={1} 
               value={page} 
               onChange={(v) => setPage(Number(v || 1))} 
               w={80} 
            />
          </Group>
        </Group>

        <Table striped highlightOnHover>
            <Table.Thead>
            <Table.Tr>
                <Table.Th>ID</Table.Th>
                <Table.Th>ФИО</Table.Th>
                <Table.Th>Сумма баллов</Table.Th>
                <Table.Th>Согласие</Table.Th>
                <Table.Th>Зачислен на</Table.Th>
            </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
            {(applicantsQ.data?.data ?? []).map((a) => (
                <Table.Tr key={a.id}>
                <Table.Td>{a.id}</Table.Td>
                <Table.Td>{a.full_name}</Table.Td>
                <Table.Td fw={700}>{a.total_score}</Table.Td>
                <Table.Td>
                    {a.agreed ? <Badge color="green">Да</Badge> : <Badge color="gray">Нет</Badge>}
                </Table.Td>
                <Table.Td>
                    {a.current_program ? (
                        <Badge color="blue">{a.current_program}</Badge>
                    ) : (
                        "-"
                    )}
                </Table.Td>
                </Table.Tr>
            ))}
            </Table.Tbody>
        </Table>
        <Text size="xs" c="dimmed" mt="xs">Страница {page} из {applicantsQ.data?.meta?.total_pages}</Text>
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