export function EmeraldCopper() {
  const c = {
    bg: "#F0F7F4",
    primary: "#065F46",
    accent: "#B87333",
    card: "#FFFFFF",
    border: "#D1EAE0",
    muted: "#6B7280",
    text: "#111827",
  };

  return (
    <div style={{ minHeight: "100vh", background: c.bg, fontFamily: "system-ui, sans-serif", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ width: 390, background: c.bg, minHeight: "100vh", position: "relative" }}>
        {/* Header */}
        <div style={{ background: c.primary, padding: "48px 20px 20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <p style={{ color: "rgba(255,255,255,0.7)", fontSize: 13, margin: 0 }}>Merhaba ✂️</p>
              <p style={{ color: "#fff", fontSize: 22, fontWeight: 700, margin: "4px 0 0" }}>3 Mayıs Sal.</p>
            </div>
            <div style={{ background: c.accent, borderRadius: 10, padding: "6px 12px" }}>
              <span style={{ color: "#fff", fontWeight: 700, fontSize: 13 }}>Tıraş</span>
            </div>
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
            {[["4","Günlük"],["1","Bekleyen"],["0","Tamamlanan"],["0","İptal"]].map(([n,l]) => (
              <div key={l} style={{ flex: 1, background: "rgba(255,255,255,0.12)", borderRadius: 10, padding: "10px 0", textAlign: "center" }}>
                <div style={{ color: "#fff", fontWeight: 700, fontSize: 20 }}>{n}</div>
                <div style={{ color: "rgba(255,255,255,0.65)", fontSize: 10 }}>{l}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Next appointment card */}
        <div style={{ margin: 16 }}>
          <div style={{ background: `linear-gradient(135deg, ${c.primary}, #047857)`, borderRadius: 14, padding: 18 }}>
            <p style={{ color: "rgba(255,255,255,0.65)", fontSize: 12, margin: 0 }}>Sıradaki Randevu</p>
            <p style={{ color: "#fff", fontSize: 26, fontWeight: 800, margin: "6px 0 0" }}>20:00 — 21:00</p>
            <p style={{ color: "#6EE7B7", fontSize: 14, margin: "4px 0 0" }}>Mehmet Yılmaz</p>
          </div>
        </div>

        <p style={{ color: c.text, fontWeight: 700, fontSize: 15, margin: "8px 16px 10px" }}>Bugünün Randevuları</p>
        {[
          ["10:00","11:00","Mehmet Yılmaz","iptal", "#EF4444"],
          ["11:00","12:00","Mehmet Yılmaz","iptal", "#EF4444"],
          ["20:00","21:00","Mehmet Yılmaz","onaylı", "#065F46"],
          ["21:00","22:00","Mehmet Yılmaz","iptal", "#EF4444"],
        ].map(([s,e,name,status,color]) => (
          <div key={s} style={{ margin: "0 16px 8px", background: c.card, borderRadius: 12, padding: 14, border: `1px solid ${c.border}`, display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ background: color + "22", borderRadius: 8, padding: "6px 10px", minWidth: 48, textAlign: "center" }}>
              <div style={{ color, fontSize: 12, fontWeight: 700 }}>{s}</div>
              <div style={{ color: c.muted, fontSize: 10 }}>{e}</div>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: 14, color: c.text }}>{name}</div>
              <div style={{ fontSize: 11, color: c.muted }}>05531234567</div>
            </div>
            <div style={{ background: color + "22", borderRadius: 6, padding: "4px 10px" }}>
              <span style={{ color, fontSize: 11, fontWeight: 600 }}>{status}</span>
            </div>
          </div>
        ))}

        {/* Bottom nav */}
        <div style={{ position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)", width: 390, background: c.card, borderTop: `1px solid ${c.border}`, display: "flex", justifyContent: "space-around", padding: "10px 0 20px" }}>
          {["Özet","Slotlar","Mesajlar","Profil"].map((tab, i) => (
            <div key={tab} style={{ textAlign: "center" }}>
              <div style={{ width: 22, height: 22, borderRadius: 4, background: i === 0 ? c.primary : c.border, margin: "0 auto 2px" }} />
              <div style={{ fontSize: 11, color: i === 0 ? c.primary : c.muted, fontWeight: i === 0 ? 700 : 400 }}>{tab}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
