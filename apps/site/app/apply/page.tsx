import type { Metadata } from "next";
import { ApplyForm } from "./apply-form";

export const metadata: Metadata = {
  title: "合作申請｜Looper",
  description:
    "填寫店家與合作需求，申請成為 Looper 合作店家、玩家任務據點或星星兌換夥伴。",
};

export default function ApplyPage() {
  const lineOaUrl = process.env.PUBLIC_LINE_OA_URL;

  return <ApplyForm lineOaUrl={lineOaUrl} />;
}
