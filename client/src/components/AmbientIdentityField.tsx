type AmbientIdentityFieldProps = {
  intensity?: number;
  variant?: "landing" | "home" | "data" | "permissions" | "security" | "gateway" | "auth";
};

const particles = Array.from({ length: 14 }, (_, index) => index);

export default function AmbientIdentityField({ intensity = 0.7, variant = "home" }: AmbientIdentityFieldProps) {
  return (
    <div
      className={`ambient-identity-field ambient-identity-field--${variant}`}
      style={{ "--ambient-intensity": Math.max(0.25, Math.min(1, intensity)) } as React.CSSProperties}
      aria-hidden="true"
    >
      <span className="ambient-aurora ambient-aurora--cyan" />
      <span className="ambient-aurora ambient-aurora--violet" />
      <span className="ambient-aurora ambient-aurora--pink" />
      <span className="ambient-network ambient-network--one" />
      <span className="ambient-network ambient-network--two" />
      <span className="ambient-network ambient-network--three" />
      <span className="ambient-field-ring ambient-field-ring--one" />
      <span className="ambient-field-ring ambient-field-ring--two" />
      {particles.map(index => (
        <span key={index} className="ambient-particle" style={{ "--particle-index": index } as React.CSSProperties} />
      ))}
    </div>
  );
}
