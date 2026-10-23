/** Logo +Aura com o selo do produto (mesmo desenho do +Aura Hospeda e do CRM). */
export function Logo({ height = 28 }: { height?: number }) {
  return (
    <span className="inline-flex items-center gap-2.5" style={{ height }}>
      <span className="inline-flex items-center overflow-visible" style={{ height }}>
        {/* O SVG oficial tem margem para o brilho; o recorte alinha o wordmark. */}
        <img src="/brand/mais-aura-logo.svg" alt="+Aura" style={{ height: height * 2.35, margin: `0 0 0 ${-height * 0.27}px`, maxWidth: 'none' }} />
      </span>
      <span
        className="rounded-full border border-line bg-surface-sunken px-2 py-0.5 font-semibold tracking-[0.02em] text-text-2"
        style={{ fontSize: Math.max(11, height * 0.4) }}
      >
        Arquivos
      </span>
    </span>
  )
}
