import { AppShell, NavLink, Group, Text, ActionIcon, useMantineColorScheme, useComputedColorScheme } from "@mantine/core";
import { IconChartBar, IconUpload, IconSun, IconMoon } from "@tabler/icons-react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";

export function RootLayout() {
  const nav = useNavigate();
  const loc = useLocation();
  
  // Хуки для управления темой
  const { setColorScheme } = useMantineColorScheme();
  const computedColorScheme = useComputedColorScheme('light', { getInitialValueInEffect: true });

  const toggleColorScheme = () => {
    setColorScheme(computedColorScheme === 'dark' ? 'light' : 'dark');
  };

  return (
    <AppShell
      header={{ height: 56 }}
      navbar={{ width: 260, breakpoint: "sm" }}
      padding="md"
    >
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between">
          <Text fw={700}>Admissions Dashboard</Text>
          
          {/* Кнопка переключения темы */}
          <ActionIcon
            onClick={toggleColorScheme}
            variant="default"
            size="lg"
            aria-label="Toggle color scheme"
          >
            {computedColorScheme === 'dark' ? (
              <IconSun stroke={1.5} />
            ) : (
              <IconMoon stroke={1.5} />
            )}
          </ActionIcon>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p="md">
        <NavLink
          label="Dashboard"
          leftSection={<IconChartBar size={18} />}
          active={loc.pathname === "/"}
          onClick={() => nav("/")}
          variant="light" 
        />
        <NavLink
          label="Import"
          leftSection={<IconUpload size={18} />}
          active={loc.pathname === "/import"}
          onClick={() => nav("/import")}
          variant="light"
        />
      </AppShell.Navbar>

      <AppShell.Main>
        <Outlet />
      </AppShell.Main>
    </AppShell>
  );
}