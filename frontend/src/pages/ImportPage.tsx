import { useMemo, useState } from "react";
import { Button, Card, Group, Stack, Text, TextInput, Title } from "@mantine/core";
import { Dropzone } from "@mantine/dropzone";
import { notifications } from "@mantine/notifications";
import { IconUpload, IconX } from "@tabler/icons-react";
import { useImport } from "../api/hooks";

export function ImportPage() {
  const [date, setDate] = useState("2024-08-01");
  const [file, setFile] = useState<File | null>(null);

  const importMutation = useImport();

  const canSubmit = useMemo(() => !!file && !!date && !importMutation.isPending, [file, date, importMutation.isPending]);

  const submit = async () => {
    if (!file) return;
    try {
      await importMutation.mutateAsync({ file, date });
      notifications.show({
        title: "Файл загружен",
        message: "Импорт успешно выполнен, данные обновлены.",
      });
      setFile(null);
    } catch (e: any) {
      notifications.show({
        color: "red",
        title: "Ошибка обработки",
        message: e?.message ?? "Не удалось импортировать файл.",
        icon: <IconX size={16} />,
      });
    }
  };

  return (
    <Stack gap="md">
      <Title order={2}>Import</Title>

      <Card withBorder radius="lg" p="lg">
        <Stack gap="md">
          <TextInput
            label="Дата списка"
            placeholder="YYYY-MM-DD"
            value={date}
            onChange={(ev) => setDate(ev.currentTarget.value)}
          />

          <Dropzone
            onDrop={(files) => setFile(files[0] ?? null)}
            maxFiles={1}
            accept={["text/csv", "application/json"]}
          >
            <Stack align="center" gap={6} py="xl">
              <IconUpload size={34} />
              <Text fw={600}>Drag & drop .csv/.json сюда</Text>
              <Text c="dimmed" size="sm">
                Или кликни, чтобы выбрать файл
              </Text>
              {file && (
                <Text size="sm">
                  Выбран: <b>{file.name}</b>
                </Text>
              )}
            </Stack>
          </Dropzone>

          <Group justify="flex-end">
            <Button loading={importMutation.isPending} disabled={!canSubmit} onClick={submit}>
              Upload to /api/import
            </Button>
          </Group>
        </Stack>
      </Card>
    </Stack>
  );
}
