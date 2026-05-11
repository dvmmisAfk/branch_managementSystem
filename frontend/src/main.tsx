import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App as AntApp, ConfigProvider } from "antd";
import App from "./App.tsx";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ConfigProvider
      theme={{
        token: {
          colorPrimary: "#4F46E5",
          colorLink: "#4F46E5",
          borderRadius: 8,
          borderRadiusLG: 12,
          fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
          colorBgLayout: "#F9FAFB",
          colorBgContainer: "#FFFFFF",
          boxShadow: "0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04)",
        },
        components: {
          Layout: { headerBg: "#1E1B4B", headerHeight: 56 },
          Menu: { darkItemBg: "#1E1B4B", darkItemSelectedBg: "rgba(255,255,255,0.1)", darkItemColor: "#C7D2FE", darkItemHoverColor: "#FFFFFF" },
          Table: { headerBg: "#F9FAFB", rowHoverBg: "#F9FAFB" },
          Card: { borderRadiusLG: 12 },
          Button: { borderRadius: 8 },
          Input: { borderRadius: 8 },
          Select: { borderRadius: 8 },
        },
      }}
    >
      <AntApp>
        <App />
      </AntApp>
    </ConfigProvider>
  </StrictMode>
);
