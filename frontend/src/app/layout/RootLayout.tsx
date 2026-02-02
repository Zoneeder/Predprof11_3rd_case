import { AppShell, NavLink, Group, Text } from "@mantine/core";
import { IconChartBar, IconUpload } from "@tabler/icons-react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";

export function RootLayout() {
  const nav = useNavigate();
  const loc = useLocation();

  return (
    <AppShell
      header={{ height: 56 }}
      navbar={{ width: 260, breakpoint: "sm" }}
      padding="md"
    >
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between">
          <Text fw={700}>Admissions Dashboard</Text>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p="md">
        <NavLink
          label="Dashboard"
          leftSection={<IconChartBar size={18} />}
          active={loc.pathname === "/"}
          onClick={() => nav("/")}
        />
        <NavLink
          label="Import"
          leftSection={<IconUpload size={18} />}
          active={loc.pathname === "/import"}
          onClick={() => nav("/import")}
        />
      </AppShell.Navbar>

      <AppShell.Main>
        <Outlet />
      </AppShell.Main>
    </AppShell>
  );
}
