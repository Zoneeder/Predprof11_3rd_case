import { AppShell, Container, Group, Button, Title, ActionIcon, useMantineColorScheme, useComputedColorScheme } from "@mantine/core";
import { IconChartBar, IconUpload, IconSun, IconMoon } from "@tabler/icons-react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";

export function RootLayout() {
  const nav = useNavigate();
  const loc = useLocation();
  
  const { setColorScheme } = useMantineColorScheme();
  const computedColorScheme = useComputedColorScheme('light', { getInitialValueInEffect: true });

  const toggleColorScheme = () => {
    setColorScheme(computedColorScheme === 'dark' ? 'light' : 'dark');
  };

  return (
    <AppShell header={{ height: 60 }} padding="md">
      
      <AppShell.Header>
        <Container size="lg" h="100%">
            <Group h="100%" justify="space-between">
              
              <Group>
                  <Title order={3} mr="xl">Анализ поступления</Title>
                  <Group gap="xs">
                    <Button 
                        variant={loc.pathname === "/" ? "light" : "subtle"} 
                        leftSection={<IconChartBar size={18} />}
                        onClick={() => nav("/")}
                    >
                        Панель поступления
                    </Button>
                    <Button 
                        variant={loc.pathname === "/import" ? "light" : "subtle"} 
                        leftSection={<IconUpload size={18} />}
                        onClick={() => nav("/import")}
                    >
                        Импорт
                    </Button>
                  </Group>
              </Group>
              
              <ActionIcon onClick={toggleColorScheme} variant="default" size="lg">
                {computedColorScheme === 'dark' ? <IconSun stroke={1.5} /> : <IconMoon stroke={1.5} />}
              </ActionIcon>

            </Group>
        </Container>
      </AppShell.Header>

      <AppShell.Main>
        <Container size="lg" py="md">
           <Outlet />
        </Container>
      </AppShell.Main>
      
    </AppShell>
  );
}