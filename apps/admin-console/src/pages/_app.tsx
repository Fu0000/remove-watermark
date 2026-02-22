import "antd/dist/reset.css";
import "@/styles/admin-theme.css";
import type { AppProps } from "next/app";
import { ConfigProvider } from "antd";

export default function App({ Component, pageProps }: AppProps) {
  return (
    <ConfigProvider
      theme={{
        token: {
          colorPrimary: "#2563eb",
          colorInfo: "#2563eb",
          borderRadius: 12,
          fontFamily: "'Noto Sans SC', 'PingFang SC', 'Hiragino Sans GB', sans-serif"
        },
        components: {
          Card: {
            borderRadiusLG: 16
          },
          Table: {
            borderColor: "#d8e0ec"
          }
        }
      }}
    >
      <Component {...pageProps} />
    </ConfigProvider>
  );
}
