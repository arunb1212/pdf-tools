import { useRef, useState } from "react";

export interface FeatureCardData {
  icon: string;
  title: string;
  desc: string;
}

const ICONS: Record<string, React.ReactNode> = {
  lock: (
    <>
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </>
  ),
  bolt: <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />,
  shield: (
    <>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <path d="M9 12l2 2 4-4" />
    </>
  ),
  table: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <line x1="3" y1="9" x2="21" y2="9" />
      <line x1="3" y1="15" x2="21" y2="15" />
      <line x1="9" y1="3" x2="9" y2="21" />
    </>
  ),
  pen: (
    <>
      <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
    </>
  ),
  globe: (
    <>
      <circle cx="12" cy="12" r="10" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </>
  ),
};

function Icon({ name }: { name: string }) {
  return (
    <svg
      className="feature-icon__svg"
      width="28"
      height="28"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {ICONS[name] ?? ICONS.bolt}
    </svg>
  );
}

/**
 * 3D tilt-on-hover card. Subtle, respects prefers-reduced-motion.
 */
export default function TiltCard({ title, desc, icon }: FeatureCardData) {
  const ref = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<React.CSSProperties>({});

  function onMove(e: React.MouseEvent) {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const rect = el.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width - 0.5;
    const py = (e.clientY - rect.top) / rect.height - 0.5;
    const rotX = -py * 10;
    const rotY = px * 10;
    setStyle({
      transform: `perspective(900px) rotateX(${rotX}deg) rotateY(${rotY}deg) translateZ(0)`,
    });
  }

  function onLeave() {
    setStyle({ transform: "perspective(900px) rotateX(0) rotateY(0)" });
  }

  return (
    <div
      ref={ref}
      className="tilt-card"
      style={style}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
    >
      <div className="feature-icon" aria-hidden="true">
        <Icon name={icon} />
      </div>
      <div className="tilt-card__glow" aria-hidden="true" />
      <h3>{title}</h3>
      <p>{desc}</p>
    </div>
  );
}
