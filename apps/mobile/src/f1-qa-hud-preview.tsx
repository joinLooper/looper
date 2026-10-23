import React from "react";
import {Image, StyleSheet, Text, View, type ImageSourcePropType} from "react-native";
import {f1CoverTransform, f1Frame} from "./f1-scene-projection";

/** Existing 2-row HUD art is CANDIDATE. This renderer previews it only with
 * the existing QA gate. It never creates rewards or updates CO2e. */
export function F1QaHudPreview({
  width,height,topSafe,level,exp,stars,energy,energyVisible,source,qaAllowed
}:{
  width:number;height:number;topSafe:number;
  level:number;exp:number;stars:number;energy:number;energyVisible:boolean;
  source:ImageSourcePropType|null;qaAllowed:boolean;
}) {
  if(!qaAllowed || !source) return null;
  const base=f1Frame("hud",width,height);
  const designScale=f1CoverTransform(width,height).scale;
  const top=Math.max(topSafe+8,base.top);
  const font=Math.max(11,Math.min(17,26*designScale));
  return (
    <View pointerEvents="none" testID="f1-qa-hud-image"
      style={[styles.shell,{left:Math.max(12,base.left),top,width:Math.min(base.width,width-24),height:base.height}]}>
      <Image source={source} resizeMode="stretch" style={styles.back}/>
      <Text style={[styles.label,{left:"12%",top:"15%",fontSize:font}]}>Lv {level}</Text>
      <Text style={[styles.label,{left:"39%",top:"15%",fontSize:font}]}>EXP {exp}</Text>
      <Text style={[styles.label,{left:"84%",top:"15%",fontSize:font}]}>{stars}</Text>
      <Text style={[styles.label,{left:"21%",top:"60%",fontSize:font*.82}]}>距離下一株小樹苗</Text>
      <Text style={[styles.label,{left:"75%",top:"60%",fontSize:font*.82}]}>0.0 / 2.0 kg</Text>
      {energyVisible && <Text style={[styles.energy,{fontSize:Math.max(10,font*.7)}]}>⚡ {energy}（QA）</Text>}
      <Text style={[styles.candidate,{fontSize:Math.max(9,font*.55)}]}>HUD ART CANDIDATE · QA 數值</Text>
    </View>
  );
}
const styles=StyleSheet.create({
  shell:{position:"absolute",overflow:"visible",zIndex:80},
  back:{position:"absolute",width:"100%",height:"100%"},
  label:{position:"absolute",color:"#4F371F",fontWeight:"700",textShadowColor:"#FAE8B6",textShadowRadius:1},
  energy:{position:"absolute",top:"-10%",right:0,color:"#FFF3D5"},
  candidate:{position:"absolute",left:0,top:"101%",color:"#FBEDCB"},
});
