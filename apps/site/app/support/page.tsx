import type { Metadata } from "next";
import { DemoStatusPage } from "../../components/demo-status-page";

export const metadata: Metadata = {
  title: "支援與協助｜Looper",
  description: "Looper 展示版本的支援與協助頁面說明。",
};

export default function SupportPage() {
  return (
    <DemoStatusPage
      title="支援與協助"
      description="Looper 目前為展示版本。正式服務開放後，將於此頁提供聯絡方式、常見問題與使用協助。"
    />
  );
}
