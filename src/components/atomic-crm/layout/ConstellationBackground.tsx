import { useEffect, useRef } from "react";

import { useTheme } from "@/components/admin/use-theme";

// A slow constellation behind the app: points that drift and draw a faint link when two pass close,
// mostly blue with a few coral. It is drawn in SVG, sits under every surface, and uses no more than about
// thirty frames a second. It stops when the tab is hidden, and the person can turn it off in their profile
// (it starts off for anyone whose device asks for less motion).
const SVG = "http://www.w3.org/2000/svg";
const FRAME_MS = 1000 / 30;

type Node = { x: number; y: number; vx: number; vy: number; el: SVGGElement };

export const ConstellationBackground = () => {
  const { motion } = useTheme();
  const ref = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const svg = ref.current;
    if (!svg || motion !== "on") return;
    const w = () => window.innerWidth;
    const h = () => window.innerHeight;
    const count = w() < 700 ? 11 : 18;
    svg.replaceChildren();

    const links = document.createElementNS(SVG, "g");
    const dots = document.createElementNS(SVG, "g");
    svg.append(links, dots);

    const nodes: Node[] = Array.from({ length: count }, (_, i) => {
      // Placed from a fixed pattern, so the picture is the same each time the app opens.
      const el = document.createElementNS(SVG, "g");
      const colour = i % 5 === 2 ? "var(--coral)" : "var(--primary)";
      const halo = document.createElementNS(SVG, "circle");
      halo.setAttribute("r", "10");
      halo.setAttribute("fill", colour);
      halo.setAttribute("opacity", "0.12");
      const dot = document.createElementNS(SVG, "circle");
      dot.setAttribute("r", "2.6");
      dot.setAttribute("fill", colour);
      dot.setAttribute("opacity", "0.7");
      el.append(halo, dot);
      dots.append(el);
      return {
        x: (((i * 37) % 97) / 97) * w(),
        y: (((i * 53) % 89) / 89) * h(),
        vx: ((((i * 7) % 11) - 5) / 5) * 0.2,
        vy: ((((i * 5) % 13) - 6) / 6) * 0.2,
        el,
      };
    });

    const pairs: { a: Node; b: Node; line: SVGLineElement }[] = [];
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const line = document.createElementNS(SVG, "line");
        line.setAttribute("stroke", "var(--primary)");
        line.setAttribute("stroke-width", "1");
        line.setAttribute("opacity", "0");
        links.append(line);
        pairs.push({ a: nodes[i], b: nodes[j], line });
      }
    }

    const draw = (step: boolean) => {
      const width = w();
      const height = h();
      for (const n of nodes) {
        if (step) {
          n.x += n.vx;
          n.y += n.vy;
          if (n.x < 0 || n.x > width) n.vx *= -1;
          if (n.y < 0 || n.y > height) n.vy *= -1;
        }
        n.el.setAttribute(
          "transform",
          `translate(${n.x.toFixed(1)} ${n.y.toFixed(1)})`,
        );
      }
      const reach = Math.max(width, height) * 0.2;
      for (const { a, b, line } of pairs) {
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        if (dist < reach) {
          line.setAttribute("x1", a.x.toFixed(1));
          line.setAttribute("y1", a.y.toFixed(1));
          line.setAttribute("x2", b.x.toFixed(1));
          line.setAttribute("y2", b.y.toFixed(1));
          line.setAttribute("opacity", ((1 - dist / reach) * 0.35).toFixed(2));
        } else {
          line.setAttribute("opacity", "0");
        }
      }
    };

    draw(false);
    let raf = 0;
    let last = 0;
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      if (now - last < FRAME_MS) return;
      last = now;
      draw(true);
    };
    raf = requestAnimationFrame(tick);
    const onVisibility = () => {
      cancelAnimationFrame(raf);
      if (!document.hidden) raf = requestAnimationFrame(tick);
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [motion]);

  if (motion !== "on") return null;
  return (
    <svg
      ref={ref}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 -z-[1] h-full w-full"
      width="100%"
      height="100%"
    />
  );
};
