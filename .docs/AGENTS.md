# Agent Rolleri ve Erişim Haritası

## Genel kurallar
- Hiçbir agent CONSTITUTION.md'deki onaylanmış kararları değiştiremez
- API key ve secret'lar hiçbir zaman kaynak koda girmez
- Detaylı yetkiler her agent'ın kendi persona dosyasında tanımlıdır

## Çekirdek agent'lar (her projede var)

| Agent | Erişim | Persona | Tetikleme |
|-------|--------|---------|-----------|
| project-manager | Tüm proje (read), agent memory (write) | `.claude/agents/project-manager.md` | Otomatik / manuel |
| solution-architect | Tüm proje (read), `.docs/` mimari (write), `.specify/specs/` (write) | `.claude/agents/solution-architect.md` | Manuel (kritik kararlar) |
| meeting-agent | `.docs/meetings/**` (write), `.docs/**` (read) | `.claude/agents/meeting-agent.md` | Transkript geldiğinde |
| ui-ux-agent | Proje (read), `.docs/` (write — UIUX-NNN.md için), Figma (read), agent memory (write) | `.claude/agents/ui-ux-agent.md` | Spec → impl arası |
| review-agent | Tüm proje (read-only), agent memory (write) | `.claude/agents/review-agent.md` | **Opsiyonel** |
| qa-engineer | Tüm proje (read-only), agent memory (write) | `.claude/agents/qa-engineer.md` | **Opsiyonel** |

## Stack agent'ları (profil overlay'den gelir)

Profile göre değişir. Web fullstack profilinde:

| Agent | Erişim | Persona |
|-------|--------|---------|
| frontend-agent | `src/web/**` veya `app/**` (write), `.docs/**` `.specify/**` (read) | `.claude/agents/frontend-agent.md` |
| backend-agent | `src/api/**` (write), `.docs/**` `.specify/**` (read) | `.claude/agents/backend-agent.md` |

Mobile profilinde:

| Agent | Erişim | Persona |
|-------|--------|---------|
| mobile-agent | `src/**` veya `app/**` (write), `.docs/**` `.specify/**` (read) | `.claude/agents/mobile-agent.md` |

## Cross-agent kuralları
- **API kontrat değişikliği:** backend-agent, frontend-agent ve mobile-agent karşılıklı bildirim gerektirir
- **Mimari karar:** Yeni pattern, yeni bağımlılık, API kontrat değişikliği veya veritabanı şema değişikliğinde solution-architect dahil edilir
- **UI/UX — Figma var:** frontend-agent implementasyon → ui-ux-agent uyum kontrolü (maks. 3 iterasyon)
- **UI/UX — Figma yok:** implementation öncesi ui-ux-agent tasarım kararı verir (UIUX-NNN.md), sonra aynı 3 iterasyon kuralı

## Opsiyonel adımlar nasıl çalışır
- **review-agent ve qa-engineer otomatik tetiklenmez.** Sen "review et" veya "qa yap" dediğinde çalışır.
- Production-grade hedefliyorsan her PR öncesi ikisini de çalıştır.
- Hızlı iterasyonda ikisini de atlayabilirsin — kalite kontrolü kendi sorumluluğundadır.
