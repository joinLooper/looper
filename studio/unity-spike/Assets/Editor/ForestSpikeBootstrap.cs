#if UNITY_EDITOR
using Looper.StudioSpike;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.SceneManagement;

namespace Looper.StudioSpike.Editor
{
    public static class ForestSpikeBootstrap
    {
        private const string SceneFolder = "Assets/LooperSpike/Scenes";
        private const string ScenePath = SceneFolder + "/ForestInteractionSpike.unity";

        [MenuItem("Looper/Engineering Spike/Create Interaction Scene")]
        public static void CreateIsolatedScene()
        {
            if (!EditorUtility.DisplayDialog(
                "Looper 工程隔離測試",
                "這個操作會建立只有事件代理的森林測試場景；不會匯入或取代 Looper 正式美術。繼續？",
                "建立測試場景", "取消")) return;

            if (!EditorSceneManager.SaveCurrentModifiedScenesIfUserWantsTo()) return;
            if (AssetDatabase.LoadAssetAtPath<SceneAsset>(ScenePath) != null)
            {
                EditorUtility.DisplayDialog("場景已存在",
                    "請手動開啟既有測試場景；工具不會覆寫舊版。", "確定");
                return;
            }
            if (!AssetDatabase.IsValidFolder("Assets/LooperSpike"))
                AssetDatabase.CreateFolder("Assets", "LooperSpike");
            if (!AssetDatabase.IsValidFolder(SceneFolder))
                AssetDatabase.CreateFolder("Assets/LooperSpike", "Scenes");

            Scene scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
            GameObject cameraObject = new GameObject("Engineering Preview Camera");
            Camera camera = cameraObject.AddComponent<Camera>();
            camera.clearFlags = CameraClearFlags.SolidColor;
            camera.backgroundColor = new Color(.42f, .51f, .43f);
            camera.orthographic = true;
            cameraObject.AddComponent<AudioListener>();
            new GameObject("Forest Interaction State - ENGINEERING ONLY")
                .AddComponent<ForestInteractionSpike>();

            EditorSceneManager.MarkSceneDirty(scene);
            if (!EditorSceneManager.SaveScene(scene, ScenePath))
                throw new System.InvalidOperationException("無法儲存工程測試場景");

            AssetDatabase.Refresh();
            Debug.Log("Looper: 工程測試場景已建立。這不是正式美術或 iPhone 實機驗收。");
            EditorGUIUtility.PingObject(AssetDatabase.LoadAssetAtPath<SceneAsset>(ScenePath));
        }
    }
}
#endif
