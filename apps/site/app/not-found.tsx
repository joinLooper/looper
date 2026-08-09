import { DemoStatusPage } from "../components/demo-status-page";

export default function NotFound() {
  return (
    <DemoStatusPage
      eyebrow="404"
      title="找不到這個頁面"
      description="這個網址可能已經變更，或頁面目前不存在。請返回首頁繼續瀏覽 Looper。"
    />
  );
}
