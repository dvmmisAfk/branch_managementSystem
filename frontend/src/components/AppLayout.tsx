import { Layout, Menu, Spin, Button, Drawer, Grid } from "antd";
import {
  LayoutDashboard,
  ClipboardList,
  Users,
  Building2,
  LogOut,
  Menu as MenuIcon,
} from "lucide-react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { ApiError, apiFetch, clearTokens } from "../api/client";

const { useBreakpoint } = Grid;
const { Header, Content } = Layout;

type Me = { id: string; email: string; name: string; role: string };

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const screens = useBreakpoint();
  const isMobile = !screens.md;
  const [me, setMe] = useState<Me | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    apiFetch<Me>("/auth/me")
      .then((u) => {
        if (!cancelled) setMe(u);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setMe(null);
        if (e instanceof ApiError && e.status === 401) {
          clearTokens();
          navigate("/login", { replace: true });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  function logout() {
    clearTokens();
    navigate("/login", { replace: true });
  }

  const path = location.pathname;
  const selected =
    path.startsWith("/visits") ? ["/visits"]
    : path.startsWith("/sfhs") ? ["/sfhs"]
    : path.startsWith("/branches") ? ["/branches"]
    : ["/dashboard"];

  const baseItems = [
    { key: "/dashboard", icon: <LayoutDashboard size={16} />, label: "Dashboard" },
    { key: "/visits", icon: <ClipboardList size={16} />, label: "Visits" },
  ];

  const supervisorItems =
    me?.role === "supervisor"
      ? [
          { key: "/sfhs", icon: <Users size={16} />, label: "SFH Management" },
          { key: "/branches", icon: <Building2 size={16} />, label: "Branches" },
        ]
      : [];

  const menuItems = [...baseItems, ...supervisorItems];

  const onMenuNav = (key: string) => {
    navigate(key);
    setDrawerOpen(false);
  };

  const desktopMenu = (
    <Menu
      theme="dark"
      mode="horizontal"
      selectedKeys={selected}
      items={menuItems}
      style={{
        flex: 1,
        minWidth: 0,
        background: "transparent",
        borderBottom: "none",
        lineHeight: "56px",
      }}
      onClick={({ key }) => onMenuNav(key)}
    />
  );

  const mobileMenu = (
    <Menu
      theme="light"
      mode="vertical"
      selectedKeys={selected}
      items={menuItems}
      style={{ borderInlineEnd: "none" }}
      onClick={({ key }) => onMenuNav(key)}
    />
  );

  return (
    <Layout style={{ minHeight: "100vh", overflowX: "hidden" }}>
      <Header
        style={{
          display: "flex",
          alignItems: "center",
          gap: isMobile ? 8 : 16,
          paddingInline: isMobile ? 12 : 20,
          paddingLeft: "max(12px, env(safe-area-inset-left))",
          paddingRight: "max(12px, env(safe-area-inset-right))",
          background: "#1E1B4B",
          height: 56,
          lineHeight: "56px",
          position: "sticky",
          top: 0,
          zIndex: 100,
        }}
      >
        {isMobile && (
          <Button
            type="text"
            aria-label="Open menu"
            icon={<MenuIcon size={20} color="#fff" />}
            onClick={() => setDrawerOpen(true)}
            style={{ color: "#fff", flexShrink: 0 }}
          />
        )}

        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0, minWidth: 0 }}>
          <Building2 size={18} color="#fff" style={{ flexShrink: 0 }} />
          <span
            style={{
              color: "#fff",
              fontWeight: 600,
              fontSize: isMobile ? 14 : 15,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {isMobile ? "Visit Tracker" : "Branch Visit Tracker"}
          </span>
        </div>

        {!isMobile && desktopMenu}

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            flexShrink: 0,
            marginLeft: "auto",
            minWidth: 0,
          }}
        >
          {me ? (
            <>
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: "50%",
                  background: "#4F46E5",
                  color: "#fff",
                  fontSize: 13,
                  fontWeight: 600,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                {getInitials(me.name)}
              </div>
              {!isMobile && (
                <span
                  style={{
                    color: "rgba(255,255,255,.85)",
                    fontSize: 13,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    maxWidth: 160,
                  }}
                >
                  {me.name} ({me.role})
                </span>
              )}
            </>
          ) : (
            <Spin size="small" />
          )}
          <Button
            size="small"
            onClick={logout}
            style={{
              border: "1px solid rgba(255,255,255,0.3)",
              color: "#fff",
              background: "transparent",
              display: "flex",
              alignItems: "center",
              gap: 4,
              flexShrink: 0,
            }}
            icon={<LogOut size={13} />}
          >
            {!isMobile ? "Log out" : ""}
          </Button>
        </div>
      </Header>

      <Drawer
        title="Navigation"
        placement="left"
        width={280}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        styles={{ body: { padding: 0 } }}
      >
        {mobileMenu}
      </Drawer>

      <Content
        style={{
          paddingTop: isMobile ? 12 : 24,
          paddingBottom: `max(${isMobile ? 20 : 24}px, env(safe-area-inset-bottom, 0px))`,
          paddingLeft: `max(${isMobile ? 12 : 24}px, env(safe-area-inset-left, 0px))`,
          paddingRight: `max(${isMobile ? 12 : 24}px, env(safe-area-inset-right, 0px))`,
          background: "#F9FAFB",
          minHeight: "calc(100vh - 56px)",
          maxWidth: "100vw",
          boxSizing: "border-box",
        }}
      >
        <Outlet />
      </Content>
    </Layout>
  );
}
