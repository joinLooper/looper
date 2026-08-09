import type { Metadata } from "next";
import { DemoStatusPage } from "../../components/demo-status-page";

export const metadata: Metadata = {
  title: "隱私權政策｜Looper",
  description: "Looper 展示版本的隱私權政策頁面說明。",
};

export default function PrivacyPage() {
  return (
    <DemoStatusPage
      title="隱私權政策"
      description="Looper 目前為展示版本。正式營運與資料蒐集功能啟用前，將於此頁提供完整隱私權政策與個人資料使用說明。"
    />
  );
}
