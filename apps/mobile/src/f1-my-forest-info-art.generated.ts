/** F1-MY-FOREST-INFO-REBUILD-02 candidate art slots ONLY.
 * The handoff ZIP exists as a reference but its actual bytes have not been
 * accessible for hash or pixel-content validation in this environment.
 * Never substitute PR63 sprout-info sprites, main-scene sapling candidates,
 * the undimmed Forest screenshot, or a recreated marmot group here.
 *
 * After ART_REVIEWED and verified original bytes, a separate guarded ingest
 * can populate these literal Metro require() references. Until then, null.
 */
import type { ImageSourcePropType } from "react-native";
export const F1_MY_FOREST_DIM_BACKGROUND: ImageSourcePropType|null=null;
export const F1_MY_FOREST_STATIC_GROUP: ImageSourcePropType|null=null;

export const F1_MY_FOREST_STAGE_ART: Readonly<{
  stage01:ImageSourcePropType|null;
  stage02Bright:ImageSourcePropType|null;
  stage02Dim:ImageSourcePropType|null;
  stage03Bright:ImageSourcePropType|null;
  stage03Dim:ImageSourcePropType|null;
  stage04Bright:ImageSourcePropType|null;
  stage04Dim:ImageSourcePropType|null;
  stage05Bright:ImageSourcePropType|null;
  stage05Dim:ImageSourcePropType|null;
}>=Object.freeze({
  stage01:null,
  stage02Bright:null,stage02Dim:null,
  stage03Bright:null,stage03Dim:null,
  stage04Bright:null,stage04Dim:null,
  stage05Bright:null,stage05Dim:null,
});
