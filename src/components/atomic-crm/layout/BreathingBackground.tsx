import { useTheme } from "@/components/admin/use-theme";

// Three soft fields of colour behind the app that slowly swell and fade, one after another, so the glass in
// front of them always has something living to refract. There are no points, lines or shapes to follow, only
// light that changes more slowly than the eye tracks. It is plain CSS (see .breathing in index.css), so it
// costs next to nothing. The person can turn it off under Appearance, and it starts off for anyone whose
// device asks for less motion.
export const BreathingBackground = () => {
  const { motion } = useTheme();
  if (motion !== "on") return null;
  return (
    <div aria-hidden="true" className="breathing">
      <i />
      <i />
      <i />
    </div>
  );
};
