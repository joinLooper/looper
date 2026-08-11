import type { Metadata } from "next";
import { DemoStatusPage } from "../../components/demo-status-page";

export const metadata: Metadata = {
  title: "服務條款｜Looper",
  description: "Looper 展示版本的服務條款頁面說明。",
};

export default function TermsPage() {
  return (
    <DemoStatusPage
      title="服務條款"
      description="Looper 目前為展示版本。正式服務開放前，將於此頁提供完整服務條款與使用規範。"
    />
  );
}
