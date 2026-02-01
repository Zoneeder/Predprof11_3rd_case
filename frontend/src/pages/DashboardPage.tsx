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
  useComputedColorScheme, // Добавлен импорт
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
  const [limit] = useState(10);
  const [search, setSearch] = useState("");
  const [isGeneratingPdf, setGeneratingPdf] = useState(false);

  // Ссылка на DOM-элемент графика для скриншота
  const chartRef = useRef<HTMLDivElement>(null);

  const statsQ = useStatistics();
  const historyQ = useHistory();
  const applicantsQ = useApplicants({ page, limit, search: search || undefined });
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
        
        <Button 
          leftSection={<IconFileTypePdf size={18}/>} 
          onClick={handleDownloadReport}
          loading={isGeneratingPdf}
          disabled={!statsQ.data}
        >
          Скачать отчет (PDF)
        </Button>
      </Group>

      <Group>
        <TextInput
          label="Поиск абитуриента"
          placeholder="Фамилия..."
          value={search}
          onChange={(e) => setSearch(e.currentTarget.value)}
        />
      </Group>

      <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} spacing="md">
        <StatCard title="Всего мест" value={top.placesTotal} loading={statsQ.isLoading} />
        <StatCard title="Занято мест" value={top.placesFilled} loading={statsQ.isLoading} />
        <StatCard title="Средний проходной" value={top.avgPassing} loading={statsQ.isLoading} />
        <StatCard title="Программ" value={top.programs} loading={statsQ.isLoading} />
      </SimpleGrid>

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

      {/* График истории (Обновленный) */}
      <Card withBorder radius="lg" p="lg">
        <Group justify="space-between" mb="sm">
          <Text fw={700}>История проходных баллов</Text>
        </Group>

        <div ref={chartRef} style={{ 
            width: "100%", 
            height: 350, 
            padding: 10, 
            background: isDark ? '#1A1B1E' : 'white', 
            borderRadius: 8 
        }}>
          <ResponsiveContainer>
            <LineChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={chartStyles.grid} />
              <XAxis dataKey="date" stroke={chartStyles.text} />
              <YAxis stroke={chartStyles.text} />
              <Tooltip 
                contentStyle={{ 
                    backgroundColor: chartStyles.tooltipBg, 
                    borderColor: chartStyles.tooltipBorder,
                    color: chartStyles.text 
                }} 
              />
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

      <Card withBorder radius="lg" p="lg">
        <Text fw={700} mb="md">Детализация заявлений и зачислений (по приоритетам)</Text>
        <Table striped highlightOnHover withTableBorder>
          <Table.Thead>
            <Table.Tr>
              <Table.Th rowSpan={2}>Программа</Table.Th>
              <Table.Th colSpan={4} style={{ textAlign: 'center', borderBottom: '1px solid #dee2e6' }}>
                Подано заявлений (по приоритету)
              </Table.Th>
              <Table.Th colSpan={4} style={{ textAlign: 'center', borderBottom: '1px solid #dee2e6' }}>
                Зачислено (по приоритету)
              </Table.Th>
            </Table.Tr>
            <Table.Tr>
              <Table.Th c="dimmed" style={{ textAlign: 'center' }}>1</Table.Th>
              <Table.Th c="dimmed" style={{ textAlign: 'center' }}>2</Table.Th>
              <Table.Th c="dimmed" style={{ textAlign: 'center' }}>3</Table.Th>
              <Table.Th c="dimmed" style={{ textAlign: 'center' }}>4</Table.Th>
              <Table.Th c="blue" style={{ textAlign: 'center' }}>1</Table.Th>
              <Table.Th c="blue" style={{ textAlign: 'center' }}>2</Table.Th>
              <Table.Th c="blue" style={{ textAlign: 'center' }}>3</Table.Th>
              <Table.Th c="blue" style={{ textAlign: 'center' }}>4</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {(statsQ.data ?? []).map((r: any) => (
              <Table.Tr key={r.program_code}>
                <Table.Td fw={700}>{r.program_code}</Table.Td>
                {/* Заявления */}
                <Table.Td style={{ textAlign: 'center' }}>{r.count_priority_1}</Table.Td>
                <Table.Td style={{ textAlign: 'center' }}>{r.count_priority_2}</Table.Td>
                <Table.Td style={{ textAlign: 'center' }}>{r.count_priority_3}</Table.Td>
                <Table.Td style={{ textAlign: 'center' }}>{r.count_priority_4}</Table.Td>
                
                {/* Зачисленные */}
                <Table.Td fw={500} c="blue" style={{ textAlign: 'center' }}>{r.enrolled_priority_1}</Table.Td>
                <Table.Td fw={500} c="blue" style={{ textAlign: 'center' }}>{r.enrolled_priority_2}</Table.Td>
                <Table.Td fw={500} c="blue" style={{ textAlign: 'center' }}>{r.enrolled_priority_3}</Table.Td>
                <Table.Td fw={500} c="blue" style={{ textAlign: 'center' }}>{r.enrolled_priority_4}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Card>

      {/* --- НАЧАЛО ВСТАВКИ: МАТРИЦЫ ПЕРЕСЕЧЕНИЙ --- */}
      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
        
        {/* Таблица 1: Пересечения 2 ОП */}
        <Card withBorder radius="lg" p="lg">
            <Text fw={700} mb="sm" size="sm">Пересечения (только 2 ОП)</Text>
            {interQ.isLoading ? <Loader size="sm" /> : (
            <Table withTableBorder striped>
                <Table.Thead>
                <Table.Tr>
                    <Table.Th>Комбинация</Table.Th>
                    <Table.Th>Кол-во</Table.Th>
                </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                <Table.Tr><Table.Td>ПМ + ИВТ</Table.Td><Table.Td>{interQ.data?.pm_ivt}</Table.Td></Table.Tr>
                <Table.Tr><Table.Td>ПМ + ИТСС</Table.Td><Table.Td>{interQ.data?.pm_itss}</Table.Td></Table.Tr>
                <Table.Tr><Table.Td>ПМ + ИБ</Table.Td><Table.Td>{interQ.data?.pm_ib}</Table.Td></Table.Tr>
                <Table.Tr><Table.Td>ИВТ + ИТСС</Table.Td><Table.Td>{interQ.data?.ivt_itss}</Table.Td></Table.Tr>
                <Table.Tr><Table.Td>ИВТ + ИБ</Table.Td><Table.Td>{interQ.data?.ivt_ib}</Table.Td></Table.Tr>
                <Table.Tr><Table.Td>ИТСС + ИБ</Table.Td><Table.Td>{interQ.data?.itss_ib}</Table.Td></Table.Tr>
                </Table.Tbody>
            </Table>
            )}
        </Card>

        {/* Таблица 2: Пересечения 3 и 4 ОП */}
        <Card withBorder radius="lg" p="lg">
            <Text fw={700} mb="sm" size="sm">Пересечения (3 и 4 ОП)</Text>
            {interQ.isLoading ? <Loader size="sm" /> : (
            <Table withTableBorder striped>
                <Table.Thead>
                <Table.Tr>
                    <Table.Th>Комбинация</Table.Th>
                    <Table.Th>Кол-во</Table.Th>
                </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                <Table.Tr><Table.Td>ПМ-ИВТ-ИТСС</Table.Td><Table.Td>{interQ.data?.pm_ivt_itss}</Table.Td></Table.Tr>
                <Table.Tr><Table.Td>ПМ-ИВТ-ИБ</Table.Td><Table.Td>{interQ.data?.pm_ivt_ib}</Table.Td></Table.Tr>
                <Table.Tr><Table.Td>ИВТ-ИТСС-ИБ</Table.Td><Table.Td>{interQ.data?.ivt_itss_ib}</Table.Td></Table.Tr>
                <Table.Tr><Table.Td>ПМ-ИТСС-ИБ</Table.Td><Table.Td>{interQ.data?.pm_itss_ib}</Table.Td></Table.Tr>
                <Table.Tr style={{ borderTop: "2px solid #dee2e6" }}>
                    <Table.Td fw={700}>ВСЕ 4 ОП</Table.Td>
                    <Table.Td fw={700}>{interQ.data?.all_four}</Table.Td>
                </Table.Tr>
                </Table.Tbody>
            </Table>
            )}
        </Card>
      </SimpleGrid>
      {/* --- КОНЕЦ ВСТАВКИ --- */}

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
              <Table.Th>Балл</Table.Th>
              <Table.Th>Согласие</Table.Th>
              <Table.Th>Каскад приоритетов</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {(applicantsQ.data?.data ?? []).map((a) => (
              <Table.Tr key={a.id}>
                <Table.Td>{a.id}</Table.Td>
                <Table.Td>
                    <Text size="sm" fw={500}>{a.full_name}</Text>
                    {/* Показываем детали баллов мелким шрифтом */}
                    <Text size="xs" c="dimmed">
                        М:{a.scores.math} Р:{a.scores.rus} Ф:{a.scores.phys} ИД:{a.scores.achievements}
                    </Text>
                </Table.Td>
                <Table.Td fw={700}>{a.total_score}</Table.Td>
                <Table.Td>
                  {a.agreed ? <Badge color="green" size="sm">Да</Badge> : <Badge color="gray" size="sm" variant="outline">Нет</Badge>}
                </Table.Td>
                <Table.Td>
                  <Group gap={4}>
                    {a.priorities.map((prog) => {
                        const isEnrolledHere = a.current_program === prog;
                        // Если он зачислен на эту программу - делаем яркой
                        // Если он зачислен на ДРУГУЮ программу, а эта стоит РАНЬШЕ в списке - значит он сюда не прошел (красный/серый)
                        // Если он зачислен на ДРУГУЮ, а эта ПОЗЖЕ - она не сыграла
                        
                        let variant = "default";
                        let color = "gray";
                        
                        if (isEnrolledHere) {
                            variant = "filled";
                            color = "blue";
                        } else if (a.current_program) {
                            // Он куда-то поступил, но не сюда.
                            // Если эта программа была приоритетнее той, куда он поступил -> он сюда не прошел.
                            // Но мы упростим: просто покажем серым, а поступившую выделим.
                             variant = "outline";
                        }

                        return (
                            <Badge key={prog} color={color} variant={variant} size="sm">
                                {prog}
                            </Badge>
                        )
                    })}
                    {!a.current_program && a.agreed && (
                        <Text size="xs" c="red">Не прошел</Text>
                    )}
                  </Group>
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