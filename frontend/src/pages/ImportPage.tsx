import { useMemo, useState } from "react";
import { Button, Card, Group, Stack, Text, TextInput, Title } from "@mantine/core";
import { Dropzone } from "@mantine/dropzone";
import { notifications } from "@mantine/notifications";
import { IconUpload, IconX, IconAlertTriangle } from "@tabler/icons-react";
import { useImport } from "../api/hooks";

import type { ImportResponse } from "../api/types";

export function ImportPage() {
  // Дефолтная дата - 1 августа (как в ТЗ)
  const [date, setDate] = useState("2024-08-01");
  const [file, setFile] = useState<File | null>(null);

  const importMutation = useImport();

  const canSubmit = useMemo(
    () => !!file && !!date && !importMutation.isPending, 
    [file, date, importMutation.isPending]
  );

  const submit = async () => {
    if (!file) return;
    try {
      // Выполняем запрос
      const response = await importMutation.mutateAsync({ file, date });
      
      // Приводим тип, чтобы TS знал о поле warning
      const data = response as unknown as ImportResponseData;

      // 1. Проверяем наличие предупреждения (Аномалия > 10%)
      if (data.warning) {
        notifications.show({
          color: "yellow",
          title: "Внимание (Аномалия)",
          message: data.warning,
          icon: <IconAlertTriangle size={18} />,
          autoClose: 10000, // Показываем 10 секунд
          withBorder: true,
        });
      }

      // 2. Показываем успех
      notifications.show({
        color: "green",
        title: "Файл загружен",
        message: `Успешно обработано: ${data.stats.processed} строк. Данные обновлены.`,
        autoClose: 4000,
      });

      // Сбрасываем файл, чтобы можно было загрузить следующий
      setFile(null);

    } catch (e: any) {
      // Обработка ошибок
      notifications.show({
        color: "red",
        title: "Ошибка обработки",
        message: e?.message ?? "Не удалось импортировать файл.",
        icon: <IconX size={16} />,
        autoClose: 5000,
      });
    }
  };

  return (
    <Stack gap="md">
      <Title order={2}>Import</Title>

      <Card withBorder radius="lg" p="lg">
        <Stack gap="md">
          <Text c="dimmed" size="sm">
            Загрузите CSV файл с абитуриентами. Система автоматически синхронизирует списки: добавит новых, обновит существующих и удалит тех, кого нет в файле.
          </Text>

          <TextInput
            label="Дата списка (для истории)"
            description="Введите дату, за которую выгружен этот список (например, 2024-08-01)"
            placeholder="YYYY-MM-DD"
            value={date}
            onChange={(ev) => setDate(ev.currentTarget.value)}
          />

          <Dropzone
            onDrop={(files) => setFile(files[0] ?? null)}
            onReject={(files) => console.log("Файл отклонен:", files)} // Добавим для отладки
            maxFiles={1}
            // РАСШИРЕННЫЙ СПИСОК ТИПОВ:
            accept={[
              "text/csv",
              "application/json",
              "text/plain",                // Часто CSV определяется как простой текст
              "application/vnd.ms-excel",  // Если установлен Excel
              "application/csv",
              "text/x-csv"
            ]}
            multiple={false}
          >
            <Stack align="center" gap={6} py="xl" style={{ minHeight: 120, justifyContent: 'center' }}>
              <IconUpload size={34} style={{ opacity: 0.7 }} />
              <Text fw={600}>Drag & drop CSV файл сюда</Text>
              <Text c="dimmed" size="sm">
                Или кликни, чтобы выбрать файл
              </Text>
              {file && (
                <Text size="md" c="blue" fw={700} mt="sm">
                  Выбран: {file.name}
                </Text>
              )}
            </Stack>
          </Dropzone>

          <Group justify="flex-end">
            <Button 
              loading={importMutation.isPending} 
              disabled={!canSubmit} 
              onClick={submit}
            >
              Загрузить список
            </Button>
          </Group>
        </Stack>
      </Card>
    </Stack>
  );
}