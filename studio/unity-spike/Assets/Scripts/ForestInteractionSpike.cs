using UnityEngine;

namespace Looper.StudioSpike
{
    /// <summary>
    /// Engineering-only interaction proof. No official Looper artwork is included.
    /// The final forest visuals must come from the approved editable asset masters.
    /// </summary>
    public sealed class ForestInteractionSpike : MonoBehaviour
    {
        private bool bookOpen;
        private int openCount;

        private void Update()
        {
            if (bookOpen && Input.GetKeyDown(KeyCode.Escape))
                bookOpen = false;
        }

        private static void Fill(Rect rect, Color color)
        {
            Color before = GUI.color;
            GUI.color = color;
            GUI.DrawTexture(rect, Texture2D.whiteTexture);
            GUI.color = before;
        }

        private void OnGUI()
        {
            // A mobile-portrait interaction test, never a style reference.
            float width = Screen.width;
            float height = Screen.height;
            float unit = Mathf.Min(width / 400f, height / 780f);
            GUIStyle heading = new GUIStyle(GUI.skin.label) { fontSize = Mathf.RoundToInt(17 * unit), fontStyle = FontStyle.Bold, wordWrap = true };
            GUIStyle body = new GUIStyle(GUI.skin.label) { fontSize = Mathf.RoundToInt(13 * unit), wordWrap = true };
            GUIStyle button = new GUIStyle(GUI.skin.button) { fontSize = Mathf.RoundToInt(15 * unit), wordWrap = true };

            Fill(new Rect(0, 0, width, height), new Color(0.42f, 0.51f, 0.43f, 1f));
            GUI.Label(new Rect(width * .07f, height * .09f, width * .86f, 60 * unit),
                      "FOREST / ENGINEERING SPIKE", heading);
            GUI.Label(new Rect(width * .07f, height * .17f, width * .86f, 90 * unit),
                      "工程隔離測試：不是核准的森林圖、角色模型或正式 UI。\n點擊書本插槽，檢查背景變暗與安全返回。", body);
            float bookWidth = Mathf.Max(140 * unit, width * .48f);
            if (!bookOpen && GUI.Button(new Rect((width-bookWidth)/2f, height * .48f, bookWidth, 68 * unit), "開啟知識小書（操作代理）", button))
            {
                bookOpen = true;
                openCount++;
            }
            GUI.Label(new Rect(width * .07f, height * .85f, width * .86f, 60 * unit),
                      "互動開啟次數（僅本機測試）：" + openCount, body);

            if (bookOpen)
            {
                // The scene remains in place; only an overlay dims it.
                Fill(new Rect(0, 0, width, height), new Color(0f, 0f, 0f, 0.68f));
                Rect panel = new Rect(width * .08f, height * .28f, width * .84f, height * .46f);
                Fill(panel, new Color(.90f, .85f, .74f, 1f));
                GUI.Label(new Rect(panel.x + 18*unit, panel.y + 22*unit, panel.width - 36*unit, 90*unit),
                          "知識小書：事件狀態測試", heading);
                GUI.Label(new Rect(panel.x + 18*unit, panel.y + 110*unit, panel.width - 36*unit, panel.height*.35f),
                          "僅證明開啟 → 暗背景 → 收合 → 返回森林的流程。\n正式視覺應使用已核准的可編輯書頁母件。", body);
                if (GUI.Button(new Rect(panel.x + panel.width * .15f,
                                        panel.yMax - 90*unit, panel.width * .70f, 58*unit), "收起小書，返回森林", button))
                    bookOpen = false;
            }
        }
    }
}
