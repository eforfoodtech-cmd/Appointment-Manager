import React from "react";
import { StyleSheet, View } from "react-native";
import colors from "@/constants/colors";

const c = colors.light;

type GrainDot = {
  left: `${number}%`;
  top: `${number}%`;
  size: number;
  opacity: number;
};

const GRAIN_DOTS: GrainDot[] = Array.from({ length: 72 }, (_, index) => {
  const left = ((index * 37) % 101) as number;
  const top = ((index * 53 + 11) % 101) as number;
  const size = index % 5 === 0 ? 2 : 1;
  const opacity = 0.05 + ((index * 7) % 8) / 100;

  return {
    left: `${left}%` as `${number}%`,
    top: `${top}%` as `${number}%`,
    size,
    opacity,
  };
});

export function AuthBackgroundTexture() {
  return (
    <View pointerEvents="none" style={styles.texture}>
      {GRAIN_DOTS.map((dot, index) => (
        <View
          key={index}
          style={[
            styles.grainDot,
            {
              left: dot.left,
              top: dot.top,
              width: dot.size,
              height: dot.size,
              borderRadius: dot.size / 2,
              opacity: dot.opacity,
            },
          ]}
        />
      ))}

      <View style={[styles.paperBand, styles.paperBandTop]} />
      <View style={[styles.paperBand, styles.paperBandBottom]} />

      <View style={[styles.stripe, styles.stripeRed, styles.stripeOne]} />
      <View style={[styles.stripe, styles.stripeBlue, styles.stripeTwo]} />
      <View style={[styles.stripe, styles.stripeGold, styles.stripeThree]} />
      <View style={[styles.stripeThin, styles.stripeRed, styles.stripeFour]} />
      <View style={[styles.stripeThin, styles.stripeBlue, styles.stripeFive]} />

      <View style={[styles.rule, styles.ruleOne]} />
      <View style={[styles.rule, styles.ruleTwo]} />
      <View style={[styles.rule, styles.ruleThree]} />
    </View>
  );
}

const styles = StyleSheet.create({
  texture: {
    ...StyleSheet.absoluteFillObject,
    overflow: "hidden",
  },
  grainDot: {
    position: "absolute",
    backgroundColor: c.primary,
  },
  paperBand: {
    position: "absolute",
    width: 760,
    height: 130,
    backgroundColor: c.card,
    opacity: 0.55,
    transform: [{ rotate: "-16deg" }],
  },
  paperBandTop: {
    top: 42,
    left: -160,
  },
  paperBandBottom: {
    bottom: 68,
    right: -180,
  },
  stripe: {
    position: "absolute",
    width: 720,
    height: 8,
    opacity: 0.18,
    transform: [{ rotate: "-18deg" }],
  },
  stripeThin: {
    position: "absolute",
    width: 640,
    height: 3,
    opacity: 0.2,
    transform: [{ rotate: "-18deg" }],
  },
  stripeRed: { backgroundColor: "#C94B4B" },
  stripeBlue: { backgroundColor: "#2F5F8F" },
  stripeGold: { backgroundColor: c.accent },
  stripeOne: { top: 104, left: -210 },
  stripeTwo: { top: 126, left: -190 },
  stripeThree: { top: 148, left: -170 },
  stripeFour: { bottom: 180, right: -190 },
  stripeFive: { bottom: 158, right: -170 },
  rule: {
    position: "absolute",
    height: 1,
    width: 620,
    backgroundColor: c.border,
    opacity: 0.65,
    transform: [{ rotate: "-18deg" }],
  },
  ruleOne: { top: 260, left: -160 },
  ruleTwo: { top: 292, left: -100 },
  ruleThree: { bottom: 90, right: -160 },
});
