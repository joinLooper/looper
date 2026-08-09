import type { Metadata } from "next";
import { DemoStatusPage } from "../../components/demo-status-page";

export const metadata: Metadata = {
  title: "帳號與資料權利｜Looper",
  description: "Looper 展示版本的帳號與資料權利頁面說明。",
};

export default function AccountDataRightsPage() {
  return (
    <DemoStatusPage
      title="帳號與資料權利"
      description="Looper 目前為展示版本。正式帳號與資料服務啟用前，將於此頁提供帳號刪除、資料查詢與相關權利說明。"
    />
  );
}
