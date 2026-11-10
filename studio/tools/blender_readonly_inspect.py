"""唯讀 Blender 母件稽核。執行方式參閱 studio/README.md。

此工具不輸出新角色、不修改 .blend、不自動給藝術 PASS。
"""
import argparse
import hashlib
import json
from pathlib import Path
import sys

try:
    import bpy  # type: ignore
except ImportError as exc:
    raise SystemExit("本工具必須透過 Blender --background --python 執行") from exc


def main():
    args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--report", required=True)
    parsed = parser.parse_args(args)
    master = Path(bpy.data.filepath)
    if not master.is_file():
        raise SystemExit("請先透過 Blender 開啟實際 .blend 母件；不能稽核空白專案")
    objects = []
    warnings = []
    for ob in bpy.data.objects:
        item = {
            "name": ob.name, "type": ob.type,
            "parent": ob.parent.name if ob.parent else None,
            "visibleInRender": not ob.hide_render,
            "materials": [mat.name for mat in getattr(ob.data, "materials", []) if mat],
        }
        if ob.type == "MESH":
            item["vertices"] = len(ob.data.vertices)
            item["polygons"] = len(ob.data.polygons)
        if ob.type == "ARMATURE":
            item["bones"] = [bone.name for bone in ob.data.bones]
        objects.append(item)
    images = []
    for image in bpy.data.images:
        path = bpy.path.abspath(image.filepath) if image.filepath else None
        packed = bool(image.packed_file)
        missing = bool(path and not packed and not Path(path).is_file())
        images.append({"name": image.name, "packed": packed,
                       "externalFile": Path(path).name if path else None, "missing": missing})
        if missing:
            warnings.append(f"貼圖遺失：{image.name}")
    result = {
        "status": "SOURCE_INSPECTED__ART_NOT_VERIFIED",
        "masterFilename": master.name,
        "masterSha256": hashlib.sha256(master.read_bytes()).hexdigest(),
        "objectCount": len(objects), "objects": objects,
        "actions": [action.name for action in bpy.data.actions],
        "images": images, "warnings": warnings,
        "notValidated": ["Character Canon 視覺一致性", "FSSL 美術完成度",
                         "原生母件藝術核准", "App 場景融合", "角色可用動畫"],
    }
    out = Path(parsed.report)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print("已產出唯讀母件檢查報告：" + str(out))
    return 0 if not warnings else 3


if __name__ == "__main__":
    raise SystemExit(main())
