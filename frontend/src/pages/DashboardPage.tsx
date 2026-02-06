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
  useComputedColorScheme,
  Grid, ScrollArea, Select, Checkbox
} from "@mantine/core";
import { IconFileTypePdf } from "@tabler/icons-react";
import { useApplicants, useHistory, useStatistics, useIntersections } from "../api/hooks";
import { getApplicants } from "../api/api";
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
  // Определяем цветовую схему (светлая/темная)
  const colorScheme = useComputedColorScheme('light');
  const isDark = colorScheme === 'dark';

  // Цвета для графика в зависимости от темы
  const chartStyles = {
    grid: isDark ? "#373A40" : "#e0e0e0",
    text: isDark ? "#C1C2C5" : "#000000",
    tooltipBg: isDark ? "#25262b" : "#ffffff",
    tooltipBorder: isDark ? "#373A40" : "#ccc"
  };

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [filterProgram, setFilterProgram] = useState<string | null>(null);
  const [filterAgreed, setFilterAgreed] = useState(false);
  const [filterMinScore, setFilterMinScore] = useState<number | undefined>(undefined);

  const [isGeneratingPdf, setGeneratingPdf] = useState(false);

  // Ссылка на DOM-элемент графика для скриншота
  const chartRef = useRef<HTMLDivElement>(null);

  const statsQ = useStatistics();
  const historyQ = useHistory();
  const applicantsQ = useApplicants({
    page,
    limit: 20,
    search,
    agreed: filterAgreed ? true : undefined,
    program: filterProgram ?? undefined,
    min_score: filterMinScore
  });
  const interQ = useIntersections();

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
      const fullList = await getApplicants({ page: 1, limit: 10000 });
      const lastDate = chartData.length > 0 ? chartData[chartData.length - 1].date : "2024-08-0X";

      await generateReport({
        stats: statsQ.data,
        applicants: fullList.data,
        intersections: interQ.data,
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
    <Stack gap="md" h="100%">
      <Group justify="space-between" align="flex-end">
        <Title order={2}>Dashboard</Title>
        <Button
          leftSection={<IconFileTypePdf size={18} />}
          onClick={handleDownloadReport}
          loading={isGeneratingPdf}
          disabled={!statsQ.data}
        >
          Скачать отчет (PDF)
        </Button>
      </Group>

      {/* Верхние карточки статистики*/}
      <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} spacing="md">
        <StatCard title="Всего мест" value={top.placesTotal} loading={statsQ.isLoading} />
        <StatCard title="Занято мест" value={top.placesFilled} loading={statsQ.isLoading} />
        <StatCard title="Средний проходной" value={top.avgPassing} loading={statsQ.isLoading} />
        <StatCard title="Программ" value={top.programs} loading={statsQ.isLoading} />
      </SimpleGrid>

      <Grid gutter="md">
        <Grid.Col span={{ base: 12, lg: 8 }}>
          <Stack gap="md">
            <TextInput
              label="Поиск абитуриента"
              placeholder="Фамилия..."
              value={search}
              onChange={(e) => {
                setSearch(e.currentTarget.value);
                setPage(1);
              }}
            />

            <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="sm">
              <Select
                label="Программа"
                placeholder="Все"
                data={programKeys} // from stats
                clearable
                value={filterProgram}
                onChange={(v) => {
                  setFilterProgram(v);
                  setPage(1);
                }}
              />
              <NumberInput
                label="Мин. балл"
                placeholder="0"
                min={0} max={400}
                value={filterMinScore}
                onChange={(v) => {
                  setFilterMinScore(v === "" ? undefined : Number(v));
                  setPage(1);
                }}
              />
              <Checkbox
                label="Только с согласием"
                checked={filterAgreed}
                onChange={(e) => {
                  setFilterAgreed(e.currentTarget.checked);
                  setPage(1);
                }}
                mt={28}
              />
            </SimpleGrid>


            {/* График истории */}
            <Card withBorder radius="lg" p="lg">
              <Group justify="space-between" mb="sm">
                <Text fw={700}>История проходных баллов</Text>
              </Group>
              <div ref={chartRef} style={{
                width: "100%",
                height: 300,
                padding: 10,
                background: isDark ? '#1A1B1E' : 'white',
                borderRadius: 8
              }}>
                <ResponsiveContainer>
                  <LineChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={chartStyles.grid} />
                    <XAxis dataKey="date" stroke={chartStyles.text} />
                    <YAxis stroke={chartStyles.text} />
                    <Tooltip contentStyle={{ backgroundColor: chartStyles.tooltipBg, borderColor: chartStyles.tooltipBorder, color: chartStyles.text }} />
                    <Legend />
                    {programKeys.map((k, idx) => (
                      <Line
                        key={k}
                        type="monotone"
                        dataKey={k}
                        stroke={['#8884d8', '#82ca9d', '#ffc658', '#ff7300'][idx % 4]}
                        strokeWidth={3}
                        dot={{ r: 4 }}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Card>

            {/* Таблица статистики (Общая) */}
            <Card withBorder radius="lg" p="lg">
              <Group justify="space-between" mb="sm">
                <Text fw={700}>Статистика по программам</Text>
                {statsQ.isFetching && <Loader size="sm" />}
              </Group>
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
                        {r.places_filled < r.places_total ? <Badge color="red">НЕДОБОР</Badge> : <Badge variant="light" size="lg">{r.passing_score}</Badge>}
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Card>

            {/* Детализация (Приоритеты) */}
            <Card withBorder radius="lg" p="lg">
              <Text fw={700} mb="md">Детализация (Приоритеты)</Text>
              <Table striped highlightOnHover withTableBorder>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th rowSpan={2}>Программа</Table.Th>
                    <Table.Th colSpan={4} style={{ textAlign: 'center' }}>Подано</Table.Th>
                    <Table.Th colSpan={4} style={{ textAlign: 'center' }}>Зачислено</Table.Th>
                  </Table.Tr>
                  <Table.Tr>
                    <Table.Th>1</Table.Th><Table.Th>2</Table.Th><Table.Th>3</Table.Th><Table.Th>4</Table.Th>
                    <Table.Th c="blue">1</Table.Th><Table.Th c="blue">2</Table.Th><Table.Th c="blue">3</Table.Th><Table.Th c="blue">4</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {(statsQ.data ?? []).map((r: any) => (
                    <Table.Tr key={r.program_code}>
                      <Table.Td fw={700}>{r.program_code}</Table.Td>
                      <Table.Td>{r.count_priority_1}</Table.Td><Table.Td>{r.count_priority_2}</Table.Td><Table.Td>{r.count_priority_3}</Table.Td><Table.Td>{r.count_priority_4}</Table.Td>
                      <Table.Td c="blue">{r.enrolled_priority_1}</Table.Td><Table.Td c="blue">{r.enrolled_priority_2}</Table.Td><Table.Td c="blue">{r.enrolled_priority_3}</Table.Td><Table.Td c="blue">{r.enrolled_priority_4}</Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Card>

            {/* Пересечения (Матрицы) */}
            <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
              <Card withBorder radius="lg" p="lg">
                <Text fw={700} size="sm">Пересечения (2 ОП)</Text>
                <Table withTableBorder striped>
                  <Table.Tbody>
                    <Table.Tr><Table.Td>ПМ + ИВТ</Table.Td><Table.Td>{interQ.data?.pm_ivt}</Table.Td></Table.Tr>
                    <Table.Tr><Table.Td>ПМ + ИТСС</Table.Td><Table.Td>{interQ.data?.pm_itss}</Table.Td></Table.Tr>
                    <Table.Tr><Table.Td>ПМ + ИБ</Table.Td><Table.Td>{interQ.data?.pm_ib}</Table.Td></Table.Tr>
                    <Table.Tr><Table.Td>ИВТ + ИТСС</Table.Td><Table.Td>{interQ.data?.ivt_itss}</Table.Td></Table.Tr>
                    <Table.Tr><Table.Td>ИВТ + ИБ</Table.Td><Table.Td>{interQ.data?.ivt_ib}</Table.Td></Table.Tr>
                    <Table.Tr><Table.Td>ИТСС + ИБ</Table.Td><Table.Td>{interQ.data?.itss_ib}</Table.Td></Table.Tr>
                  </Table.Tbody>
                </Table>
              </Card>
              <Card withBorder radius="lg" p="lg">
                <Text fw={700} size="sm">Пересечения (3+ ОП)</Text>
                <Table withTableBorder striped>
                  <Table.Tbody>
                    <Table.Tr><Table.Td>ПМ + ИВТ + ИТСС</Table.Td><Table.Td>{interQ.data?.pm_ivt_itss}</Table.Td></Table.Tr>
                    <Table.Tr><Table.Td>ПМ + ИВТ + ИБ</Table.Td><Table.Td>{interQ.data?.pm_ivt_ib}</Table.Td></Table.Tr>
                    <Table.Tr><Table.Td>ПМ + ИТСС + ИБ</Table.Td><Table.Td>{interQ.data?.pm_itss_ib}</Table.Td></Table.Tr>
                    <Table.Tr><Table.Td>ИВТ + ИТСС + ИБ</Table.Td><Table.Td>{interQ.data?.ivt_itss_ib}</Table.Td></Table.Tr>
                    <Table.Tr><Table.Td fw={700}>Все 4 направления</Table.Td><Table.Td fw={700}>{interQ.data?.all_four}</Table.Td></Table.Tr>
                  </Table.Tbody>
                </Table>
              </Card>
            </SimpleGrid>

          </Stack>
        </Grid.Col>

        {/*СПИСОК АБИТУРИЕНТОВ*/}
        <Grid.Col span={{ base: 12, lg: 4 }}>
          <Card withBorder radius="lg" p="0" h="calc(100vh - 140px)">

            <Stack p="md" gap="xs" style={{ borderBottom: '1px solid var(--mantine-color-default-border)' }}>
              <Group justify="space-between">
                <Text fw={700}>Абитуриенты</Text>
                <Group gap={5}>
                  <NumberInput
                    min={1} max={applicantsQ.data?.meta?.total_pages}
                    value={page} onChange={(v) => setPage(Number(v || 1))} w={60} size="xs"
                  />
                  <Text size="xs" c="dimmed">из {applicantsQ.data?.meta?.total_pages}</Text>
                </Group>
              </Group>
            </Stack>

            <ScrollArea h="100%" type="auto" offsetScrollbars>
              <Table striped highlightOnHover verticalSpacing="xs">
                <Table.Thead style={{ position: 'sticky', top: 0, background: isDark ? '#25262b' : 'white', zIndex: 1 }}>
                  <Table.Tr>
                    <Table.Th>ФИО / Приор.</Table.Th>
                    <Table.Th style={{ textAlign: 'right' }}>Балл</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {(applicantsQ.data?.data ?? []).map((a) => (
                    <Table.Tr key={a.id}>
                      <Table.Td>
                        <Text size="sm" fw={500} style={{ lineHeight: 1.2 }}>{a.full_name}</Text>

                        <Text size="xs" c={a.agreed ? "green" : "dimmed"} fw={a.agreed ? 700 : 400} mb={4}>
                          ID: {a.id} {a.agreed ? '(Согласие)' : ''}
                        </Text>

                        <Group gap={4}>
                          {a.priorities.map((prog, idx) => {
                            const isEnrolled = a.current_program === prog;
                            let color = "gray";
                            let variant = "outline";

                            if (isEnrolled) {
                              color = "blue";
                              variant = "filled";
                            }

                            return (
                              <Badge key={prog} color={color} variant={variant} size="xs">
                                {idx + 1}. {prog}
                              </Badge>
                            );
                          })}
                        </Group>
                      </Table.Td>

                      <Table.Td style={{ textAlign: 'right', verticalAlign: 'top' }}>
                        <Text fw={700}>{a.total_score}</Text>
                        <Stack gap={0} mt={4}>
                          <Text size="10px" c="dimmed">М: {a.scores.math}</Text>
                          <Text size="10px" c="dimmed">Р: {a.scores.rus}</Text>
                          <Text size="10px" c="dimmed">Ф: {a.scores.phys}</Text>
                        </Stack>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </ScrollArea>
          </Card>
        </Grid.Col>

      </Grid>
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